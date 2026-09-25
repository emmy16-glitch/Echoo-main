# Echoo hosting — READ THIS BEFORE DEPLOYING

> **Mandatory deployment contract.** If you are a human operator, AI coding agent,
> hosting agent, CI/CD agent, container builder, or infrastructure assistant and
> the request is "host Echoo", "deploy Echoo", "update the server", or similar:
> **read this entire file before doing the deployment.**
>
> Echoo can appear healthy while recording is broken if FFmpeg/FFprobe or durable
> storage is missing. A successful frontend build is not enough.

## 1. What a complete Echoo deployment contains

A hosted Echoo environment has these cooperating pieces:

- React/Vite frontend.
- Node.js/Express + Socket.IO backend.
- MongoDB.
- LiveKit Cloud or a properly reachable self-hosted LiveKit server.
- **FFmpeg + FFprobe on the backend host.**
- Persistent recording storage: local persistent disk on a normal server, or
  S3-compatible object storage for ephemeral/container/serverless hosts.
- Optional Whisper transcription service.

LiveKit carries realtime listener audio. The Echoo backend owns identity,
broadcast lifecycle, recording chunks, replay finalization, Recordings metadata,
trimming, chat/presence, and signed media playback.

## 2. FFmpeg and FFprobe are mandatory

Echoo's production recording flow depends on both binaries.

They are used for:

- automatic server-side live replay MP3 creation;
- replay finalization/fallback assembly;
- MP3 metadata handling;
- duration/audio validation;
- non-destructive server-side saved-recording trimming.

**Without FFmpeg/FFprobe, live WebRTC audio may still work through LiveKit, but
Echoo cannot guarantee the automatic server MP3 or trimming. That is an incomplete
deployment.**

### Install examples

Ubuntu / Debian:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

Fedora / RHEL-compatible systems: install the distribution/package-repository
FFmpeg package that supplies both `ffmpeg` and `ffprobe`.

Alpine:

```bash
apk add --no-cache ffmpeg
```

Docker: install FFmpeg in the backend image. Do not assume the base Node image or
hosting platform already contains it.

If the binaries are not on `PATH`, configure:

```env
FFMPEG_PATH=/absolute/path/to/ffmpeg
FFPROBE_PATH=/absolute/path/to/ffprobe
```

Always verify from the **same runtime/user/container that runs the Echoo backend**:

```bash
ffmpeg -version
ffprobe -version
```

## 3. Understand the recording flow before changing limits

Echoo no longer relies on one giant WAV upload at End Broadcast.

Primary production flow:

```text
Creator Master Output
        |
        +--> LiveKit -> listeners (realtime Opus)
        |
        +--> LiveKit Track Egress
                  |
                  +--> signed Echoo WebSocket
                              |
                              +--> FFmpeg -> canonical MP3
                                             |
End Broadcast -------------------------------+
                                             |
                                  persistent disk or S3
                                             |
                                             v
                                     Creator Recordings

Browser OPFS WAV = recovery master only
```

This prevents a long show from requiring hundreds of MB or gigabytes of raw
PCM to be uploaded from the creator device after the broadcast. LiveKit sends
the already-published program track to the backend; FFmpeg performs the heavy
recording work there.

The browser still keeps a temporary lossless OPFS recovery WAV. That local master:

- protects the creator if server persistence fails;
- may be used for an explicit WAV device copy;
- is **not** the normal giant final upload;
- is cleared only after the canonical server recording is confirmed safe.

Do **not** "fix" recording failures by raising an 80 MB/500 MB/1 GB request limit.
A large final WAV POST means the intended architecture has regressed.

Default canonical live replay quality:

```env
AUDIO_REPLAY_MP3_BITRATE=320k
```

At 320 kbps, approximate MP3 sizes are about 24 MB / 10 min, 72 MB / 30 min,
and 144 MB / hour.

## 4. Saved-recording trimming

Recordings are saved first. Trimming is a later, non-destructive operation.

The browser sends only `startSeconds` and `endSeconds` to the backend.
The backend trims the already-saved recording with FFmpeg and creates a **new
private trimmed Audio record**.

For canonical MP3 input, Echoo uses stream copy where possible so the trim does
not perform another lossy MP3 re-encode. The source recording remains unchanged.

Therefore a correct trim flow is:

```text
original server MP3
   -> creator selects range
   -> timestamps sent to backend
   -> FFmpeg trim
   -> new "trimmed" recording
   -> original still plays
```

There must be no browser-side huge WAV trim upload.

## 5. Device copies

The server replay and the creator's device copy are separate concerns.

Server:
- automatically saves/finalizes the canonical MP3.

Creator device:
- first completed recording asks once for MP3, WAV, or server-only;
- the preference is remembered per device;
- Echoo Desktop writes automatic copies into
  `Desktop/Echoo Recordings/<year>/<month>/`;
- normal web/mobile browsers use their browser download storage because a web
  page cannot silently create arbitrary folders on the user's filesystem;
- files receive human-readable Echoo names so manual renaming is unnecessary.

Typical filename:

```text
Echoo - <Channel> - <Broadcast title> - 2026-09-24 18-42.mp3
```

## 6. Required backend environment

Start from:

```bash
cp backend/.env.example backend/.env
```

Never commit the filled `.env`.

Minimum production groups:

### Database and auth

```env
NODE_ENV=production
MONGODB_URI=<production MongoDB URI>
JWT_SECRET=<strong unique secret>
JWT_REFRESH_SECRET=<different strong unique secret>
CLIENT_ORIGINS=https://your-echoo-domain.example
```

### LiveKit

```env
LIVEKIT_URL=wss://<livekit-host>
LIVEKIT_PUBLIC_URL=wss://<livekit-host>
LIVEKIT_API_KEY=<server-only key>
LIVEKIT_API_SECRET=<server-only secret>
LIVEKIT_SERVER_RECORDING_ENABLED=true
# Optional on same-origin VPS deployments; otherwise set the public backend WS:
LIVEKIT_RECORDING_WS_URL=wss://your-domain.example/api/internal/livekit-recording
```

The recording WebSocket must terminate at the long-lived Echoo Node backend.
It is not a browser endpoint and it does not require Whisper/transcription.

Production LiveKit browser-facing URLs must be public/reachable `wss://` URLs,
not localhost/private addresses.

### Recording

```env
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
AUDIO_REPLAY_MP3_BITRATE=320k
```

### Optional durable S3-compatible storage

Use this when local disk is ephemeral, when running serverless/container hosts
without a persistent volume, or whenever recordings must survive replacement
instances.

```env
AUDIO_STORAGE_PROVIDER=s3
AUDIO_S3_BUCKET_PUBLIC=false
AUDIO_S3_ENDPOINT=<provider endpoint>
AUDIO_S3_REGION=<region or auto>
AUDIO_S3_BUCKET=<private bucket>
AUDIO_S3_ACCESS_KEY_ID=<secret>
AUDIO_S3_SECRET_ACCESS_KEY=<secret>
AUDIO_S3_PREFIX=echoo-recordings
AUDIO_KEEP_LOCAL_AFTER_ARCHIVE=false
```

Supported S3-compatible choices include Backblaze B2 S3 API, Cloudflare R2,
AWS S3, and compatible providers.

If `AUDIO_STORAGE_PROVIDER` is unset on a normal VPS/bare-metal host, canonical
MP3 files stay under `backend/uploads/audio/`. That directory must be writable,
backed up, and persistent across restarts/deploys.

## 7. Frontend production configuration

The web app normally talks to the same origin:

```env
VITE_API_URL=/api
VITE_PUBLIC_APP_ORIGIN=https://your-echoo-domain.example
VITE_BUILD_BASE=/
```

For the current Digi02 production deployment:

```env
VITE_API_URL=/api
VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org
VITE_BUILD_BASE=/
```

Do not bake the Vercel staging origin into a real production build.

## 8. Vercel staging is not Digi02 production

The repository currently uses a Vercel project as a staging/test environment.
The real hosted Echoo production site is:

```text
https://echoo.digi02.org/
```

A Vercel deployment marked "production" inside that Vercel project is still
**Echoo staging by project convention**.

For Vercel/container deployments:
- FFmpeg must be installed in the backend image;
- canonical audio must use persistent object storage;
- never trust ephemeral container disk for finished recordings.

See [docs/vercel-deployment.md](docs/vercel-deployment.md).

## 9. Install, build and restart

Generic VPS flow:

```bash
git pull origin main

cd backend
npm install
# create/update backend/.env without printing secrets

cd ../frontend
npm install
VITE_API_URL=/api \
VITE_BUILD_BASE=/ \
VITE_PUBLIC_APP_ORIGIN=https://your-echoo-domain.example \
npm run build
```

Then restart the backend using the host's actual process manager (for example
systemd, PM2, Docker Compose, Kubernetes, or the provider's service runtime).
Do not invent a PM2/systemd command if the existing deployment uses something else.

Serve `frontend/dist/` with SPA fallback and proxy at least:

- `/api/*` -> backend;
- `/socket.io/*` -> backend;
- `/uploads/*` -> backend when local media is served through the backend.

For Digi02-specific update steps, use [HOSTED-SERVER-SYNC.md](HOSTED-SERVER-SYNC.md).

## 10. Mandatory post-deploy health checks

The backend is not ready until all required probes pass.

```bash
curl -fsS https://your-echoo-domain.example/api/health
curl -fsS https://your-echoo-domain.example/api/health/recording
```

The recording health endpoint must return HTTP 200 and indicate:

```text
ffmpeg: available
ffprobe: available
automaticServerMp3: true
trimming: true
```

If it returns 503 or a binary is reported missing, fix the backend image/host
before performing a production broadcast.

Also verify the served frontend is current:

```bash
curl -fsS https://your-echoo-domain.example/ | grep 'name="echoo-app"'
```

## 11. Mandatory real end-to-end acceptance

Health endpoints are necessary but not sufficient.

Before declaring the deployment complete:

1. Register/sign in.
2. Creator starts a public broadcast.
3. A second browser/device opens the shared link.
4. Confirm the listener receives the actual `echoo-studio-mix` audio.
5. Keep the show running long enough to send several recording chunks.
6. End Broadcast.
7. Confirm the UI reaches Saved/Recordings without HTTP 413.
8. Confirm exactly one canonical MP3 replay exists and plays from beginning,
   middle and end after a page refresh.
9. Restart/redeploy the backend and confirm the replay still plays.
10. Open Recordings, select a range, Trim, and confirm:
    - a separate trimmed recording appears;
    - the trimmed copy plays;
    - the original still plays and was not overwritten.
11. Verify the configured device-copy policy:
    - MP3 device copy, or
    - WAV device copy while the local master is available, or
    - server-only.
12. Test a phone listener on a separate network if mobile listening matters for
    the deployment.

Do not call the deployment finished based only on `npm run build`.

## 12. Failure rules for hosting agents

If automatic MP3 save fails:
- inspect `/api/health/recording`;
- verify FFmpeg/FFprobe in the backend runtime;
- inspect bounded recording chunk start/upload/complete requests;
- inspect storage permissions/object-storage credentials;
- preserve the browser recovery master.

If trimming fails:
- verify FFmpeg/FFprobe;
- verify the source media is readable locally or from configured object storage;
- do not overwrite/delete the original to hide the failure.

If a request returns HTTP 413:
- identify the request;
- do not blindly raise proxy/body limits;
- a live replay should use bounded chunks and server finalization, not one giant
  final WAV upload.

If LiveKit listening fails:
- debug LiveKit separately from recording storage;
- the media authority is LiveKit, not the replay MP3.

## 13. AI/automation completion contract

An AI agent asked to "host Echoo" or "update the server" must not stop after
editing files or producing a deployment report.

It should, within its permissions:

- inspect the current host/runtime;
- install or configure missing mandatory dependencies;
- configure environment values without exposing secrets;
- build/restart the correct services;
- run the health probes;
- perform or clearly request the real end-to-end broadcast test;
- state exactly what remains unverified.

If the agent cannot install OS packages because it lacks root/sudo/provider
permissions, it must report **FFmpeg/FFprobe installation as a blocking host
requirement** instead of pretending recording is ready.

## 14. Related current documentation

- [AGENTS.md](AGENTS.md) — mandatory agent rules.
- [docs/deployment.md](docs/deployment.md) — deployment overview.
- [docs/getting-started.md](docs/getting-started.md) — local development.
- [docs/audio-architecture.md](docs/audio-architecture.md) — audio/recording internals.
- [backend/.env.example](backend/.env.example) — environment variable reference.
- [HOSTED-SERVER-SYNC.md](HOSTED-SERVER-SYNC.md) — Digi02 operator runbook.
- [docs/vercel-deployment.md](docs/vercel-deployment.md) — Vercel staging/container notes.

**Do not use `docs/archive/` as deployment authority.** Those files are frozen
historical reports and can describe superseded flows.
