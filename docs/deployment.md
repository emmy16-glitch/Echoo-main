# Deployment & operations

> **Read [../HOSTING.md](../HOSTING.md) before deploying or updating Echoo.**
> It is the authoritative hosting contract. In particular, the backend must have
> **both FFmpeg and FFprobe** before a deployment can be called recording-ready.

## Environments

| Environment | Frontend | API | Database | Purpose |
|---|---|---|---|---|
| Local dev | `localhost:5273` | `localhost:5017` | local/shared MongoDB | Development |
| Vercel `echoo-staging` | Vercel project URL | same origin | staging database | Test/staging only |
| Digi02 production | `https://echoo.digi02.org/` | same origin `/api` | production database | Real hosted deployment |
| Desktop installs | hosted app by default | hosted API | hosted DB | Thin client |

Do not treat the Vercel staging project's "production" target as Echoo's real
production environment. The real public deployment is currently
`https://echoo.digi02.org/`.

## Production dependency gate

A production-capable backend requires:

- Node.js 20+;
- MongoDB;
- LiveKit Cloud or a correctly exposed self-hosted LiveKit server;
- **LiveKit Egress** for the primary server recorder (included in LiveKit Cloud; separate service when self-hosting);
- **FFmpeg**;
- **FFprobe**;
- persistent recording storage;
- frontend reverse-proxy/static hosting;
- optional Whisper transcription.

Verify the binaries from the same account/container that runs Node:

```bash
ffmpeg -version
ffprobe -version
```

If either command fails, automatic server MP3 replays and saved-recording
trimming are not ready.

On Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

If the binaries are installed outside `PATH`, configure:

```env
FFMPEG_PATH=/absolute/path/to/ffmpeg
FFPROBE_PATH=/absolute/path/to/ffprobe
```

## Required production environment

Use `backend/.env.example` as the source of truth and keep real values out of Git.

Minimum groups:

```env
NODE_ENV=production
MONGODB_URI=<production mongodb uri>

JWT_SECRET=<strong secret>
JWT_REFRESH_SECRET=<different strong secret>

CLIENT_ORIGINS=https://your-domain.example

LIVEKIT_URL=wss://<livekit host>
LIVEKIT_PUBLIC_URL=wss://<livekit host>
LIVEKIT_API_KEY=<server-only key>
LIVEKIT_API_SECRET=<server-only secret>

FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
AUDIO_REPLAY_MP3_BITRATE=320k
```

Whisper is optional. LiveKit is not optional for live broadcasting. LiveKit
Egress is required for the primary server-recording path when
`LIVEKIT_SERVER_RECORDING_ENABLED=true`. FFmpeg and FFprobe are not optional
for a recording-capable production backend.

## Recording architecture that hosting must preserve

Echoo does **not** upload one huge final WAV when the creator ends a show.

```text
browser master
  +--> LiveKit -> listeners
  |
  +--> LiveKit Track Egress -> Echoo recording WebSocket
                                 |
                                 +--> backend FFmpeg -> canonical MP3
                                                        |
End Broadcast ------------------------------------------+
                                                        |
                                             persistent disk or S3

browser OPFS master -> recovery only
```

The browser OPFS WAV is a local recovery/lossless-export master. It must not be
turned back into the normal giant final upload.

The canonical live replay defaults to:

```env
AUDIO_REPLAY_MP3_BITRATE=320k
```

Approximate file sizes at 320 kbps:

- 10 minutes: ~24 MB
- 30 minutes: ~72 MB
- 1 hour: ~144 MB

A 500 MB+ WAV request at End Broadcast is a regression, not a reason to raise
the reverse-proxy body limit.

## Recording storage

### Persistent VPS / bare-metal host

If `AUDIO_STORAGE_PROVIDER` is unset, finished MP3 files can stay under:

```text
backend/uploads/audio/
```

That directory must be:

- writable by the backend process;
- persistent across service restarts and code pulls;
- included in backup/restore policy;
- never replaced by a temporary deployment directory.

### Ephemeral/container/serverless host

Use S3-compatible object storage:

```env
AUDIO_STORAGE_PROVIDER=s3
AUDIO_S3_BUCKET_PUBLIC=false
AUDIO_S3_ENDPOINT=<endpoint>
AUDIO_S3_REGION=<region or auto>
AUDIO_S3_BUCKET=<private bucket>
AUDIO_S3_ACCESS_KEY_ID=<secret>
AUDIO_S3_SECRET_ACCESS_KEY=<secret>
AUDIO_S3_PREFIX=echoo-recordings
AUDIO_KEEP_LOCAL_AFTER_ARCHIVE=false
```

Backblaze B2 S3 API, Cloudflare R2, AWS S3, and compatible providers are suitable.

Never claim recordings are durable on an ephemeral container filesystem.

## Saved-recording trimming

Trimming is server-side and non-destructive.

The client sends only start/end timestamps. The backend:

1. obtains the already-saved source recording;
2. verifies FFmpeg/FFprobe;
3. creates a new trimmed media file;
4. creates a separate private Audio record;
5. leaves the original recording unchanged.

For MP3 input, trimming uses stream-copy where possible, avoiding another lossy
MP3 re-encode.

A correct trim must not upload a new giant browser WAV.

## Frontend production build

For a normal same-origin deployment:

```bash
cd frontend
npm install
VITE_API_URL=/api \
VITE_BUILD_BASE=/ \
VITE_PUBLIC_APP_ORIGIN=https://your-domain.example \
npm run build
```

Serve `frontend/dist/` with SPA fallback.

For Digi02 production:

```env
VITE_API_URL=/api
VITE_BUILD_BASE=/
VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org
```

Do not bake a Vercel staging URL into the Digi02 production build.

## Reverse proxy / routing

A typical same-origin host routes:

- `/` and frontend deep links -> Vite `dist/` with SPA fallback;
- `/api/*` -> Echoo backend;
- `/socket.io/*` -> Echoo backend with websocket upgrade;
- `/uploads/*` -> backend/static media when local storage is used.

Preserve websocket upgrade support for Socket.IO and
`/api/internal/livekit-recording` when `LIVEKIT_SERVER_RECORDING_ENABLED=true`.

## CORS and desktop thin clients

The production browser origin should be explicitly trusted.

Echoo Desktop uses a hosted thin-client flow. Its `file://` context can send
`Origin: null`. The backend contains a scoped allowance enabled by:

```env
ECHOO_DESKTOP=1
```

Do not replace this with a blanket wildcard or globally allow every `null`
origin. See `HOSTED-SERVER-SYNC.md`.

## LiveKit

Production requires:

```env
LIVEKIT_URL=wss://...
LIVEKIT_PUBLIC_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

The public URL must be reachable by browsers. Do not use localhost/private
addresses in production.

Guest and authenticated listeners obtain credentials differently, but both enter
the same canonical LiveKit listener playback path. Listener delivery is independent
of recording/transcription: it must remain functional even if Egress, FFmpeg, the
recording WebSocket, or Whisper fails.

## Mandatory health checks

After installing dependencies, configuring environment, and restarting the
backend:

```bash
curl -fsS https://your-domain.example/api/health
curl -fsS https://your-domain.example/api/health/recording
```

The recording probe must return HTTP 200 and report:

```text
ffmpeg: available
ffprobe: available
automaticServerMp3: true
trimming: true
```

Also verify the deployed frontend identity:

```bash
curl -fsS https://your-domain.example/ | grep 'name="echoo-app"'
```

A deployment is not recording-ready merely because `/api/health` succeeds.

## Mandatory real acceptance test

Before announcing a production deployment as complete:

1. sign in/register;
2. creator starts a broadcast;
3. separate browser/phone listener opens the shared link;
4. listener hears the real LiveKit program;
5. allow multiple recording chunks to upload;
6. end the show;
7. confirm no HTTP 413 giant final WAV upload;
8. confirm one server MP3 appears in Recordings;
9. refresh and play beginning/middle/end;
10. restart/redeploy backend and confirm the recording survives;
11. create a trimmed copy and verify both trimmed copy and original play;
12. verify MP3/WAV/server-only device-copy preference.

See [../HOSTING.md](../HOSTING.md) for the complete acceptance contract.

## Digi02 production updates

For `https://echoo.digi02.org/`, use
[../HOSTED-SERVER-SYNC.md](../HOSTED-SERVER-SYNC.md).

That runbook includes:

- pulling current `main`;
- FFmpeg/FFprobe validation;
- production LiveKit configuration;
- frontend build;
- backend restart;
- recording health probe;
- end-to-end verification.

## Vercel staging

Vercel is a staging/test deployment for Echoo. See
[vercel-deployment.md](vercel-deployment.md).

Containerized staging must install FFmpeg in the backend image and use persistent
object storage for canonical recordings.

## Desktop releases

Build from `desktop/`:

```bash
npm run dist:linux
npm run dist:win
npm run dist:mac
```

Default desktop builds are hosted thin clients. Their recording/server behavior
therefore depends on the hosted backend being fully configured, including
FFmpeg/FFprobe and durable recording storage.

## Operational rule for AI agents

If an AI agent is asked to host/deploy/update Echoo, it must read:

1. [../AGENTS.md](../AGENTS.md)
2. [../HOSTING.md](../HOSTING.md)
3. this file
4. [../backend/.env.example](../backend/.env.example)

It must not claim success until required health checks pass. Historical files in
`docs/archive/` are not current deployment authority.
