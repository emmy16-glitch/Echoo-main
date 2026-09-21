# Getting started

## Prerequisites

Node.js 20+, MongoDB (local or a URI), FFmpeg on PATH (recording transcode), and — for going live locally — a LiveKit server (`livekit-server --dev` works).

## One-command dev stack

```bash
sh scripts/dev-all.sh   # from the repo root
```

This starts, in order and with readiness polling (never fixed sleeps): MongoDB (if needed) → LiveKit (`livekit-server --dev` when installed) → backend (waits for `/api/health`) → frontend (waits for HTTP 200 + app identity) → desktop (foreground; Ctrl-C stops everything).

Per-service equivalents (run from the service directory):

```bash
cd backend  && npm run dev   # needs MongoDB: npm run db:local
cd frontend && npm run dev   # Vite, see ports below
cd desktop  && npm run dev   # Electron, waits for the Vite server
cd mobile   && npm start     # Expo (see mobile/README.md)
```

## Ports (project-specific, on purpose)

This repo is developed on a shared multi-user machine, so defaults avoid squatted framework ports:

| Service | Port | Override |
|---|---|---|
| Frontend (Vite) | **5273** | `VITE_PORT` |
| Backend API | **5017** | `PORT` |
| LiveKit (local dev) | 7880 | — |

Every readiness gate verifies **app identity**, not just liveness: the frontend serves a `<meta name="echoo-app">` marker and `/api/health` returns Echoo's shape. A bare HTTP 200 from someone else's server on a squatted port fails loudly instead of loading foreign content. Never auto-kill port occupants — identify them with `sh scripts/check-ports.sh <port> "<label>"`.

## Environment

```bash
cp backend/.env.example backend/.env   # then fill in LiveKit + storage keys
```

Key groups in `backend/.env.example`: API/JWT, MongoDB, LiveKit (`LIVEKIT_*`), recording archive (`AUDIO_*`, S3-compatible), transcription (Whisper, optional), radio/master outputs (optional). Never commit real secrets — `.env` files are gitignored.

## Tests

```bash
cd backend  && npm test     # node --test suite (DB layer faked where noted)
cd frontend && node --test src/services/*.test.mjs src/Components/CreatorStudio/*.test.mjs
cd mobile   && npx tsc --noEmit && npx eslint src modules/echoo-live-audio-service/src
```
