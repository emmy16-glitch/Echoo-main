# Deployment & operations

## Environments

| Environment | Frontend | API | Database | Status |
|---|---|---|---|---|
| Local dev | `localhost:5273` (Vite) | `localhost:5017` (node) | local MongoDB | Primary dev loop (`sh scripts/dev-all.sh` from the repo root) |
| Hosted site | https://echoo.digi02.org/ | same origin (`/api`) | managed with the host | Live; see below |
| Desktop installs | hosted app (default) | hosted API (opt-in local server) | n/a (local MongoDB only with the local-backend opt-in) | Shipped via GitHub Releases |

## Hosted site — echoo.digi02.org

The public web deployment: frontend + API on one origin behind Cloudflare. Last verified 2026-09-15: healthy (`/api/health` → ok), but serving a **stale frontend build** (no `echoo-app` identity marker) and its backend denies desktop origins (`CORS_ORIGIN_DENIED` for `Origin: null`) with unknown LiveKit configuration.

**To bring it current**, its operator works through [`HOSTED-SERVER-SYNC.md`](../HOSTED-SERVER-SYNC.md): enable the scoped desktop `file://` allowance (`ECHOO_DESKTOP=1`, see Task 1 — never a blanket `"null"` allowlist), set the four `LIVEKIT_*` Cloud vars, deploy the latest code, and pass the five verification checks. Desktop installers pointed at `https://echoo.digi02.org/api` ship after that goes green.

## Production checklist (any host)

1. **Env:** `NODE_ENV=production` with `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGINS`, and the four `LIVEKIT_*` vars (production requires public `wss://` LiveKit URLs). See `backend/.env.example` and `backend/.env.production.example`.
2. **LiveKit:** LiveKit Cloud project (URL + key + secret). Local `livekit-server --dev` is dev-only.
3. **Recording tools:** install both `ffmpeg` and `ffprobe` on the backend host. Echoo requires them for automatic live-replay MP3 creation and server-side trimming. Verify `GET /api/health/recording` returns `automaticServerMp3: true` before a production broadcast.
4. **Storage:** recordings stay on local disk by default; S3-compatible bucket for durable recording storage (`AUDIO_*` vars; live replays use `AUDIO_REPLAY_MP3_BITRATE`, default `320k`). See `backend/.env.example`.
5. **CORS:** production allowlist is explicit — the web origin only. Desktop `file://` shells are allowed solely through the scoped `ECHOO_DESKTOP=1` guard in `isAllowedOrigin`, never a blanket `"null"` entry (see `HOSTED-SERVER-SYNC.md` Task 1).
6. **Frontend:** `npm run build` in `frontend/`, serve `dist/` (verify the `echoo-app` marker in the served HTML).
7. **Transcription (optional):** Whisper gateway per [`transcription.md`](transcription.md); the app runs fine without it.

## Desktop releases

Built from `desktop/` (`npm run dist:linux` → AppImage, `npm run dist:win` → NSIS `.exe`, `npm run dist:mac` → DMG). Default builds are hosted thin clients pointed at the live API, so a fresh download is in sync as soon as the hosted site is green (Tasks above). Bundling a local API server is an explicit opt-in (`npm run dist:win:local-backend`); `LIVEKIT_*` can be baked for that path. Published artifacts + update manifests (`latest*.yml`) attach to a GitHub Release (e.g. `v1.0.6`); the in-app updater consumes them. Unsigned builds install with the expected OS warnings — signing needs `CSC_LINK`/`APPLE_*` as documented in `desktop/README.md`.
