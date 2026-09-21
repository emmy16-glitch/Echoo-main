# Echoo on Vercel

Echoo is configured as one Vercel project with two internal services:

- `frontend`: the Vite/React application.
- `backend`: the Express + Socket.IO API in a Node container with FFmpeg.

Public routing stays same-origin:

- `/api/*` -> backend
- `/socket.io/*` -> backend
- `/uploads/*` -> backend
- everything else -> frontend

This lets the browser keep `VITE_API_URL=/api` and avoids cross-origin API/Socket.IO drift.

## Required production environment variables

Set these as encrypted Vercel project environment variables. Never commit their real values.

### Database and auth

```text
MONGODB_URI=<hosted MongoDB connection string>
JWT_SECRET=<long random secret>
JWT_REFRESH_SECRET=<different long random secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

A machine-local MongoDB URI will not work in Vercel. Use a reachable hosted MongoDB deployment.

### LiveKit

```text
LIVEKIT_URL=wss://<your-livekit-host>
LIVEKIT_PUBLIC_URL=wss://<your-livekit-host>
LIVEKIT_API_KEY=<secret>
LIVEKIT_API_SECRET=<secret>
LIVEKIT_TOKEN_TTL_MINUTES=120
LIVEKIT_CREATOR_DISCONNECT_GRACE_MS=20000
```

The browser receives the public LiveKit URL from the backend, so the Vercel frontend image does not need a baked `VITE_LIVEKIT_URL`.

### Recording object storage

Do not use local container disk as canonical recording storage.

```text
AUDIO_STORAGE_PROVIDER=s3
AUDIO_S3_BUCKET_PUBLIC=false
AUDIO_S3_ENDPOINT=<S3-compatible endpoint>
AUDIO_S3_REGION=<provider region or auto when supported>
AUDIO_S3_BUCKET=<private bucket>
AUDIO_S3_ACCESS_KEY_ID=<secret>
AUDIO_S3_SECRET_ACCESS_KEY=<secret>
AUDIO_S3_PREFIX=echoo-recordings
AUDIO_MP3_BITRATE=192k
AUDIO_KEEP_LOCAL_AFTER_ARCHIVE=false
```

Cloudflare R2, Backblaze B2 S3 API, AWS S3, or another compatible provider can be used.

### Transcription

Transcription is intentionally disabled for the current deployment:

```text
WHISPER_FLOW_URL=
WHISPER_FLOW_API_KEY=
WHISPER_QUALITY_FLOW_URL=
WHISPER_QUALITY_FLOW_API_KEY=
```

Do not disable the recording PCM/chunk pipeline; it is independent of Whisper.

### Email (optional)

```text
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_NEW_SIGNIN_ALERTS=false
```

## Vercel-generated origins

The backend automatically trusts the exact HTTPS origins exposed by:

- `VERCEL_PROJECT_PRODUCTION_URL`
- `VERCEL_BRANCH_URL`
- `VERCEL_URL`

You may still set `CLIENT_ORIGINS` explicitly when adding a custom domain.

## FFmpeg

The backend Vercel container installs FFmpeg from Debian packages. Echoo therefore does not depend on Vercel's default Node runtime having FFmpeg preinstalled.

## Persistence warning

Canonical finished audio must use object storage.

The current code still has legacy local-disk paths for some non-audio media (avatars, Channel artwork, collection covers, and uploaded audio artwork). A Vercel container filesystem must not be treated as durable storage for those assets. Before treating this deployment as fully production-durable, migrate those image/media paths to persistent object storage as well.

Browser OPFS recording recovery remains independent of the Vercel container and should continue protecting an in-progress creator recording locally.

## Realtime scaling note

Echoo's Socket.IO process currently uses in-process rooms. The first deployment should be treated as a single-backend-instance/MVP deployment. Before intentionally scaling the backend horizontally, add a shared Socket.IO adapter (for example Redis) so presence/chat events remain consistent across instances.

## Validation after deployment

Verify all of the following against the deployed Vercel URL:

1. `GET /api/health` returns the Echoo API identity and healthy database state.
2. Sign in, refresh, and token refresh work.
3. Creator and Listener pages hard-refresh successfully on deep routes.
4. Socket.IO connects through the same public origin.
5. Creator can start a LiveKit broadcast and a second browser can listen.
6. Ending the broadcast goes OFF AIR immediately and recording save continues in the background.
7. Recording upload progress shows bytes, percentage, speed, and ETA.
8. The finished replay is streamable after a fresh backend container/redeploy.
9. MP3 archive is present in object storage.
10. OPFS local master is not removed before the server reports the recording safe.
