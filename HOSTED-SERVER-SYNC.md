# Echoo hosted-server sync — instructions for the server AI/agent

> **Read [HOSTING.md](HOSTING.md) first, then read this whole file, then do every
> task in order and verify.**
> Goal: keep `https://echoo.digi02.org/` as the ONE shared production backend
> for web and Echoo Desktop, with LiveKit Cloud audio and automatic server MP3
> recordings. This runbook is specifically for the Digi02 host.

---

## 0. Background and mandatory recording gate

Target architecture:

- one hosted Echoo backend at `https://echoo.digi02.org/api`;
- one shared production MongoDB;
- LiveKit Cloud for realtime creator/listener audio and Track Egress recording;
- FFmpeg + FFprobe on Digi02 for automatic replay MP3 and trimming;
- persistent canonical recording storage;
- web and desktop clients using the same hosted world.

Before touching the deployment, verify the operator/AI has read:

1. [HOSTING.md](HOSTING.md)
2. [AGENTS.md](AGENTS.md)
3. [docs/deployment.md](docs/deployment.md)
4. [backend/.env.example](backend/.env.example)

Do not use `docs/archive/` as current deployment instructions.

The production handoff fails if either of these commands fails in the backend
runtime:

```bash
ffmpeg -version
ffprobe -version
```

LiveKit can still carry realtime audio without them, but Echoo cannot guarantee
automatic server MP3 replay finalization or saved-recording trimming.


---

## Task 1 — Allow the desktop app through CORS (scoped, desktop runtime only)

File: `backend/src/app.js`, function `isAllowedOrigin` (also used by the
Socket.IO server via `echooCorsOrigin`, so one change covers HTTP + realtime).

The code already contains the scoped guard — on the server, only enable it
via environment, never by blanket-allowing `"null"`:

```bash
ECHOO_DESKTOP=1   # runtime env on the host that serves desktop shells
```

```js
// backend/src/app.js — already in place; do NOT replace with a blanket rule:
if ((normalized === 'null' || normalized === 'file://') && process.env.ECHOO_DESKTOP === '1') return true;
```

Why: `file://` pages have no real origin; Chromium sends `"null"`.
Without this, every desktop install gets `CORS_ORIGIN_DENIED`.
Security note: per-request auth is still enforced; do NOT enable
`credentials: true` (leave the existing CORS options untouched), and do NOT
allow `"null"` for any other environment.
Restart the backend afterwards.

---

## Task 2 — Configure LiveKit Cloud

> Real credentials below (provided by the project owner for this exact
> purpose). Put them in the server's environment only — never commit them,
> never print them in logs, never echo them into chat.

```env
LIVEKIT_URL=wss://echoo-cdpcubcr.livekit.cloud
LIVEKIT_PUBLIC_URL=wss://echoo-cdpcubcr.livekit.cloud
LIVEKIT_API_KEY=<set-in-server-environment>
LIVEKIT_API_SECRET=<set-in-server-environment>
```

Notes:
- `NODE_ENV` must stay `production` — `backend/src/config/env.js` requires
  `wss://` URLs in production, and the values above satisfy that.
- The backend reads these at call time (`requireEnv` in
  `backend/src/providers/livekit.js`), so a backend restart is enough —
  no rebuild needed for this task alone.
- Restart the backend after setting them.

---

## Task 3 — Deploy the latest code (frontend AND backend)

Do not assume the currently running bundle/process is current. Pull `main`,
verify environment/runtime dependencies, rebuild the frontend, and restart the
backend using the host's existing process manager:

1. Sync your checkout to the newest `main` (if it is behind, ask okunlola
   to push first — the desktop apps already ship newer frontend code and the
   server must be at least as new).
2. `npm install` in `backend/` (production deps only is fine).
3. Verify `backend/.env` contains the production values needed for MongoDB,
   JWT, CORS, LiveKit and recording. At minimum, the recording-specific values
   should resolve to:
   ```env
   FFMPEG_PATH=ffmpeg
   FFPROBE_PATH=ffprobe
   AUDIO_REPLAY_MP3_BITRATE=320k
   ```
   Keep all real secrets server-only.
4. Verify the recording binaries before any live test:
   ```bash
   ffmpeg -version
   ffprobe -version
   ```
   Both are required. If either command is missing, install the distro FFmpeg package first; Echoo cannot finalize automatic server MP3 replays or trim saved recordings without them.
5. Confirm recording storage is persistent. If using local server storage,
   `backend/uploads/audio/` must be writable and survive pulls/restarts. If
   Digi02 is changed to an ephemeral/container deployment, configure the
   `AUDIO_S3_*` object-storage variables from `backend/.env.example`.
6. Build the web bundle in `frontend/` with
   `VITE_API_URL=/api VITE_BUILD_BASE=/ VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org npm run build`,
   then serve the fresh `dist/`. The `/` base is required for direct SPA links such as
   `/listen/live/:broadcastId`; the default relative base is reserved for the
   packaged desktop app and resolves assets under the deep-link path in a web
   deployment.
7. Restart the backend.

Minimum server capabilities the desktop apps depend on (fail the handoff if
any are missing — do not paper over them):
- `GET /api/health` → `{"status":"ok","service":"echoo-api"}`
- `GET /api/health/recording` → HTTP 200 with FFmpeg + FFprobe available,
  `automaticServerMp3: true`, `trimming: true`
- Auth: register / login / refresh / me
- Broadcast lifecycle: prepare, start, LiveKit token, confirm-live, cancel,
  end-realtime, creator broadcast list, single broadcast fetch, presence
- LiveKit provider throwing `LIVEKIT_CONFIG_MISSING` /
  `LIVEKIT_CONFIG_INVALID` with HTTP status 503 when unconfigured
- Socket.IO events: `broadcast:join`, `broadcast:leave`,
  `broadcast:status`, `presence:changed`, `catalog:changed`
- Guest access for shared listen links (no account): `GET
  /api/broadcasts/:id/public` (public card), `POST
  /api/broadcasts/:id/guest-token` (rate-limited, live+public only,
  subscriber-only token), socket `auth: { guest: true }` handshake with
  transcription handlers rejecting guests
- Served `/` HTML contains `<meta name="echoo-app" content="echoo-frontend">`
  (this marker proves the fresh frontend is actually deployed)

---

## Task 4 — Verify everything (all checks are required)

1. API identity:
   ```bash
   curl -fsS https://echoo.digi02.org/api/health
   ```
   Must report Echoo API healthy.

2. Recording runtime:
   ```bash
   curl -fsS https://echoo.digi02.org/api/health/recording
   ```
   Must return HTTP 200 with `ffmpeg: available`, `ffprobe: available`,
   `automaticServerMp3: true`, and `trimming: true`.

3. Fresh frontend identity:
   ```bash
   curl -fsS https://echoo.digi02.org/ | grep -o 'name="echoo-app"[^>]*'
   ```

4. Desktop-origin CORS check must **not** return `CORS_ORIGIN_DENIED`:
   ```bash
   curl -s -X POST https://echoo.digi02.org/api/auth/login \
     -H "Origin: null" -H "Content-Type: application/json" \
     -d '{"email":"x","password":"y"}'
   ```
   Invalid credentials are acceptable for this probe; CORS denial is not.

5. LiveKit linkage: with the configured server credentials, create and delete a
   test room using the LiveKit server SDK or `lk` CLI. Confirm the LiveKit project
   supports Egress/Track Egress before the recording acceptance test. Do not print secrets.

6. Browser lifecycle: register/sign in, create/use a Channel, start a public
   broadcast, and confirm the creator reaches live state.

7. Separate listener: open the shared link on another browser/device (preferably
   a phone on another network) **after the creator is already live** and confirm
   the existing `echoo-studio-mix` is subscribed and audible. Then repeat one
   short network interruption and confirm playback recovers without duplicate
   audio elements.

8. Recording save: allow several bounded recording chunks, then End Broadcast.
   Confirm:
   - no giant final WAV request;
   - no HTTP 413;
   - one canonical server MP3 appears in Recordings;
   - the MP3 plays from beginning, middle and end after refresh.

9. Durability: restart the backend and confirm that replay still plays. If local
   disk is being used, this proves the uploads path is persistent; if object
   storage is used, it proves archive/playback configuration is correct.

10. Trim: in Recordings, create a trim. Confirm a separate trimmed recording
    appears and plays, while the original recording still exists and plays.

11. Device copy: verify the remembered MP3/WAV/server-only preference behaves as
    configured. On Echoo Desktop, automatic device copies should be organized in
    the Echoo Recordings folder; web/mobile follows browser download rules.

Do not call the server production-ready if any required check above is unverified.

---

## Report back (required)

Reply with: the deployed commit hash, pass/fail for every required check above,
the `/api/health/recording` result, recording storage mode (persistent local
disk or S3-compatible object storage), and confirmation that no secrets were
committed or logged. State any real-browser steps that still require a human
instead of marking them passed without evidence.
