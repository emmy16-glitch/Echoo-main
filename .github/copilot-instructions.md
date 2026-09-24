# Echoo repository instructions for GitHub Copilot / coding agents

For any deploy, hosting, infrastructure, server-sync, Docker, VPS, Vercel,
production, or "make it live" task, first read:

- `AGENTS.md`
- `HOSTING.md`
- `docs/deployment.md`
- `backend/.env.example`

Mandatory rules:

- Backend must provide both `ffmpeg` and `ffprobe`.
- Verify `GET /api/health/recording` returns HTTP 200 with
  `automaticServerMp3: true` and `trimming: true`.
- Use persistent recording storage; ephemeral hosts require S3-compatible
  object storage.
- Do not solve recording failures by increasing limits for a giant final WAV;
  Echoo uses bounded chunks and server-side MP3 finalization.
- Saved trims create a separate private copy; the original remains unchanged.
- Keep Raw/original audio as the default; Enhanced processing is opt-in.
- Never commit or print secrets.
- Vercel is staging/test by project convention; Digi02 is the current real
  production deployment.
- `docs/archive/` is historical and must not be used as current deployment
  authority.

Do not report a deployment complete until health probes and a real
creator->listener->End Broadcast->MP3 replay test have been verified or clearly
reported as still requiring human validation.
