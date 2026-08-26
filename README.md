# Echoo

Echoo is an audio-first live streaming platform.

## Repository structure

- `frontend/` — React + Vite web client
- `backend/` — Node.js/Express + MongoDB API/control plane
- `mobile/` — mobile client
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

The canonical web client contains both Listener and Creator experiences. Run it
from the frontend directory and use the fixed development URL:

```bash
cd /home/Software_projects/echoo2.0/echoo-github-main/frontend
npm run dev
```

Open `http://localhost:5174`. The Vite server uses `strictPort: true`, so a
port conflict fails clearly instead of silently switching ports. The sibling
`../../echoo` frontend is legacy source and is not the current UI target.

Useful backend health endpoints:

- `/api/health` — liveness
- `/api/health/ready` — MongoDB-backed readiness
- `/api/health/livekit` — LiveKit check
