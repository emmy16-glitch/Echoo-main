# Echoo Desktop — release guide

Native shell around the React frontend (`../frontend`). Default builds are
**hosted thin clients** for `https://echoo.digi02.org` — end users install one
file and land in the same world as the web app: no Node, no MongoDB, no
terminal. A bundled local API + embedded DB remains available only as an
opt-in (`ECHOO_LOCAL_BACKEND=1`, offline development).

## Standalone runtime (packaged app)

- On launch the shell loads the live app URL (`ECHOO_URL` override or
  `https://echoo.digi02.org`); no local server is spawned or required.
- Opt-in local backend (`ECHOO_LOCAL_BACKEND=1`, offline development): the
  shell probes `http://127.0.0.1:5017/api/health`. If an Echoo API is already
  there (e.g. a developer running the repo stack), it is reused; otherwise the
  bundled server is spawned and stopped on quit.
- Server data (uploads, transcript chunks) lives in per-user app storage
  (`server-data/` under Electron `userData`), never in the read-only bundle.
  Per-machine JWT secrets are generated once (`echoo-server-secrets.json`,
  mode 0600) unless `JWT_SECRET`/`JWT_REFRESH_SECRET` are set in the env.
- Database: the bundled server uses the machine-local MongoDB when one
  answers, else boots an embedded MongoDB (`mongodb-memory-server`,
  `ECHOO_DESKTOP=1` path in `backend/src/config/database.js`) with data files
  in `server-data/mongo-data` (persists across restarts). **First launch
  downloads the mongod binary once (~120 MB, needs internet)** into the OS
  cache; later launches are fully offline.
- Dev (`npm run dev` / `npm start`) never spawns anything extra: if the repo
  backend is already up it is reused, otherwise start it with
  `cd backend && npm run dev` as usual (`../backend/src/app.js` from `desktop/`).

## Going live (LiveKit audio server)

The Creator "Go Live" flow needs a LiveKit WebRTC server. Without one the
backend fails the start-broadcast call and the app now says so plainly
("Live audio is not set up on this Echoo server yet") instead of a generic
error. Two ways to provide it:

- **Local dev:** `livekit-server --dev --port 7880` (placeholder credentials
  `devkey` / `secret` — local only), plus in `backend/.env`:
  `LIVEKIT_URL=ws://127.0.0.1:7880`, `LIVEKIT_PUBLIC_URL=ws://127.0.0.1:7880`,
  `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret`. The repo
  `sh scripts/dev-all.sh` loop starts this automatically when the binary exists.
- **Real deployments:** a LiveKit Cloud project (or self-hosted server) with
  public `wss://` URLs — set the same four vars to the real values. For the
  packaged desktop's bundled server, put them in a `.env` file inside
  `server-data/` (the bundled backend's working directory, loaded by dotenv).

## Dev quickstart (recommended)

From the repo root, one command starts everything in order with readiness
polling (no fixed sleeps, no three-terminal juggling):

```bash
sh scripts/dev-all.sh   # from the repo root
# overrides: VITE_PORT=5274 sh scripts/dev-all.sh   (frontend on another port)
#            PORT=5018 sh scripts/dev-all.sh        (backend on another port)
```

This starts MongoDB (if needed) → backend (waits for `/api/health`) →
frontend (waits for HTTP 200) → desktop (foreground; Ctrl-C stops all three).
Service logs: `/tmp/echoo-backend-dev.log`, `/tmp/echoo-frontend-dev.log`.

Per-service equivalents (run from the service dir, **not** the repo root —
“Missing script: dev” from the root just means wrong directory):

```bash
cd backend  && npm run dev   # needs MongoDB: npm run db:local (first time: seed via seed:local-demo)
cd frontend && npm run dev   # Vite on $VITE_PORT or 5273
cd desktop  && npm run dev   # resolves the Vite port, waits for it, launches Electron
```

### Shared-server warning: ports AND identity checks

This repo is developed on a shared multi-user Linux machine, so the defaults
are deliberately project-specific, not framework defaults:

- frontend Vite: **5273** (not Vite's 5173 — routinely owned by other users here)
- backend API: **5017** (not 5001 — also observed squatted)

The single source of truth is `frontend/vite.config.js` (`VITE_PORT` override)
for the frontend and `backend/src/config/env.js` (`PORT` override) for the API;
the Vite proxy, CORS origins, and desktop CSP/connect-src follow those values.

A bare HTTP 200 is not proof on this machine — it may be someone else's dev
server on a squatted port (this actually happened: Electron loaded a foreign
"DigiVolt" page believing it was Echoo). So every readiness gate verifies APP
IDENTITY, not just liveness:

- `frontend/index.html` carries `<meta name="echoo-app" content="echoo">`
- `dev-all.sh` requires that marker in the served HTML, and requires
  `/api/health` to return Echoo's shape (`status "ok"` + `service "echoo-api"`)
- `desktop/scripts/dev-launcher.js` and `main.js` re-verify the marker before
  `loadURL` — two independent gates, so neither alone can slip a false positive
  through. Mismatch aborts with "port responded but the content doesn't look
  like Echoo" instead of launching.

Stale-port protection: every `npm run dev` first runs a port check
(`scripts/check-ports.sh`) that fails LOUDLY with the occupant's details
instead of starting on top of it — never auto-kills. Note the frontend does
NOT use `vite --strictPort` (`strictPort: false` in `vite.config.js`), so the
identity-marker gate above is what protects Electron from silently loading a
squatter's fallback port. If Electron itself can't reach the dev
server it shows an error screen naming the expected port (or set
`ECHOO_DEV_URL=http://localhost:XXXX npm run dev` in desktop/).

## Run / package (from desktop/)

```bash
npm run dev        # dev shell (resolves + waits for the Vite server first)
npm start          # raw Electron entry (same window, but ensure the dev server is up yourself)
npm run dist       # electron-builder for current OS (does NOT rebuild the frontend — run the frontend build first)
npm run dist:linux # … --linux only → dist/Echoo-1.0.6.AppImage
npm run dist:win   # … --win only → dist/Echoo-Setup-1.0.6-*.exe (NSIS installer, builds on Linux via Wine)
npm run dist:mac   # … --mac only (DMG; best built on a Mac)
```

Installers ship the thin-client app pointed at the live API. (Only the
explicit `dist:win:local-backend` opt-in bundles a local API +
embedded-DB fallback.) The Windows build is unsigned until a cert
is configured (`CSC_LINK`/`CSC_KEY_PASSWORD`), so SmartScreen shows an
"Unknown publisher" prompt — expected, not a bug. First launch of a
local-backend build on any OS downloads the mongod binary once (~120 MB)
when no local MongoDB answers.

`desktop/` deps are intentionally minimal: `electron`, `electron-builder`,
`electron-log` (structured logs), `electron-updater` (GitHub Releases updates).

## Code signing & notarization

Scaffolding is committed; certs are NOT. Until they exist, builds succeed but
OSes warn on install — that is expected, not a bug.

### macOS (DMG)

Needs a paid Apple Developer account + Developer ID Application certificate in
the signing keychain/CI runner, plus these env vars at build time:

| Env var | Purpose |
|---|---|
| `APPLE_ID` | Apple ID enrolled in the Developer Program |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that ID |
| `APPLE_TEAM_ID` | 10-char Team ID |
| `CSC_LINK` / `CSC_KEY_PASSWORD` | (optional) .p12 cert if not in keychain |

How it works: `build.mac.hardenedRuntime: true` + `entitlements.mac.plist`
(microphone for creators, JIT allowances Electron requires) apply at sign time;
`scripts/afterSign.js` notarizes + staples when the `APPLE_*` vars are present
and **skips with a warning** when they aren't. Also add
`npm install --save-dev @electron/notarize` once certs exist.
Unsigned result: Gatekeeper blocks with “cannot be opened because the developer
cannot be verified” (right-click → Open still works).

### Windows (NSIS)

electron-builder signs automatically when these env vars are set:

| Env var | Purpose |
|---|---|
| `CSC_LINK` | Path/URL to the code-signing .pfx/.p12 (or Azure Trusted Signing config) |
| `CSC_KEY_PASSWORD` | Cert password |

Unsigned result: SmartScreen “Unknown publisher” warning on install.

## Auto-updates

Published via GitHub Releases (`emmy16-glitch/Echoo-main`) — attach the
installer artifacts from a tagged release and `electron-updater` picks them up
on next launch (packaged builds only). The check is fire-and-forget: offline or
no releases yet → warning in the log, app starts normally. “Update downloaded”
shows a Restart-now/Later prompt.

## Pre-release testing matrix

| # | Check | mac | win | linux |
|---|---|---|---|---|
| 1 | Fresh `npm run dist` → installer builds | ☐ | ☐ | ☐ |
| 2 | Fresh install → login/stream == browser | ☐ | ☐ | ☐ |
| 3 | Quit + relaunch preserves auto-launch | ☐ | ☐ | ☐ |
| 4 | 2nd launch focuses existing window | ☐ | ☐ | ☐ |
| 5 | Kill backend mid-session → retry page, no crash | ☐ | ☐ | ☐ |
| 6 | Signed/notarized → no OS install warning | ☐ | ☐ | n/a |

Linux notes: verify on the AppImage target (`dist:linux`). `setLoginItemSettings`
works on AppImage but is a no-op under Snap/Flatpak confinement (we don't ship
those — see the comment at the auto-launch IPC handler in `src/main.js`).
