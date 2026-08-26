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

### Landing site source

The public marketing and release site is intentionally maintained in a **separate private repository** so it can evolve without being embedded in the live-audio application source. Clone it beside this repository when you want to run or redesign the landing site locally on Ubuntu:

```bash
cd ~/Projects
git clone https://github.com/effiukp/Echoo-landing.git echoo-landing
cd echoo-landing
corepack enable
pnpm install
pnpm dev:design
```

Open the local URL printed by the command, normally `http://localhost:5173`. See [`LOCAL_DESIGN.md`](https://github.com/effiukp/Echoo-landing/blob/main/LOCAL_DESIGN.md) in the landing repository for page entry points and design guidance. The landing source uses its own repository; do not expect an `echoo-landing/` directory inside `Echoo-main`.

Useful backend health endpoints:

- `/api/health` — liveness
- `/api/health/ready` — MongoDB-backed readiness
- `/api/health/livekit` — LiveKit check
