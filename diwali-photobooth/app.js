const $ = (id) => document.getElementById(id);
const video = $('camera');
const panels = ['welcome-panel', 'delivery-panel', 'success-panel'];
let stream = null;
let facing = 'user';
let busy = false;
let phase = 'welcome';
let photo = null;
let photoUrl = null;
let captureVersion = 0;
let idleTimer;
let resetInterval;
let deliveryController;
let wakeLock;
let config = { apiBaseUrl: window.BOOTH_CONFIG?.apiBaseUrl || '', accessKey: '' };
try { config = { ...config, ...JSON.parse(sessionStorage.getItem('celebration-connection') || '{}') }; } catch { /* Storage is optional in private browsing. */ }

function message(text) { $('camera-error').textContent = text; }
function showPhase(next) {
  phase = next;
  for (const id of panels) $(id).hidden = id !== `${next}-panel`;
  $('capture-controls').hidden = next !== 'welcome';
  $('review-controls').hidden = next === 'welcome';
  $('step-counter').innerHTML = `${next === 'welcome' ? '01' : next === 'delivery' ? '02' : '03'} <span>/ 03</span>`;
  $('camera-status').textContent = next === 'welcome' ? (stream ? 'FIND YOUR LIGHT' : 'A MOMENT OF JOY') : next === 'delivery' ? 'A MEMORY TO KEEP' : 'JOY, ON ITS WAY';
  $('retake-button').hidden = next === 'success';
  if (next === 'delivery') armIdleReset();
  else clearTimeout(idleTimer);
}

async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* Supported iPads can keep their screen awake. */ }
}

function stopCamera() {
  if (stream) for (const track of stream.getTracks()) track.stop();
  stream = null;
  video.srcObject = null;
  video.hidden = true;
  $('live-badge').hidden = true;
  $('camera-tip').hidden = true;
  $('flip-button').disabled = true;
  $('camera-dot').classList.remove('active');
}

async function openCamera() {
  if (busy) return;
  busy = true;
  message('');
  $('capture-button').disabled = true;
  $('capture-button').querySelector('span').textContent = 'Opening your camera…';
  const version = ++captureVersion;
  stopCamera();
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure');
    const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false });
    if (version !== captureVersion) { opened.getTracks().forEach((track) => track.stop()); return; }
    stream = opened;
    video.srcObject = stream;
    video.hidden = false;
    video.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
    await video.play();
    if (version !== captureVersion) return;
    $('idle-art').hidden = true;
    $('photo-preview').hidden = true;
    $('live-badge').hidden = false;
    $('camera-tip').hidden = false;
    $('camera-dot').classList.add('active');
    $('camera-status').textContent = 'FIND YOUR LIGHT';
    $('flip-button').disabled = false;
    $('capture-button').querySelector('span').textContent = 'Ready? Take a photo';
    await keepAwake();
  } catch (error) {
    stopCamera();
    $('idle-art').hidden = false;
    const errors = {
      NotAllowedError: 'Camera access is off. Allow camera access in Safari’s website settings, then try again. You can also choose a photo below.',
      NotFoundError: 'No camera was found. You can choose a photo from this device instead.',
      NotReadableError: 'The camera is being used by another app. Close that app and try again.',
      secure: 'Open the booth using an HTTPS URL or localhost to use the camera. You can also choose a photo below.',
    };
    message(errors[error.name] || errors[error.message] || 'We couldn’t open the camera. Try again, or choose a photo below.');
    $('capture-button').querySelector('span').textContent = 'Try camera again';
  } finally { busy = false; $('capture-button').disabled = false; }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function capture() {
  if (busy) return;
  if (!stream) return openCamera();
  if (video.readyState < 2 || !video.videoWidth) { message('Your camera is still getting ready. Try again in a moment.'); return; }
  busy = true;
  message('');
  const version = ++captureVersion;
  $('capture-button').disabled = true;
  $('flip-button').disabled = true;
  $('upload-button').disabled = true;
  $('camera-tip').hidden = true;
  try {
    for (let count = 3; count >= 1; count--) {
      if (version !== captureVersion) return;
      $('countdown').hidden = false;
      $('countdown').textContent = count;
      $('countdown').classList.remove('pulse');
      void $('countdown').offsetWidth;
      $('countdown').classList.add('pulse');
      await wait(1000);
    }
    if (version !== captureVersion || document.hidden || video.readyState < 2) throw new Error('The camera was interrupted. Please try your photo again.');
    $('countdown').hidden = true;
    $('flash').hidden = false;
    await makePhoto(video, video.videoWidth, video.videoHeight, facing === 'user', version);
    setTimeout(() => { $('flash').hidden = true; }, 450);
  } catch (error) { message(error.message || 'We couldn’t take the photo. Please try again.'); }
  finally {
    busy = false;
    $('countdown').hidden = true;
    $('capture-button').disabled = false;
    $('flip-button').disabled = !stream;
    $('upload-button').disabled = false;
  }
}

async function makePhoto(source, width, height, mirror = false, version = captureVersion) {
  try { await document.fonts.ready; } catch { /* Local font fallbacks are ready. */ }
  if (version !== captureVersion) return;
  const framed = document.querySelector('input[name="frame"]:checked').value === 'celebration';
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = framed ? 1380 : 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser couldn’t prepare the photo. Please try Safari.');
  ctx.fillStyle = '#f7f4ec'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const margin = framed ? 44 : 0;
  const size = canvas.width - margin * 2;
  const crop = Math.min(width, height);
  ctx.save();
  if (mirror) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, (width - crop) / 2, (height - crop) / 2, crop, crop, margin, margin, size, size);
  ctx.restore();
  if (framed) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#302f28'; ctx.font = '58px "Libre Caslon Display", Georgia, serif';
    ctx.fillText('Diwali & Annakut', 600, 1235);
    ctx.fillStyle = '#b34f2d'; ctx.font = '18px "DM Sans", Arial, sans-serif';
    ctx.fillText('C E L E B R A T I O N S   ·   M U N S T E R ,  I N', 600, 1280);
    ctx.fillStyle = '#8c826d'; ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText('Light. Love. Togetherness.', 600, 1326);
  }
  // Keep the image below common MMS limits, including the branded border.
  let blob;
  for (const quality of [.82, .65, .45]) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size <= 1_000_000) break;
  }
  if (!blob) throw new Error('We couldn’t prepare this image. Please choose another photo.');
  if (blob.size > 1_000_000) throw new Error('This photo is too detailed to send. Please try another photo.');
  if (version !== captureVersion) return;
  clearPhoto();
  photo = blob;
  photoUrl = URL.createObjectURL(blob);
  $('photo-preview').src = photoUrl;
  $('photo-preview').hidden = false;
  $('idle-art').hidden = true;
  $('viewfinder').classList.add('has-photo');
  stopCamera();
  $('delivery-form').reset();
  updateChannel();
  $('delivery-message').textContent = '';
  showPhase('delivery');
  $('announcement').textContent = 'Your photo is ready. Enter your email address or mobile number to receive it.';
}

function clearPhoto() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null; photo = null;
  $('photo-preview').removeAttribute('src');
}

function reset() {
  ++captureVersion;
  clearInterval(resetInterval);
  clearTimeout(idleTimer);
  deliveryController?.abort();
  deliveryController = null;
  busy = false;
  clearPhoto();
  stopCamera();
  $('photo-preview').hidden = true;
  $('idle-art').hidden = false;
  $('viewfinder').classList.remove('has-photo');
  $('countdown').hidden = true;
  $('flash').hidden = true;
  $('delivery-form').reset();
  $('delivery-message').textContent = '';
  $('send-button').disabled = false;
  $('send-button').querySelector('span').textContent = 'Send my photo';
  $('success-copy').textContent = '';
  $('capture-button').disabled = false;
  $('capture-button').querySelector('span').textContent = 'Let’s take a photo';
  $('upload-button').disabled = false;
  $('upload-input').value = '';
  message('');
  showPhase('welcome');
  updateChannel();
}

function armIdleReset() {
  clearTimeout(idleTimer);
  if (phase === 'delivery' && !busy) idleTimer = setTimeout(() => { reset(); $('announcement').textContent = 'The previous photo session has been cleared. Ready for the next guest.'; }, 180_000);
}

function updateChannel() {
  const email = document.querySelector('input[name="channel"]:checked').value === 'email';
  $('contact-label').textContent = email ? 'Your email address' : 'Your mobile number';
  $('contact').type = email ? 'email' : 'tel';
  $('contact').inputMode = email ? 'email' : 'tel';
  $('contact').placeholder = email ? 'you@example.com' : '(219) 555-0123';
  $('contact').maxLength = email ? 254 : 25;
  $('contact-hint').textContent = email ? 'Your photo will arrive as an email attachment.' : 'US or Canadian numbers. One photo text; messaging rates may apply.';
  $('consent-copy').textContent = email ? 'Send this photo to my email. My details won’t be used for marketing.' : 'I agree to receive one photo text at this number. Message and data rates may apply. No marketing.';
  $('contact').value = '';
  $('consent').checked = false;
  $('delivery-message').textContent = '';
}

function normalizedPhone(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return null;
}

async function sendPhoto(event) {
  event.preventDefault();
  if (!photo || busy) return;
  const channel = document.querySelector('input[name="channel"]:checked').value;
  const recipient = channel === 'sms' ? normalizedPhone($('contact').value) : $('contact').value.trim();
  if (!recipient) { $('delivery-message').textContent = 'Please enter a 10-digit US or Canadian mobile number.'; return; }
  if (!config.apiBaseUrl || !config.accessKey) { $('delivery-message').textContent = 'Photo delivery hasn’t been connected by the organizer yet. You can still save or share your photo using the button below the photo.'; return; }
  busy = true; clearTimeout(idleTimer);
  $('send-button').disabled = true;
  $('send-button').querySelector('span').textContent = 'Sending your memory…';
  $('delivery-message').textContent = '';
  const controller = new AbortController(); deliveryController = controller;
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const version = captureVersion;
  try {
    const data = new FormData();
    data.set('photo', photo, 'diwali-annakut-munster.jpg');
    data.set('channel', channel); data.set('recipient', recipient); data.set('consent', 'true');
    const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}/api/deliver`, { method: 'POST', headers: { Authorization: `Bearer ${config.accessKey}` }, body: data, signal: controller.signal });
    const result = await response.json();
    if (version !== captureVersion) return;
    if (!response.ok) throw new Error(result.error || 'Your photo couldn’t be sent. Please try again.');
    // A provider acceptance is not a delivery receipt.
    $('success-copy').textContent = channel === 'email' ? 'Your photo has been handed to our email service. Check your inbox and spam folder shortly.' : 'Your photo has been handed to our text service. Watch for your celebration keepsake shortly.';
    $('contact').value = ''; $('consent').checked = false;
    showPhase('success');
    let seconds = 30;
    $('reset-note').textContent = `Ready for the next guest in ${seconds} seconds.`;
    resetInterval = setInterval(() => { seconds--; $('reset-note').textContent = `Ready for the next guest in ${seconds} seconds.`; if (seconds <= 0) reset(); }, 1000);
  } catch (error) {
    if (version !== captureVersion) return;
    $('delivery-message').textContent = error.name === 'AbortError' ? 'We couldn’t confirm the send. It may still arrive; check your inbox or messages before trying again. You can also save your photo.' : (error.message === 'Failed to fetch' ? 'We couldn’t reach photo delivery. Check the iPad’s internet connection or save your photo below.' : error.message);
  } finally {
    clearTimeout(timeout);
    if (version === captureVersion) { busy = false; deliveryController = null; $('send-button').disabled = false; $('send-button').querySelector('span').textContent = 'Send my photo'; armIdleReset(); }
  }
}

async function savePhoto() {
  if (!photo) return;
  const file = new File([photo], 'diwali-annakut-munster.jpg', { type: 'image/jpeg' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Diwali & Annakut Celebrations — Munster, IN' }); return; }
    const link = document.createElement('a'); link.href = photoUrl; link.download = file.name; document.body.append(link); link.click(); link.remove();
    $('announcement').textContent = 'Your photo is ready to save.';
  } catch (error) { if (error.name !== 'AbortError') message('Sharing couldn’t open. Try again or use a different browser to save your photo.'); }
}

$('capture-button').addEventListener('click', capture);
$('flip-button').addEventListener('click', () => { if (!busy) { facing = facing === 'user' ? 'environment' : 'user'; openCamera(); } });
$('retake-button').addEventListener('click', () => { reset(); openCamera(); });
$('start-over').addEventListener('click', reset);
$('next-guest').addEventListener('click', reset);
$('delivery-form').addEventListener('submit', sendPhoto);
document.querySelectorAll('input[name="channel"]').forEach((input) => input.addEventListener('change', updateChannel));
$('save-button').addEventListener('click', savePhoto);
$('upload-button').addEventListener('click', () => $('upload-input').click());
$('upload-input').addEventListener('change', async () => {
  const file = $('upload-input').files[0];
  if (!file || busy) return;
  if (file.size > 20 * 1024 * 1024) { message('Please choose a photo smaller than 20 MB.'); return; }
  busy = true; message('');
  const localUrl = URL.createObjectURL(file);
  const version = ++captureVersion;
  try { const image = new Image(); image.src = localUrl; await image.decode(); await makePhoto(image, image.naturalWidth, image.naturalHeight, false, version); }
  catch { message('This image format couldn’t be opened. Try a JPEG or PNG photo.'); }
  finally { URL.revokeObjectURL(localUrl); busy = false; $('upload-input').value = ''; armIdleReset(); }
});

$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('settings-button').addEventListener('click', () => { $('api-url').value = config.apiBaseUrl; $('access-key').value = config.accessKey; $('settings-message').textContent = ''; $('settings-dialog').showModal(); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(button.dataset.close).close()));
$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = new URL($('api-url').value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) { $('settings-message').textContent = 'Use an HTTPS delivery server URL.'; return; }
  const nextConfig = { apiBaseUrl: url.origin, accessKey: $('access-key').value.trim() };
  $('settings-message').textContent = 'Checking the connection…';
  const button = event.submitter; button.disabled = true;
  try {
    const response = await fetch(`${url.origin}/api/status`, { headers: { Authorization: `Bearer ${nextConfig.accessKey}` }, signal: AbortSignal.timeout(10_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The connection could not be verified.');
    config = nextConfig;
    try { sessionStorage.setItem('celebration-connection', JSON.stringify(config)); } catch { /* Connection still works in memory. */ }
    const status = `Connected. Email: ${result.email ? 'ready' : 'provider setup needed'}. Text: ${result.sms ? 'ready' : 'provider setup needed'}.`;
    $('settings-message').textContent = status;
    $('settings-status').textContent = status;
  } catch (error) { $('settings-message').textContent = error.message === 'Failed to fetch' ? 'Couldn’t reach this server. Check the URL and allowed website origin on the server.' : error.message; }
  finally { button.disabled = false; }
});
$('disconnect-button').addEventListener('click', () => { config = { apiBaseUrl: window.BOOTH_CONFIG?.apiBaseUrl || '', accessKey: '' }; try { sessionStorage.removeItem('celebration-connection'); } catch {} $('access-key').value = ''; $('settings-message').textContent = 'Delivery disconnected on this device.'; $('settings-status').textContent = 'Photo capture and downloads work without a connection.'; });

for (const name of ['pointerdown', 'input', 'keydown']) document.addEventListener(name, armIdleReset, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'welcome') { ++captureVersion; stopCamera(); busy = false; $('countdown').hidden = true; $('idle-art').hidden = false; $('capture-button').disabled = false; $('capture-button').querySelector('span').textContent = 'Reopen camera'; }
  else if (!document.hidden) keepAwake();
});
window.addEventListener('pagehide', () => { ++captureVersion; stopCamera(); deliveryController?.abort(); clearPhoto(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) reset(); });
showPhase('welcome');
