# Echoo Mobile agent instructions

For Expo/mobile implementation, read the exact versioned docs at
https://docs.expo.dev/versions/v54.0.0/ before writing code.

For any **hosting, backend, deployment, production, recording, LiveKit server,
or "make Echoo live" task**, the repository-level rules still apply. Read:

- [../AGENTS.md](../AGENTS.md)
- [../HOSTING.md](../HOSTING.md)

Do not treat a mobile build as proof that the hosted backend recording pipeline
is ready. The backend must have FFmpeg + FFprobe and pass
`/api/health/recording`.
