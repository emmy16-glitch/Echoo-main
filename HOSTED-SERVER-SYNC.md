# Echoo hosted-server sync — instructions for the server AI/agent

> **Read this whole file first, then do every task in order, then verify.**
> Goal: make `https://echoo.digi02.org/` the ONE shared backend for the web
> app and the Echoo Desktop apps (Windows `.exe` / Linux AppImage), with
> LiveKit Cloud audio, so any install can sign up and go live with zero setup.

---

## 0. Background (how the pieces fit)

- Desktop installs currently spawn an isolated local backend each, so every
  machine is its own island: users, channels, broadcasts and presence are
  invisible across machines. LiveKit Cloud is already shared, but broadcast
  discovery is not.
- Target architecture: **one hosted backend** (this server) + LiveKit Cloud.
  New desktop installers will then be pointed at `https://echoo.digi02.org/api`
  and every user lands in the same world.
- Verified facts about this server (2026-09-15, by the desktop engineer):
  - `GET /` → 200, serves an Echoo frontend BUT a stale bundle
    (`assets/index-BVRpHhhk.js`, **no** `<meta name="echoo-app">` marker).
  - `GET /api/health` → `{"status":"ok","service":"echoo-api"}`.
  - Desktop access is **blocked**: `POST /api/auth/login` with
    `Origin: null` returns `{"error":{"code":"CORS_ORIGIN_DENIED", ...}}`.
    (Electron runs over `file://`, so Chromium sends the literal origin
    string `"null"` — the backend must accept it. See Task 1.)
  - LiveKit configuration on this server is **unknown** — Task 2 covers it.

---

## Task 1 — Allow the desktop app through CORS

File: `backend/src/app.js`, function `isAllowedOrigin` (also used by the
Socket.IO server via `echooCorsOrigin`, so one change covers HTTP + realtime).

Change the guard at the top of `isAllowedOrigin` to:

```js
if (!origin || origin === 'null') return true;
```

Why: `file://` pages have no real origin; Chromium sends `"null"`.
Without this, every desktop install gets `CORS_ORIGIN_DENIED`.
Security note: per-request auth is still enforced; do NOT enable
`credentials: true` (leave the existing CORS options untouched).
Restart the backend afterwards.

---

## Task 2 — Configure LiveKit Cloud

> Real credentials below (provided by the project owner for this exact
> purpose). Put them in the server's environment only — never commit them,
> never print them in logs, never echo them into chat.

```env
LIVEKIT_URL=wss://echoo-cdpcubcr.livekit.cloud
LIVEKIT_PUBLIC_URL=wss://echoo-cdpcubcr.livekit.cloud
LIVEKIT_API_KEY=APIPctiUYQbPy73
LIVEKIT_API_SECRET=ugsfWPi0JLTsSUKxGGIEAL3RXe9SeC9c1rbfUY4eix5E
```

Notes:
- `NODE_ENV` must stay `production` — `backend/src/config/env.js` requires
  `wss://` URLs in production, and the values above satisfy that.
- The backend reads these at call time (`requireEnv` in
  `backend/src/providers/livekit.js`), so a backend restart is enough —
  no rebuild needed for this task alone.
- Restart the backend after setting them.

---

## Task 3 — Deploy fresh code (frontend AND backend)

The live site is stale. Deploy the latest repo code and rebuild:

1. Sync your checkout to the newest `main` (if it is behind, ask okunlola
   to push first — the desktop apps already ship newer frontend code and the
   server must be at least as new).
2. `npm install` in `backend/` (production deps only is fine).
3. `npm run build` in `frontend/`, serve the fresh `dist/`.
4. Restart the backend.

Minimum server capabilities the desktop apps depend on (fail the handoff if
any are missing — do not paper over them):
- `GET /api/health` → `{"status":"ok","service":"echoo-api"}`
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

## Task 4 — Verify everything (all five must pass; report each result)

1. `curl -s https://echoo.digi02.org/api/health` → `status "ok"`,
   `service "echoo-api"`.
2. `curl -s https://echoo.digi02.org/ | grep -o 'name="echoo-app"[^>]*'` →
   prints the marker (proves fresh frontend is live).
3. Desktop-origin check (must NOT return `CORS_ORIGIN_DENIED`; an auth error
   such as invalid credentials is the CORRECT answer here):
   ```bash
   curl -s -X POST https://echoo.digi02.org/api/auth/login \
     -H "Origin: null" -H "Content-Type: application/json" \
     -d '{"email":"x","password":"y"}'
   ```
4. With the Task 2 credentials, create and then delete a test room against
   `https://echoo-cdpcubcr.livekit.cloud` (proves Cloud linkage; use the
   `livekit-server-sdk` `RoomServiceClient` or `livekit-cli`/`lk`).
5. End-to-end in a real browser on the site: register a fresh account and go
   live as a creator — the stream must actually start (no
   `LIVEKIT_CONFIG_MISSING`, no generic service error).

---

## Report back (required)

Reply with: the deployed commit hash, pass/fail for each of the five checks
above (paste the outputs), and confirmation that no secrets were committed
or logged. Once this is green, the desktop engineer cuts new installers
pointed at `https://echoo.digi02.org/api` — nothing on the server side
remains.
