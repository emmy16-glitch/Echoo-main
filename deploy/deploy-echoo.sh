#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/digihosting/Documents/Apzs/Echoo-main"
STORAGE_DIR="/mnt/storage/media/echoo"
UPLOAD_LINK="$APP_DIR/backend/uploads"
NODE20_BIN="/home/digihosting/Documents/Apzs/e-metro/.tools/node/bin"
NPM20="$NODE20_BIN/npm"
FRONTEND_NODE_BIN="${ECHOO_FRONTEND_NODE_BIN:-}"

if [[ ! -x "$NODE20_BIN/node" || ! -x "$NPM20" ]]; then
  echo "Backend Node 20 runtime is missing at $NODE20_BIN. Install Node 20 before deploying Echoo." >&2
  exit 1
fi

node_at_least() {
  local node_bin="$1"
  local minimum="$2"
  local current
  current="$("$node_bin" -p 'process.versions.node')" || return 1
  [[ "$(printf '%s\n%s\n' "$minimum" "$current" | sort -V | head -n 1)" == "$minimum" ]]
}

if [[ -z "$FRONTEND_NODE_BIN" ]]; then
  system_node="$(command -v node 2>/dev/null || true)"
  if [[ -n "$system_node" ]] && node_at_least "$system_node" "22.22.0"; then
    FRONTEND_NODE_BIN="$(dirname "$system_node")"
  fi
fi

if [[ -z "$FRONTEND_NODE_BIN" || ! -x "$FRONTEND_NODE_BIN/node" || ! -x "$FRONTEND_NODE_BIN/npm" ]]; then
  echo "Echoo frontend now requires Node >=22.22. Set ECHOO_FRONTEND_NODE_BIN to a Node 22.22+ bin directory." >&2
  exit 1
fi
if ! node_at_least "$FRONTEND_NODE_BIN/node" "22.22.0"; then
  echo "ECHOO_FRONTEND_NODE_BIN must provide Node >=22.22." >&2
  exit 1
fi
NPM_FRONTEND="$FRONTEND_NODE_BIN/npm"

# Backend stays on the proven Node 20 runtime. Frontend dependency installation
# and bundling use Node 22.22+ because LiveKit 2.22.3 depends on machina 7.
export PATH="$NODE20_BIN:$PATH"

if [[ ! -f "$APP_DIR/backend/.env" ]]; then
  echo "Missing backend/.env. Copy deploy/echoo.production.env.example and fill it first." >&2
  exit 1
fi

required_vars=(MONGODB_URI JWT_SECRET JWT_REFRESH_SECRET CLIENT_ORIGINS LIVEKIT_URL LIVEKIT_PUBLIC_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET LIVEKIT_SERVER_RECORDING_ENABLED LIVEKIT_RECORDING_WS_URL FFMPEG_PATH FFPROBE_PATH AUDIO_REPLAY_MP3_BITRATE)
for name in "${required_vars[@]}"; do
  if ! grep -qE "^${name}=.+" "$APP_DIR/backend/.env"; then
    echo "Missing required value: $name" >&2
    exit 1
  fi
done

for expected in \
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
(
  cd "$APP_DIR/frontend"
  PATH="$FRONTEND_NODE_BIN:$PATH" "$NPM_FRONTEND" ci
  PATH="$FRONTEND_NODE_BIN:$PATH" VITE_API_URL=/api VITE_BUILD_BASE=/ VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org "$NPM_FRONTEND" run build
)

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
