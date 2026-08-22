# Echoo Whisper Flow

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
`WHISPER_DEVICE=cpu` and `WHISPER_COMPUTE_TYPE=int8`. The `medium` model is
intended for a CUDA production host.

