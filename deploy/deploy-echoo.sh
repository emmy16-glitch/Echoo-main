#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/digihosting/Documents/Apzs/Echoo-main"
STORAGE_DIR="/mnt/storage/media/echoo"
UPLOAD_LINK="$APP_DIR/backend/uploads"
NODE20_BIN="/home/digihosting/Documents/Apzs/e-metro/.tools/node/bin"
NPM20="$NODE20_BIN/npm"

if [[ ! -x "$NODE20_BIN/node" || ! -x "$NPM20" ]]; then
  echo "Node 20 runtime is missing at $NODE20_BIN. Install Node 20 before deploying Echoo." >&2
  exit 1
fi

# npm's launcher resolves `node` from PATH. The system Node is v12, while
# Echoo requires the colocated Node 20 runtime.
export PATH="$NODE20_BIN:$PATH"

if [[ ! -f "$APP_DIR/backend/.env" ]]; then
  echo "Missing backend/.env. Copy deploy/echoo.production.env.example and fill it first." >&2
  exit 1
fi

required_vars=(MONGODB_URI JWT_SECRET JWT_REFRESH_SECRET CLIENT_ORIGINS ECHOO_DESKTOP LIVEKIT_URL LIVEKIT_PUBLIC_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET LIVEKIT_SERVER_RECORDING_ENABLED LIVEKIT_RECORDING_WS_URL FFMPEG_PATH FFPROBE_PATH AUDIO_REPLAY_MP3_BITRATE)
for name in "${required_vars[@]}"; do
  if ! grep -qE "^${name}=.+" "$APP_DIR/backend/.env"; then
    echo "Missing required value: $name" >&2
    exit 1
  fi
done

for expected in \
  'ECHOO_DESKTOP=1' \
  'LIVEKIT_SERVER_RECORDING_ENABLED=true' \
  'AUDIO_REPLAY_MP3_BITRATE=320k'; do
  if ! grep -qxF "$expected" "$APP_DIR/backend/.env"; then
    echo "Required production setting is missing or incorrect: $expected" >&2
    exit 1
  fi
done

ffmpeg_bin=$(sed -n 's/^FFMPEG_PATH=//p' "$APP_DIR/backend/.env" | tail -n 1)
ffprobe_bin=$(sed -n 's/^FFPROBE_PATH=//p' "$APP_DIR/backend/.env" | tail -n 1)
if ! command -v "$ffmpeg_bin" >/dev/null 2>&1; then
  echo "FFmpeg is unavailable to the backend runtime: $ffmpeg_bin" >&2
  exit 1
fi
if ! command -v "$ffprobe_bin" >/dev/null 2>&1; then
  echo "FFprobe is unavailable to the backend runtime: $ffprobe_bin" >&2
  exit 1
fi

chmod 600 "$APP_DIR/backend/.env"

if [[ ! -d "$STORAGE_DIR" || ! -w "$STORAGE_DIR" ]]; then
  echo "Storage directory must exist and be writable: $STORAGE_DIR" >&2
  exit 1
fi

if [[ -e "$UPLOAD_LINK" && ! -L "$UPLOAD_LINK" ]]; then
  echo "$UPLOAD_LINK already exists and is not a symlink; move existing uploads deliberately before deployment." >&2
  exit 1
fi

if [[ ! -L "$UPLOAD_LINK" ]]; then
  ln -s "$STORAGE_DIR" "$UPLOAD_LINK"
fi

(cd "$APP_DIR/backend" && "$NPM20" ci --omit=dev)
(cd "$APP_DIR/frontend" && "$NPM20" ci && VITE_API_URL=/api VITE_BUILD_BASE=/ VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org "$NPM20" run build)

sudo install -m 0644 "$APP_DIR/deploy/systemd/echoo-api.service" /etc/systemd/system/echoo-api.service
sudo install -m 0644 "$APP_DIR/deploy/nginx/echoo.conf" /etc/nginx/conf.d/echoo.conf
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable echoo-api.service
sudo systemctl restart echoo-api.service
sudo systemctl reload nginx

curl --fail --silent --show-error -H 'Host: echoo.digi02.org' http://127.0.0.1:8165/api/health >/dev/null
curl --fail --silent --show-error -H 'Host: echoo.digi02.org' http://127.0.0.1:8165/api/health/recording >/dev/null
echo "Echoo API and recording health pass locally. Verify externally at https://echoo.digi02.org/api/health/recording"
