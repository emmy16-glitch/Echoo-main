# Echoo

Echoo is an audio-first live streaming platform.

## Repository structure

- `frontend/` — React + Vite web client
- `backend/` — Node.js/Express + MongoDB API/control plane
- `mobile/` — mobile client
- `desktop/` — Electron desktop client and packaging configuration
- `echoo-landing/` — React/Vite public marketing and release site
- Live media — LiveKit
- Realtime product events — Socket.IO

## Current live audio path

```text
Host/Guest/System audio
        ↓
Echoo Web Audio mixer
        ↓
post-master `echoo-studio-mix`
        ↓
LiveKit
        ↓
receive-only listeners
```

The Express backend manages identity, lifecycle, chat, presence synchronization, tokens and product data. It does not relay the live audio stream per listener.

## Prerecorded audio

Audio bytes currently live on local backend disk, but direct `/uploads/audio/...` access is blocked. Playback uses scoped protected `/api/audio/:id/stream` URLs with HTTP Range support. Explicit downloads remain authenticated.

Private object storage/CDN is a future production-scale replacement for the physical disk layer; the authorization model should remain in front of it.

## Realtime scaling

Socket.IO currently runs in-process. A single API process is supported. Multi-instance deployment requires a shared Socket.IO adapter/state layer before realtime rooms/events can span backend instances.

## Optional future media infrastructure

LiveKit Egress and OvenMediaEngine are not required by the current direct LiveKit listening architecture.

## Development

Create frontend/backend environment files from their checked-in examples. Never commit real secrets.

### Landing site source

The public marketing and release site is maintained as the `echoo-landing/` subproject within this repository, alongside the web, mobile, and desktop sources. To run or redesign the landing site locally on Ubuntu:

```bash
cd ~/Projects
gh repo clone effiukp/Echoo-main Echoo-main
cd Echoo-main/echoo-landing
corepack enable
pnpm install
pnpm dev:design
```

Open the local URL printed by the command, normally `http://localhost:5173`. See [`echoo-landing/LOCAL_DESIGN.md`](echoo-landing/LOCAL_DESIGN.md) for page entry points and design guidance. The `echoo-landing/` directory is the canonical marketing-site source within Echoo-main; the prior standalone checkout is retained locally only as a recovery copy during this migration.

### Current web client

For a user-owned local MongoDB (no sudo required), start the database before
the API:

```bash
cd backend
npm run db:local
npm run dev
```

The helper stores data in `~/echoo-mongodb/data`, writes logs to
`~/echoo-mongodb/logs/mongod.log`, and deliberately avoids the shared MongoDB
Unix socket in `/tmp`. To create the local-only Creator presentation account,
run `npm run seed:local-demo`. It refuses every non-development or non-local
`echoo` MongoDB URI.

The canonical web client contains both Listener and Creator experiences. Run it
from the frontend directory and use the fixed development URL:

```bash
cd /home/Software_projects/echoo2.0/echoo-github-main/frontend
npm run dev
```

Open `http://localhost:5173`. The Vite server uses `strictPort: true`, so a
port conflict fails clearly instead of silently switching ports. The sibling
`../../echoo` frontend is legacy source and is not the current UI target.

The frontend's development-only API setting lives in
`frontend/.env.development.local` (copy its `.example` file if needed) and
targets the configured local API (normally `http://localhost:5001/api`). This
file is not loaded into production Vite builds.

For a LAN presentation, set `CLIENT_ORIGIN`/`CLIENT_ORIGINS` in the ignored
`backend/.env` and `VITE_API_URL` in the ignored
`frontend/.env.development.local` to the laptop's LAN address. Vite already
listens on `0.0.0.0`; run `npm run dev -- --host 0.0.0.0` and share the Vite
network URL. MongoDB remains bound to `127.0.0.1`.

Useful backend health endpoints:

- `/api/health` — liveness
- `/api/health/ready` — MongoDB-backed readiness
- `/api/health/livekit` — LiveKit check
