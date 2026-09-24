# Echoo Whisper Flow

> Whisper is an optional transcription service. It is **not** the live replay
> recorder. A full Echoo host must still satisfy [../HOSTING.md](../HOSTING.md),
> including FFmpeg + FFprobe on the Echoo backend for automatic MP3 replay and
> server-side trimming.

Self-hosted, authenticated streaming transcription for Echoo's post-master PCM
branch. It is not an audio relay and is never on the LiveKit delivery path.

## Run

```bash
cp .env.example .env
docker build -t echoo-whisper .
docker run --gpus all --env-file .env -p 127.0.0.1:8181:8181 \
  -v echoo-whisper-models:/models echoo-whisper
```

Point the Echoo backend at `ws://127.0.0.1:8181/ws` on the same private host,
or use `wss://` through an internal TLS proxy. Set the same
`WHISPER_FLOW_API_KEY` in both services. The model is downloaded into the
persistent `/models` volume and loaded once during startup.

For CPU-only development, run the Python service directly with
`WHISPER_DEVICE=cpu` and `WHISPER_COMPUTE_TYPE=int8`. The default
`faster-whisper-large-v3-turbo` model (see `WHISPER_MODEL` in
`.env.example`) is intended for a CUDA production host.

