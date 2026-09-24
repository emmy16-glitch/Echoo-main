# Echoo AI agent instructions

Before any hosting, deployment, server update, containerization, environment
configuration, or production-readiness task:

1. Read [AGENTS.md](AGENTS.md).
2. Read [HOSTING.md](HOSTING.md) completely.
3. Follow [docs/deployment.md](docs/deployment.md) and
   [backend/.env.example](backend/.env.example).

Do not call Echoo hosted/ready unless the backend has both FFmpeg and FFprobe
and `GET /api/health/recording` returns HTTP 200 with
`automaticServerMp3: true` and `trimming: true`.

Do not reintroduce a giant final WAV upload. Live recording uses bounded chunks
and server-side MP3 finalization. Saved-recording trims are server-side,
non-destructive copies. Keep real secrets out of Git and logs.

For the Digi02 production server, also follow
[HOSTED-SERVER-SYNC.md](HOSTED-SERVER-SYNC.md).
