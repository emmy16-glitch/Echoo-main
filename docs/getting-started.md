# Getting started

## Prerequisites

- Node.js 20+
- MongoDB (local or a URI)
- **FFmpeg and FFprobe on PATH** — required for automatic server MP3 replay finalization and server-side trimming
- for going live locally, a LiveKit server (`livekit-server --dev` works)
- Python 3.10 only if you are running the optional Whisper transcription service

Verify recording tools before debugging the app:

```bash
ffmpeg -version
ffprobe -version
```

If either binary is missing, the live WebRTC path can still be developed, but
the backend is not recording-capable. For any real host/deployment task, read
[../HOSTING.md](../HOSTING.md) first.

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

Key groups in `backend/.env.example`: API/JWT, MongoDB, LiveKit (`LIVEKIT_*`),
recording tools (`FFMPEG_PATH`, `FFPROBE_PATH`), recording archive
(`AUDIO_*`, S3-compatible), transcription (Whisper, optional), radio/master
outputs (optional). Never commit real secrets — `.env` files are gitignored.

For local recording verification after the backend starts:

```bash
curl -fsS http://127.0.0.1:5017/api/health/recording
```

It should report FFmpeg/FFprobe available and both automatic server MP3 and
trimming enabled.

## Tests

```bash
cd backend  && npm test     # node --test suite (DB layer faked where noted)
cd frontend && node --test src/services/*.test.mjs src/Components/CreatorStudio/*.test.mjs
cd mobile   && npx tsc --noEmit && npx eslint src modules/echoo-live-audio-service/src
```


## Recording note

The normal live recording path uses bounded audio chunks during the show and
server-side MP3 finalization at End Broadcast. The browser's OPFS WAV is a local
recovery/lossless-export master. Do not test or implement the old pattern of
uploading one giant final WAV at the end.

Saved recordings are trimmed later on the backend. The client sends timestamps;
the original recording is preserved and a separate trimmed copy is created.
