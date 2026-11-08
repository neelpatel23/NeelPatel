import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import worker from '../backend/worker.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const ORIGIN = 'https://neeljpatel.com';
const SECRET = 'test-booth-access-key-at-least-32-characters';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xd9]);
function environment() {
  const files = new Map();
  return {
    ALLOWED_ORIGINS: ORIGIN, BOOTH_ACCESS_KEY: SECRET,
    RESEND_API_KEY: 'test-resend', EMAIL_FROM: 'Celebration <photos@example.com>',
    TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'test-token', TWILIO_FROM_NUMBER: '+12195550123',
    MEDIA_SIGNING_SECRET: 'test-media-signing-key-at-least-32-characters',
    SEND_LIMITER: { async limit() { return { success: true }; } },
    PHOTOS: {
      files,
      async put(key, bytes) { files.set(key, { body: bytes, size: bytes.length, uploaded: new Date() }); },
      async get(key) { return files.get(key) || null; },
      async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) files.delete(key); },
      async list() { return { objects: [...files].map(([key, object]) => ({ key, uploaded: object.uploaded })), truncated: false }; },
    },
  };
}
function request({ channel = 'email', recipient = 'guest@example.com', consent = 'true', bytes = jpeg, auth = SECRET, origin = ORIGIN } = {}) {
  const form = new FormData();
  form.set('channel', channel); form.set('recipient', recipient); form.set('consent', consent);
  form.set('photo', new Blob([bytes], { type: 'image/jpeg' }), 'photo.jpg');
  return new Request('https://booth.example/api/deliver', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${auth}` }, body: form });
}
test('rejects unapproved origins and missing organizer authorization', async () => {
  assert.equal((await worker.fetch(request({ origin: 'https://other.example' }), environment())).status, 403);
  assert.equal((await worker.fetch(request({ auth: 'wrong' }), environment())).status, 401);
  const env = environment(); env.BOOTH_ACCESS_KEY = '';
  assert.equal((await worker.fetch(request(), env)).status, 401);
});
test('preflight only allows configured origins', async () => {
  const response = await worker.fetch(new Request('https://booth.example/api/deliver', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), environment());
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});
test('validates consent, recipient and JPEG bytes before contacting providers', async () => {
  globalThis.fetch = () => { throw new Error('Provider must not be contacted'); };
  for (const options of [{ consent: 'false' }, { recipient: 'not-an-email' }, { channel: 'sms', recipient: '+442071234567' }, { channel: 'fax' }, { bytes: new Uint8Array([1, 2, 3, 4]) }]) {
    assert.equal((await worker.fetch(request(options), environment())).status, 400);
  }
});
test('enforces bounded requests even without Content-Length', async () => {
  const oversized = new Uint8Array(1_070_000);
  assert.equal((await worker.fetch(request({ bytes: oversized }), environment())).status, 413);
});
test('rate limiting blocks sending', async () => {
  const env = environment(); env.SEND_LIMITER.limit = async () => ({ success: false });
  assert.equal((await worker.fetch(request(), env)).status, 429);
});
test('unconfigured delivery reports unavailable instead of success', async () => {
  const env = environment(); delete env.RESEND_API_KEY;
  assert.equal((await worker.fetch(request(), env)).status, 503);
});
test('sends the event subject and JPEG attachment through Resend', async () => {
  let payload;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer test-resend');
    payload = JSON.parse(options.body);
    return Response.json({ id: 'email-123' });
  };
  const env = environment();
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, channel: 'email' });
  assert.match(payload.subject, /Diwali \/ Annakut Celebrations — Munster, IN/);
  assert.deepEqual(payload.to, ['guest@example.com']);
  assert.deepEqual(Buffer.from(payload.attachments[0].content, 'base64'), Buffer.from(jpeg));
  assert.equal(env.PHOTOS.files.size, 0, 'email photos should not be stored');
});
test('provider rejection never reports a successful send', async () => {
  globalThis.fetch = async () => Response.json({ message: 'bad sender' }, { status: 422 });
  const response = await worker.fetch(request(), environment());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).accepted, undefined);
});
test('MMS uses a signed, expiring public photo URL and no public listing', async () => {
  let payload;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/api.twilio.com\/2010-04-01\/Accounts\/ACtest\/Messages.json$/);
    payload = new URLSearchParams(options.body);
    return Response.json({ sid: 'SMtest', status: 'queued' });
  };
  const env = environment();
  const sent = await worker.fetch(request({ channel: 'sms', recipient: '+12195550123' }), env);
  assert.equal(sent.status, 200);
  assert.equal(payload.get('To'), '+12195550123');
  assert.equal(env.PHOTOS.files.size, 1);
  const mediaUrl = payload.get('MediaUrl');
  const media = await worker.fetch(new Request(mediaUrl), env);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('Content-Type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await media.arrayBuffer()), jpeg);
  assert.equal((await worker.fetch(new Request(mediaUrl, { method: 'HEAD' }), env)).status, 200);
  const tampered = new URL(mediaUrl); tampered.searchParams.set('signature', 'x'.repeat(43));
  assert.equal((await worker.fetch(new Request(tampered), env)).status, 404);
  tampered.searchParams.set('expires', '1600000000');
  assert.equal((await worker.fetch(new Request(tampered), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://booth.example/media/'), env)).status, 404);
});
test('failed MMS removes its stored photo', async () => {
  globalThis.fetch = async () => Response.json({ status: 'failed', sid: 'SMtest' }, { status: 400 });
  const env = environment();
  assert.equal((await worker.fetch(request({ channel: 'sms', recipient: '+12195550123' }), env)).status, 502);
  assert.equal(env.PHOTOS.files.size, 0);
});
test('cleanup deletes only expired photo objects', async () => {
  const env = environment();
  env.PHOTOS.files.set('photos/old.jpg', { uploaded: new Date(Date.now() - 90_000_000) });
  env.PHOTOS.files.set('photos/new.jpg', { uploaded: new Date() });
  await worker.scheduled({}, env);
  assert.equal(env.PHOTOS.files.has('photos/old.jpg'), false);
  assert.equal(env.PHOTOS.files.has('photos/new.jpg'), true);
});
