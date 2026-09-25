# AGENTS.md — mandatory instructions for AI coding and hosting agents

## Before any hosting, deployment, server sync, Docker/VPS setup, or "make Echoo live" task

**STOP and read [HOSTING.md](HOSTING.md) completely before changing or deploying anything.**

Do not infer the deployment from package scripts alone. Echoo has mandatory runtime
requirements that are easy to miss, especially the recording pipeline.

### Non-negotiable hosting requirements

1. **Backend requires both FFmpeg and FFprobe.**
   - `ffmpeg -version` must succeed.
   - `ffprobe -version` must succeed.
   - Echoo uses these for automatic server MP3 replay finalization and saved-recording trimming.
   - Do not report a deployment as ready if either binary is unavailable.
2. **Verify LiveKit Egress plus the recording health endpoint after the backend restarts.**
   - LiveKit Cloud provides Egress; self-hosted LiveKit must deploy its Egress service separately.
   - `GET /api/health/recording` must return HTTP 200.
   - It must report `automaticServerMp3: true`, `trimming: true`, and server-recording readiness when `LIVEKIT_SERVER_RECORDING_ENABLED=true`.
3. **Use persistent recording storage.**
   - A normal VPS/bare-metal deployment may use persistent `backend/uploads/audio/`.
   - Ephemeral/container/serverless filesystems must use persistent S3-compatible object storage.
4. **Do not reintroduce browser PCM/WAV upload into the healthy live path.**
   - The creator publishes the program once to LiveKit.
   - LiveKit Track Egress sends that already-published track to Echoo's server recorder.
   - Backend FFmpeg writes the canonical MP3 while the show is live.
   - The browser OPFS WAV is recovery/device-export data only; bounded WAV chunks are post-live emergency recovery when server recording failed.
5. **Preserve original audio by default.**
   - Raw/original creator audio is the default.
   - Enhanced processing must remain opt-in.
6. **Do not expose secrets.**
   - LiveKit API secret, JWT secrets, MongoDB credentials and storage keys belong only in server environment files/secrets.
   - Never commit or print them.
7. **Production and staging are separate.**
   - Vercel is used as Echoo staging/test infrastructure.
   - The current real hosted site is `https://echoo.digi02.org/`.
   - A production build must not accidentally generate Vercel staging share links.

### Required deployment reading order

1. [HOSTING.md](HOSTING.md) — authoritative host/deploy contract.
2. [docs/deployment.md](docs/deployment.md) — environment and operations details.
3. [backend/.env.example](backend/.env.example) — environment-variable source of truth.
4. [docs/audio-architecture.md](docs/audio-architecture.md) — recording/live audio architecture.
5. For the Digi02 production server specifically: [HOSTED-SERVER-SYNC.md](HOSTED-SERVER-SYNC.md).

Files under `docs/archive/` are historical snapshots. **Do not use archived documents
as current deployment instructions.**

### Required acceptance before saying "hosted", "deployed", "ready", or "done"

At minimum verify:

```bash
ffmpeg -version
ffprobe -version
curl -fsS https://<host>/api/health
curl -fsS https://<host>/api/health/recording
```

Then perform a real creator/listener test:

- creator starts a broadcast;
- a separate listener hears the LiveKit program;
- end broadcast;
- server finalizes one MP3 replay;
- replay survives page refresh and backend restart;
- Recordings can play it;
- server-side Trim creates a separate trimmed copy and leaves the original unchanged;
- device-copy preference (MP3/WAV/server-only) behaves as configured.

If any required check fails, report the failing check and fix it. Do not hide the
failure by increasing upload limits or silently disabling recording.
