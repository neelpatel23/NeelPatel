const EVENT = 'Diwali / Annakut Celebrations — Munster, IN';
const DAY = 86_400;
const MAX_PHOTO_BYTES = 1_000_000;
const MAX_REQUEST_BYTES = MAX_PHOTO_BYTES + 65_536;
const encoder = new TextEncoder();

function reply(body, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  return origin && (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).includes(origin) ? origin : null;
}
function withCors(response, origin) {
  const headers = new Headers(response.headers);
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, headers });
}
async function authorized(request, env) {
  if (!env.BOOTH_ACCESS_KEY || env.BOOTH_ACCESS_KEY.length < 32) return false;
  const expected = await crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${env.BOOTH_ACCESS_KEY}`));
  const actual = await crypto.subtle.digest('SHA-256', encoder.encode(request.headers.get('Authorization') || ''));
  const a = new Uint8Array(expected), b = new Uint8Array(actual);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
function capabilities(env) {
  return {
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    sms: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER && env.PHOTOS && env.MEDIA_SIGNING_SECRET?.length >= 32),
  };
}
function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
async function signature(env, id, expires) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.MEDIA_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}:${expires}`));
  return base64(new Uint8Array(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function media(request, env, url) {
  const id = url.pathname.slice('/media/'.length);
  const expires = url.searchParams.get('expires');
  const supplied = url.searchParams.get('signature');
  const now = Math.floor(Date.now() / 1000);
  if (!/^[a-f0-9-]{36}\.jpg$/.test(id) || !/^\d{10}$/.test(expires || '') || !/^[\w-]{43}$/.test(supplied || '') || Number(expires) <= now || Number(expires) > now + DAY + 60 || !env.MEDIA_SIGNING_SECRET || !env.PHOTOS) return reply({ error: 'This photo link has expired or is unavailable.' }, 404);
  const expected = await signature(env, id, expires);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  if (difference) return reply({ error: 'This photo link has expired or is unavailable.' }, 404);
  const object = await env.PHOTOS.get(`photos/${id}`);
  if (!object || object.uploaded.getTime() < Date.now() - DAY * 1000) return reply({ error: 'This photo link has expired or is unavailable.' }, 404);
  return new Response(request.method === 'HEAD' ? null : object.body, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(object.size), 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="diwali-annakut-munster.jpg"' } });
}
async function boundedForm(request) {
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) throw new Error('invalid-form');
  if (Number(request.headers.get('Content-Length') || '0') > MAX_REQUEST_BYTES) throw new Error('too-large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid-form');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error('too-large'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return new Response(body, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData();
}
async function deliver(request, env, url) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (env.SEND_LIMITER && !(await env.SEND_LIMITER.limit({ key: ip })).success) return reply({ error: 'A few too many photos at once. Please wait a minute and try again.' }, 429);
  let form;
  try { form = await boundedForm(request); }
  catch (error) { return reply({ error: error.message === 'too-large' ? 'Please use a photo smaller than 1 MB.' : 'Please send a valid photo form.' }, error.message === 'too-large' ? 413 : 400); }
  const channel = form.get('channel');
  const recipient = String(form.get('recipient') || '').trim();
  if (form.get('consent') !== 'true') return reply({ error: 'Please agree to receive your photo first.' }, 400);
  if (!['email', 'sms'].includes(channel)) return reply({ error: 'Choose email or text delivery.' }, 400);
  if (channel === 'email' && (recipient.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient))) return reply({ error: 'Enter a valid email address.' }, 400);
  if (channel === 'sms' && !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(recipient)) return reply({ error: 'Enter a valid US or Canadian mobile number.' }, 400);
  const photo = form.get('photo');
  if (!photo || typeof photo === 'string' || photo.type !== 'image/jpeg' || photo.size < 4 || photo.size > MAX_PHOTO_BYTES) return reply({ error: 'Please use a JPEG photo smaller than 1 MB.' }, 400);
  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return reply({ error: 'The photo could not be read. Please retake it.' }, 400);
  const ready = capabilities(env);
  if (!ready[channel]) return reply({ error: `${channel === 'email' ? 'Email' : 'Text'} delivery hasn’t been connected by the organizer yet. Please save or share your photo instead.` }, 503);
  try {
    if (channel === 'email') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(18_000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_FROM, to: [recipient], subject: `Your photo · ${EVENT}`,
          html: '<div style="background:#f7f4ec;padding:36px;font-family:Georgia,serif;color:#302f28"><p style="color:#b34f2d;font-size:12px;letter-spacing:2px">DIWALI &amp; ANNAKUT · MUNSTER, IN</p><h1 style="font-weight:normal">A little light. A lasting memory.</h1><p>Thank you for celebrating with us! Your photo is attached.</p><p>Wishing you and your loved ones a bright Diwali and a beautiful new year.</p><p>With love,<br>The Diwali &amp; Annakut celebration team</p><p style="font-size:11px;color:#77766a">You requested this one-time photo email at our celebration booth. Your contact details are not added to a mailing list.</p></div>',
          text: `Thank you for joining ${EVENT}! Your celebration photo is attached. Wishing you a bright Diwali and a beautiful new year. This is a one-time photo email you requested at the booth.`,
          attachments: [{ filename: 'diwali-annakut-munster.jpg', content: base64(bytes) }],
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.id) return reply({ error: 'The email service couldn’t accept your photo. Please check with the organizer or save your photo.' }, 502);
      return reply({ accepted: true, channel: 'email' });
    }
    const id = `${crypto.randomUUID()}.jpg`;
    const expires = Math.floor(Date.now() / 1000) + DAY;
    await env.PHOTOS.put(`photos/${id}`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    const mediaUrl = `${url.origin}/media/${id}?expires=${expires}&signature=${await signature(env, id, expires)}`;
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
      method: 'POST', signal: AbortSignal.timeout(18_000),
      headers: { Authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: recipient, From: env.TWILIO_FROM_NUMBER, Body: `Your photo from ${EVENT}. Wishing you a bright Diwali! You requested this one-time photo text.`, MediaUrl: mediaUrl }),
    });
    const result = await response.json();
    if (!response.ok || !result.sid || ['failed', 'undelivered', 'canceled'].includes(result.status)) {
      await env.PHOTOS.delete(`photos/${id}`);
      return reply({ error: 'The text service couldn’t accept your photo. Try email or save your photo instead.' }, 502);
    }
    return reply({ accepted: true, channel: 'sms' });
  } catch {
    // Do not log recipient data, image data, credentials, or signed URLs.
    return reply({ error: 'We couldn’t confirm the send. Your photo may still arrive; check before trying again. You can also save your photo.' }, 504);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    try {
      // Only unguessable, signed, expiring image links are publicly readable.
      if (url.pathname.startsWith('/media/') && ['GET', 'HEAD'].includes(request.method)) return withCors(await media(request, env, url), origin);
      if (!origin) return withCors(reply({ error: 'This website is not allowed to use photo delivery.' }, 403), null);
      if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
      if (!await authorized(request, env)) return withCors(reply({ error: 'Photo delivery needs the organizer’s booth access key.' }, 401), origin);
      if (url.pathname === '/api/status' && request.method === 'GET') return withCors(reply(capabilities(env)), origin);
      if (url.pathname === '/api/deliver' && request.method === 'POST') return withCors(await deliver(request, env, url), origin);
      return withCors(reply({ error: 'Not found.' }, 404), origin);
    } catch { return withCors(reply({ error: 'Photo delivery is temporarily unavailable. Please save your photo or try again shortly.' }, 500), origin); }
  },
  async scheduled(_event, env) {
    if (!env.PHOTOS) return;
    let cursor;
    do {
      const page = await env.PHOTOS.list({ prefix: 'photos/', limit: 1000, ...(cursor ? { cursor } : {}) });
      const expired = page.objects.filter((object) => object.uploaded.getTime() < Date.now() - DAY * 1000).map((object) => object.key);
      if (expired.length) await env.PHOTOS.delete(expired);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  },
};
