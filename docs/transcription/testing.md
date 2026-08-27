# Transcription verification

## Automated gates

Backend:

```bash
cd backend
npm ci
npm test
```

Frontend:

```bash
cd frontend
npm ci
npm run test:unit
npm run lint
npm run build
```

Repository:

```bash
git diff --check
```

Automated tests must not require a Gemini credential or download the Parakeet model.

## Manual A — Parakeet primary

1. Start backend and frontend.
2. Sign in as a creator and open Creator Studio.
3. Confirm transcription changes from preparing to ready without a manual model installation.
4. Connect Host Mic and other desired sources.
5. Go live and speak.
6. Confirm the listener receives uninterrupted LiveKit audio.
7. Confirm final transcript lines persist for the creator.
8. End live and open transcript review.

## Manual B — browser cache

1. Use a clean Chromium profile and let Parakeet load once.
2. Inspect Network/Application storage and record the actual first-load transfer size.
3. Reload Creator Studio.
4. Confirm the model is reused from browser-managed storage/cache and no manual model download is requested.

## Manual C — Gemini fallback

1. Set the permanent Gemini key only in `backend/.env`.
2. Enable `GEMINI_LIVE_ENABLED=true`.
3. Temporarily set `VITE_PARAKEET_ENABLED=false` in local frontend development config.
4. Restart services and start a creator broadcast.
5. Confirm a Gemini ephemeral token is issued only to the authenticated owner.
6. Confirm live transcription works while LiveKit audio stays uninterrupted.
7. Search browser source/network payloads: the permanent Gemini API key must not appear.

## Manual D — rotation

For development only set `GEMINI_LIVE_ROTATE_SECONDS=60` and overlap to 5 seconds. Run for at least 130 seconds. Confirm at least two rotations, successor-before-predecessor behavior, no transcript gap, no duplicate overlap phrase, and no listener audio interruption. Restore 560 seconds afterward.

## Manual E — all STT unavailable

Disable Parakeet, Gemini and Whisper, then start a broadcast. Transcription should report unavailable while the listener continues hearing the creator. This is a mandatory acceptance condition.

## Hardware/service limitations

CI can verify package installation, bundling and logic but cannot prove real microphone permission, WebGPU driver performance, browser IndexedDB/cache behavior on every device, or a real Gemini account/quota. Those remain explicit device/service tests rather than fabricated CI successes.
