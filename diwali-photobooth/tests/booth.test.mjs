import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
function booth() {
  const elements = new Map();
  const counts = [], waits = [], calls = [];
  let stopped = false;
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, value: '', checked: false, disabled: false, style: {}, files: [],
      classList: { add() {}, remove() {} },
      addEventListener() {}, removeAttribute(name) { delete this[name]; },
      reset() { element('contact').value = ''; element('consent').checked = false; },
      querySelector() { return element(`${id}-text`); },
      showModal() {}, close() {}, click() {}, remove() {},
    });
    return elements.get(id);
  };
  Object.defineProperty(element('countdown'), 'textContent', { set(value) { counts.push(value); } });
  Object.assign(element('camera'), { readyState: 4, videoWidth: 1600, videoHeight: 1200, async play() {} });
  const drawing = { fillRect() {}, fillText() {}, save() {}, restore() {}, translate(...args) { calls.push(['translate', ...args]); }, scale(...args) { calls.push(['scale', ...args]); }, drawImage(...args) { calls.push(['drawImage', ...args.slice(1)]); } };
  const canvas = { getContext: () => drawing, toBlob(callback) { callback(new Blob(['photo'], { type: 'image/jpeg' })); } };
  const context = vm.createContext({
    window: { BOOTH_CONFIG: {}, isSecureContext: true, addEventListener() {} },
    document: { hidden: false, fonts: { ready: Promise.resolve() }, getElementById: element, addEventListener() {}, querySelector: (selector) => ({ value: selector.includes('frame') ? 'celebration' : 'email' }), querySelectorAll: () => [], createElement: () => canvas },
    navigator: { mediaDevices: { async getUserMedia() { return { getTracks: () => [{ stop() { stopped = true; } }] }; } } },
    sessionStorage: { getItem() { return null; } },
    URL: { createObjectURL: () => 'blob:test-photo', revokeObjectURL() {} },
    Blob, File, FormData, AbortController, AbortSignal, console,
    setTimeout(callback, ms) { waits.push(ms); if (ms === 1000) queueMicrotask(callback); return waits.length; },
    clearTimeout() {}, setInterval() {}, clearInterval() {},
  });
  vm.runInContext(`${source}\nglobalThis.actions = { capture, reset, openCamera, normalizedPhone, state: () => ({ phase, photo, busy }) };`, context);
  return { actions: context.actions, elements, counts, waits, calls, stopped: () => stopped };
}

test('first tap opens camera; second tap counts 3, 2, 1 before generating the keepsake', async () => {
  const app = booth();
  await app.actions.capture();
  assert.deepEqual(app.counts, [], 'camera opening should not take a photo');
  assert.equal(app.actions.state().phase, 'welcome');
  await app.actions.capture();
  assert.deepEqual(app.counts, [3, 2, 1]);
  assert.equal(app.waits.filter((ms) => ms === 1000).length, 3);
  assert.equal(app.actions.state().phase, 'delivery');
  assert.equal(app.actions.state().photo.type, 'image/jpeg');
  assert.ok(app.stopped(), 'camera must stop after a photo is taken');
  assert.ok(app.calls.some((call) => call[0] === 'scale' && call[1] === -1), 'front camera keeps the mirrored preview');
  const crop = app.calls.find((call) => call[0] === 'drawImage');
  assert.deepEqual(crop.slice(1, 5), [200, 0, 1200, 1200]);
});
test('reset clears the previous photo and guest contact details', async () => {
  const app = booth();
  await app.actions.capture(); await app.actions.capture();
  app.elements.get('contact').value = 'previous-guest@example.com';
  app.elements.get('consent').checked = true;
  app.actions.reset();
  assert.equal(app.actions.state().photo, null);
  assert.equal(app.actions.state().phase, 'welcome');
  assert.equal(app.elements.get('contact').value, '');
  assert.equal(app.elements.get('consent').checked, false);
  assert.equal(app.elements.get('photo-preview').src, undefined);
});
test('normalizes US numbers while rejecting unsupported phone formats', () => {
  const app = booth();
  assert.equal(app.actions.normalizedPhone('(219) 555-0123'), '+12195550123');
  assert.equal(app.actions.normalizedPhone('+1 219 555 0123'), '+12195550123');
  assert.equal(app.actions.normalizedPhone('+44 20 1234 5678'), null);
});
