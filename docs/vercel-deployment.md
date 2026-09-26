# Echoo on Vercel

> **This repository's Vercel project is Echoo staging/test infrastructure, not
> the real Digi02 production site.** Before changing any deployment, read
> [../HOSTING.md](../HOSTING.md).

Echoo's Vercel staging project contains:

- `frontend`: React/Vite application;
- `backend`: Express + Socket.IO API running in a Node container;
- same-origin routing for API/realtime/media.

Public routing:

- `/api/*` -> backend
- `/socket.io/*` -> backend
- `/uploads/*` -> backend
- everything else -> frontend

The frontend can therefore use `VITE_API_URL=/api`.

## Staging vs real production

The Vercel project's "production" target is **Echoo staging by project convention**.

The real public production deployment is currently:

```text
https://echoo.digi02.org/
```

Do not change production URLs/share-link origins to a Vercel URL when preparing
the Digi02 build.

## FFmpeg and FFprobe are mandatory in the backend image

Echoo requires both binaries for:

- automatic canonical server MP3 replay finalization;
- replay fallback assembly/validation;
- saved-recording server-side trimming.

The backend container/image must explicitly install the distro FFmpeg package.
Do not assume Vercel or a base Node runtime includes it.

Verify inside the backend runtime:

```bash
ffmpeg -version
ffprobe -version
```

The deployed readiness probe must return HTTP 200:

```text
GET /api/health/recording
```

and report:

```text
ffmpeg: available
ffprobe: available
automaticServerMp3: true
trimming: true
```

If this probe is 503, the staging deployment is not recording-ready.

## Required environment variables

Set secrets through Vercel encrypted project environment variables. Never commit
or print real secret values.

### Database and auth

```text
MONGODB_URI=<hosted MongoDB connection string>
JWT_SECRET=<long random secret>
JWT_REFRESH_SECRET=<different long random secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

A machine-local MongoDB URI will not work from Vercel.

### LiveKit

```text
LIVEKIT_URL=wss://<your-livekit-host>
LIVEKIT_PUBLIC_URL=wss://<your-livekit-host>
LIVEKIT_API_KEY=<secret>
LIVEKIT_API_SECRET=<secret>
LIVEKIT_TOKEN_TTL_MINUTES=120
LIVEKIT_CREATOR_DISCONNECT_GRACE_MS=20000
```

The browser receives the public LiveKit URL from the backend.

### Recording tools

```text
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
AUDIO_REPLAY_MP3_BITRATE=320k
```

### Recording object storage

Vercel/container disk is ephemeral. Do **not** treat it as canonical finished
recording storage.

```text
AUDIO_STORAGE_PROVIDER=s3
AUDIO_S3_BUCKET_PUBLIC=false
AUDIO_S3_ENDPOINT=<S3-compatible endpoint>
AUDIO_S3_REGION=<provider region or auto>
AUDIO_S3_BUCKET=<private bucket>
AUDIO_S3_ACCESS_KEY_ID=<secret>
AUDIO_S3_SECRET_ACCESS_KEY=<secret>
AUDIO_S3_PREFIX=echoo-recordings
AUDIO_REPLAY_MP3_BITRATE=320k
AUDIO_MP3_BITRATE=192k
AUDIO_KEEP_LOCAL_AFTER_ARCHIVE=false
```

Cloudflare R2, Backblaze B2 S3 API, AWS S3, or another compatible provider can
be used.

The canonical replay must survive backend instance replacement/redeploy.

## Recording flow on Vercel

Vercel is staging/test infrastructure. Its serverless/container characteristics
must not be mistaken for the long-lived Digi02 server-recorder environment.

When a long-lived backend that can accept the recording WebSocket is available:

```text
creator master
   -> LiveKit program track
   -> listeners
   -> LiveKit Track Egress
   -> long-lived Echoo recording WebSocket
   -> backend FFmpeg MP3
   -> persistent object storage
```

If the staging runtime cannot reliably accept that long-lived WebSocket, set
`LIVEKIT_SERVER_RECORDING_ENABLED=false`. The browser still records the OPFS
recovery master locally, and any browser WAV recovery upload must begin only
after OFF AIR. Never re-enable raw PCM/WAV uploads during the live show merely
to make staging recording work.

If you see a giant WAV request returning 413, do not raise Vercel/body limits
as the primary fix. Find why the intended server-recorder/post-live recovery
path was bypassed.

## Saved recording trims

Trimming is server-side.

The browser sends timestamps. The backend obtains the saved source from object
storage when needed, runs FFmpeg, creates a new trimmed file/Audio record, and
leaves the original unchanged.

MP3 trims use stream-copy where possible to avoid unnecessary quality loss.

## Transcription

Transcription is optional and independent of LiveKit and canonical recording:

```text
WHISPER_FLOW_URL=
WHISPER_FLOW_API_KEY=
WHISPER_QUALITY_FLOW_URL=
WHISPER_QUALITY_FLOW_API_KEY=
```

Do not re-enable live browser recording chunks just because Whisper is disabled. Transcription is independent; when disabled, it must add zero work to the live recording path.

## Email (optional)

```text
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_NEW_SIGNIN_ALERTS=false
```

## Vercel-generated origins

The backend trusts the exact HTTPS origins exposed by:

- `VERCEL_PROJECT_PRODUCTION_URL`
- `VERCEL_BRANCH_URL`
- `VERCEL_URL`

Set `CLIENT_ORIGINS` explicitly when adding a custom domain.

## Persistence warning beyond recordings

Finished recordings must use durable object storage.

Other legacy uploaded image/media paths may still use local-disk-compatible
paths. Never assume ephemeral Vercel disk is durable for those either; migrate
them to persistent object storage before relying on them across instance
replacement.

Browser OPFS recovery is on the creator's browser and is independent of the
Vercel backend container.

## Realtime scaling note

Echoo Socket.IO currently uses in-process rooms. Treat the current backend as a
single-instance/MVP realtime deployment unless a shared Socket.IO adapter is
configured. Before horizontal scaling, add a shared adapter such as Redis so
presence/chat rooms are consistent across instances.

## Mandatory validation after deployment

Verify against the deployed Vercel staging URL:

1. `GET /api/health` returns Echoo API identity.
2. `GET /api/health/recording` returns HTTP 200 with recording/trimming ready.
3. Sign in, refresh, and token refresh work.
4. Creator and Listener deep routes hard-refresh.
5. Socket.IO connects through the same origin.
6. Creator starts LiveKit broadcast; separate browser/phone hears it.
7. Several bounded recording chunks are accepted during the show.
8. End Broadcast completes without a giant final WAV upload/HTTP 413.
9. Exactly one canonical MP3 appears in Recordings.
10. Replay plays after page refresh.
11. Replace/redeploy backend instance; replay still plays from object storage.
12. Trim a saved replay; separate trimmed copy appears and original still plays.
13. Browser recovery master is not removed before server persistence is confirmed.

Do not declare staging recording-ready from build success alone.

## Current staging convention

The public staging/test environment is connected to
`emmy16-glitch/Echoo-main` branch `main`.

Non-secret architecture expectations:

- staging database is separate from production;
- private S3-compatible recording storage is used;
- LiveKit Cloud is shared/configured with server-only key/secret;
- frontend uses `VITE_API_URL=/api`;
- staging share links remain staging links;
- Digi02 production remains separate.

Keep secrets in Vercel/environment storage only. Never commit or echo them.

## AI-agent rule

An AI agent asked to deploy/redeploy Echoo on Vercel must read:

1. [../AGENTS.md](../AGENTS.md)
2. [../HOSTING.md](../HOSTING.md)
3. this file
4. [../backend/.env.example](../backend/.env.example)

It must verify FFmpeg/FFprobe and durable recording storage before reporting the
deployment ready.
