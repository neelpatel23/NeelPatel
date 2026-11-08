# Munster celebration photobooth

An iPad-friendly booth for Diwali / Annakut Celebrations in Munster, IN. The frontend is plain HTML, CSS, and JavaScript, ready for GitHub Pages with no install or build step. The separate Cloudflare Worker handles Resend email attachments and Twilio MMS. No provider credentials belong in the GitHub Pages files.

## Preview

From the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://localhost:4173/diwali-photobooth/`. Camera access works on localhost or HTTPS. A plain HTTP LAN address will not enable the iPad camera. To test on the iPad, publish through GitHub Pages first.

## GitHub Pages hosting

This folder is additive to the existing personal website. Keep the root `index.html`, `CNAME`, and Pages publishing settings intact. If the existing Pages source is the root of `main`, commit/push this folder on that branch and it will publish at:

`https://neeljpatel.com/diwali-photobooth/`

That is the expected path, not a claim that it is already deployed. If Pages uses a different source, include this folder in that source. Check the repository’s Pages deployment before using the URL. No Actions workflow is needed for a branch-based static Pages deployment.

GitHub Pages hosts only the interface. Capture, retake, device photo import, branded JPEG generation, downloads, and supported native sharing work without a backend. Automatic email and MMS require the setup below. The app never pretends to send while disconnected.

## Connect email and photo texts

Prerequisites: a Cloudflare account with Workers/R2 enabled, a Resend API key and verified sending domain, and a Twilio account with an MMS-capable US/Canadian sender authorized for the intended traffic. Complete any sender verification and registration required by your provider before the event. Trial account recipient restrictions can prevent delivery to guests.

1. Install the current Wrangler CLI using a supported Node version, then log in. Run subsequent commands from `diwali-photobooth/backend/`.

   ```sh
   npx wrangler login
   npx wrangler r2 bucket create munster-celebration-photos
   ```

2. Edit `backend/wrangler.toml`: set `ALLOWED_ORIGINS` to the exact GitHub Pages/custom-domain origin(s), and uncomment/set `EMAIL_FROM` to a sender on your verified Resend domain. Origins have no path or trailing slash. For local development only, add `http://localhost:4173`.

3. Generate **two different** random secrets of at least 32 characters (a password manager can generate them). Enter each at Wrangler’s hidden prompt; never place secrets in this repository:

   ```sh
   npx wrangler secret put BOOTH_ACCESS_KEY
   npx wrangler secret put MEDIA_SIGNING_SECRET
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put TWILIO_ACCOUNT_SID
   npx wrangler secret put TWILIO_AUTH_TOKEN
   npx wrangler secret put TWILIO_FROM_NUMBER
   npx wrangler deploy
   ```

   `TWILIO_FROM_NUMBER` must be the actual MMS-capable sender, in `+1…` format. Keep the resulting Worker publicly reachable: Twilio must fetch the signed image URL without login. The booth API itself requires the booth access key and an allowed origin.

4. Open the GitHub Pages URL on the iPad. Tap the small organizer settings gear in the footer. Enter the deployed Worker URL and `BOOTH_ACCESS_KEY`. The connection check reports whether email and text settings are present. These settings stay in `sessionStorage` for this tab; reconnect after closing the tab. This access key authorizes sends, so only share it with booth operators. Resend/Twilio credentials stay on the Worker.

   Optionally set the public Worker URL in `config.js` to prefill it. **Never put an access key or provider secret in `config.js`.**

5. Test a real email and a real MMS to your own address/number before opening the booth to guests. Confirm the attachment, photo crop, spam placement, and text arrival. A successful API response means the provider accepted the message; it does not guarantee final delivery. The UI reflects this distinction. This project does not include delivery-status webhooks or automatic retries.

Email subject: **Your photo · Diwali / Annakut Celebrations — Munster, IN**.

## iPad operation

- Open the HTTPS URL in Safari and allow camera access. The first tap opens the live preview; the next shutter tap starts the three-second countdown.
- Choose Celebration for an ivory keepsake border with event/location branding, or Original for a square image without a border. Front-camera photos match the mirrored preview.
- Retake, send by email/text, or save/share using the iPad share sheet. Text delivery accepts US/Canadian numbers.
- Guest details clear on a new session. Unfinished photo sessions reset after three minutes of inactivity. Successful sends reset after 30 seconds, or immediately using “Next celebration.” Photo/contact data is not saved in browser storage.
- Screen wake lock is requested where supported; use the iPad’s Auto-Lock/Guided Access settings for event operation. Locking/backgrounding can interrupt camera access; reopen the camera when you return.

## Data and abuse controls

- Recipient addresses/numbers are passed to the selected provider and not stored in R2. Providers retain their own delivery records under their account policies.
- Email photos are attached directly and not stored by this app. MMS photos are stored privately in R2; only a signed, unguessable URL can read one for 24 hours. There is no gallery/listing endpoint. The hourly cleanup removes old objects, normally within 25 hours. Expired links stop working at 24 hours even before deletion. Configure an R2 lifecycle rule as an additional retention safeguard if desired.
- API requests require a minimum 32-character booth key. CORS permits only configured origins; CORS alone is not authorization. A Worker rate-limit binding limits a source IP to 20 send attempts per minute. Configure provider spending/volume limits appropriate for the event.
- Uploads are size-bounded and checked for JPEG type/signatures. The normal frontend generates JPEGs under 1 MB. Logs intentionally exclude contact details, image contents, credentials, and signed URLs.
- Delivery timeouts can occur after a provider accepted a request. Check the recipient’s inbox/messages before manually retrying; manual retries may send another message.

## Verification

```sh
node --check diwali-photobooth/app.js
node --test diwali-photobooth/tests/*.test.mjs
```

Flow tests verify the three one-second countdown intervals, square crop, mirrored capture, and guest reset with simulated camera/DOM objects. Backend tests use stubbed providers and in-memory photo storage. Actual iPad camera access, provider accounts, and live delivery must be verified on the configured deployment.

Provider references: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Resend email API](https://resend.com/docs/api-reference/emails/send-email), [Twilio MMS](https://www.twilio.com/docs/messaging/tutorials/how-to-send-sms-messages), [Cloudflare R2 bindings](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/).
