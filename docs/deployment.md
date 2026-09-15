# Deployment & operations

## Environments

| Environment | Frontend | API | Database | Status |
|---|---|---|---|---|
| Local dev | `localhost:5273` (Vite) | `localhost:5017` (node) | local MongoDB | Primary dev loop (`npm run dev:all`) |
| Hosted site | https://echoo.digi02.org/ | same origin (`/api`) | managed with the host | Live; see below |
| Desktop installs | bundled `file://` | bundled local server, or hosted API | embedded fallback or local MongoDB | Shipped via GitHub Releases |

## Hosted site — echoo.digi02.org

The public web deployment: frontend + API on one origin behind Cloudflare. Last verified 2026-09-15: healthy (`/api/health` → ok), but serving a **stale frontend build** (no `echoo-app` identity marker) and its backend denies desktop origins (`CORS_ORIGIN_DENIED` for `Origin: null`) with unknown LiveKit configuration.

**To bring it current**, its operator works through [`HOSTED-SERVER-SYNC.md`](../HOSTED-SERVER-SYNC.md): allow the desktop `file://` origin in `isAllowedOrigin`, set the four `LIVEKIT_*` Cloud vars, deploy the latest code, and pass the five verification checks. Desktop installers pointed at `https://echoo.digi02.org/api` ship after that goes green.

## Production checklist (any host)

1. **Env:** `NODE_ENV=production` with `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGINS`, and the four `LIVEKIT_*` vars (production requires public `wss://` LiveKit URLs). See `backend/.env.example` and `backend/.env.production.example`.
2. **LiveKit:** LiveKit Cloud project (URL + key + secret). Local `livekit-server --dev` is dev-only.
3. **Storage:** S3-compatible bucket for the recording archive (`AUDIO_*` vars). Free, no-card path: Backblaze B2 private bucket (10 GB) with signed playback URLs. See `backend/.env.example`.
4. **CORS:** production allowlist is explicit — add the web origin plus `"null"` for desktop `file://` shells (see `HOSTED-SERVER-SYNC.md` Task 1).
5. **Frontend:** `npm run build` in `frontend/`, serve `dist/` (verify the `echoo-app` marker in the served HTML).
6. **Transcription (optional):** Whisper gateway per [`transcription.md`](transcription.md); the app runs fine without it.

## Desktop releases

Built from `desktop/` (`npm run dist:linux` → AppImage, `npm run dist:win` → NSIS `.exe`, `npm run dist:mac` → DMG). Zero-config options are baked at build time from env: `LIVEKIT_*` (embedded server config → first-launch `server-data/.env`), so a fresh download can go live immediately. Published artifacts + update manifests (`latest*.yml`) attach to a GitHub Release (e.g. `v0.2.0`); the in-app updater consumes them. Unsigned builds install with the expected OS warnings — signing needs `CSC_LINK`/`APPLE_*` as documented in `desktop/README.md`.
