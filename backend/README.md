# Echoo backend

> **Hosting or updating the Echoo backend? Read [../HOSTING.md](../HOSTING.md)
> before starting.** Do not infer production requirements from `npm start` alone.

## Mandatory production runtime

A recording-capable Echoo backend requires:

- Node.js 20+
- MongoDB
- LiveKit configuration
- **FFmpeg**
- **FFprobe**
- persistent recording storage
- correct CORS/origin configuration

Verify the binaries from the same runtime/container/user that starts Node:

```bash
ffmpeg -version
ffprobe -version
```

After the backend starts:

```bash
curl -fsS http://127.0.0.1:5017/api/health
curl -fsS http://127.0.0.1:5017/api/health/recording
```

The recording health probe must return HTTP 200 with:

```text
ffmpeg: available
ffprobe: available
automaticServerMp3: true
trimming: true
```

If either binary is unavailable, LiveKit realtime audio may still work, but
automatic server MP3 replay and saved-recording trimming are not production-ready.

## Environment

Start with:

```bash
cp .env.example .env
```

Important recording values:

```env
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
AUDIO_REPLAY_MP3_BITRATE=320k
```

Use `AUDIO_S3_*` object-storage settings when the backend filesystem is
ephemeral. On a persistent VPS/bare-metal server, finished MP3 recordings can
remain under `uploads/audio/` if that directory is writable, persistent and
backed up.

Never commit the filled `.env`.

## Recording architecture

On a long-lived production backend, Echoo uses LiveKit Track Egress as the
primary recorder. LiveKit sends the published program track to Echoo's signed
recording WebSocket, and backend FFmpeg writes the canonical MP3 while the show
is live. The browser OPFS WAV is a recovery/lossless-export master, not the
normal server upload.

If server egress is unavailable, Echoo can recover after the show by uploading
that local master in bounded chunks. Transcription is optional and is not a
dependency of MP3 recording or End Broadcast.

Saved-recording trimming is server-side and non-destructive: the browser sends
timestamps, the backend creates a separate trimmed copy, and the original remains
unchanged.

Do not "fix" HTTP 413 by raising upload limits for one giant final WAV. That
indicates the intended recording path was bypassed.

## Full operations guide

- [../HOSTING.md](../HOSTING.md)
- [../docs/deployment.md](../docs/deployment.md)
- [../docs/audio-architecture.md](../docs/audio-architecture.md)
- [../HOSTED-SERVER-SYNC.md](../HOSTED-SERVER-SYNC.md) for Digi02 production
