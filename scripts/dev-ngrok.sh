#!/usr/bin/env bash
# =============================================
# Echoo: local development with ngrok tunnels
# =============================================
# Starts the backend, the frontend (Vite), and two ngrok tunnels
# (backend -> 5001, frontend -> 5174) and writes the generated
# backend URL into frontend/.env automatically.
#
# LiveKit audio over public ngrok URLs requires LiveKit Cloud:
#   1. Create a free project at https://cloud.livekit.io
#   2. Copy backend/.env.ngrok.example to backend/.env and fill in
#      LIVEKIT_URL / LIVEKIT_PUBLIC_URL / LIVEKIT_API_KEY /
#      LIVEKIT_API_SECRET (wss:// endpoint + credentials)
#   3. Copy frontend/.env.ngrok.example to frontend/.env and set
#      VITE_LIVEKIT_URL to the same wss:// endpoint
# ngrok only tunnels TCP/HTTP, so WebRTC media (UDP) cannot be tunneled;
# browsers must connect directly to a public wss:// LiveKit endpoint.
#
# Usage (from repo root):
#   ./scripts/dev-ngrok.sh
#
# Stop everything:   Ctrl+C  (or  ./scripts/dev-ngrok.sh stop)
# Show URLs:         ./scripts/dev-ngrok.sh urls
#
# Requirements:
#   - Node.js (backend + frontend)
#   - ngrok CLI, authenticated: https://ngrok.com/docs/getting-started/
# =============================================
set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
PID_DIR="$ROOT_DIR/.dev-ngrok"
FRONTEND_ENV="$FRONTEND_DIR/.env"

cleanup() {
  echo
  echo "[dev-ngrok] Shutting down..."
  if [ -d "$PID_DIR" ]; then
    for pidfile in "$PID_DIR"/*.pid; do
      [ -f "$pidfile" ] || continue
      pid=$(cat "$pidfile" 2>/dev/null)
      [ -n "$pid" ] && kill "$pid" 2>/dev/null
    done
    rm -rf "$PID_DIR"
  fi
  # ngrok processes are children of this script; kill the process group.
  kill 0 2>/dev/null
  exit 0
}
trap cleanup INT TERM

mkdir -p "$PID_DIR"

# --------------------------------------------------
# Backend
# --------------------------------------------------
echo "[dev-ngrok] Starting Echoo backend on :5001 ..."
( cd "$BACKEND_DIR" && exec npm run dev ) > "$PID_DIR/backend.log" 2>&1 &
echo $! > "$PID_DIR/backend.pid"

# --------------------------------------------------
# Frontend (Vite)
# --------------------------------------------------
echo "[dev-ngrok] Starting Echoo frontend on :5174 ..."
( cd "$FRONTEND_DIR" && exec npm run dev ) > "$PID_DIR/frontend.log" 2>&1 &
echo $! > "$PID_DIR/frontend.pid"

# --------------------------------------------------
# LiveKit Cloud preflight
# --------------------------------------------------
if [ -f "$BACKEND_DIR/.env" ] && grep -q "^LIVEKIT_URL=" "$BACKEND_DIR/.env"; then
  LIVEKIT_CFG=$(grep "^LIVEKIT_URL=" "$BACKEND_DIR/.env" | head -1 | cut -d= -f2-)
  LIVEKIT_KEY=$(grep "^LIVEKIT_API_KEY=" "$BACKEND_DIR/.env" | head -1 | cut -d= -f2-)
  if ! printf '%s' "$LIVEKIT_CFG" | grep -qE "^wss://" || [ -z "$LIVEKIT_KEY" ]; then
    echo "[dev-ngrok] WARNING: LiveKit is not configured for public use."
    echo "[dev-ngrok]          Audio will NOT work over ngrok frontend URLs."
    echo "[dev-ngrok]          Set LIVEKIT_URL/LIVEKIT_PUBLIC_URL (wss://),"
    echo "[dev-ngrok]          LIVEKIT_API_KEY and LIVEKIT_API_SECRET in"
    echo "[dev-ngrok]          backend/.env (see backend/.env.ngrok.example)."
    echo "[dev-ngrok]          Free project: https://cloud.livekit.io"
  else
    echo "[dev-ngrok] LiveKit Cloud detected: $LIVEKIT_CFG"
  fi
else
  echo "[dev-ngrok] WARNING: no backend/.env or LIVEKIT_URL not set —"
  echo "[dev-ngrok]          audio will not work over ngrok frontend URLs."
fi

# --------------------------------------------------
# ngrok tunnels
# --------------------------------------------------
echo "[dev-ngrok] Starting ngrok tunnels (backend:5001, frontend:5174) ..."
( exec ngrok http 5001 ) > "$PID_DIR/ngrok-backend.log" 2>&1 &
echo $! > "$PID_DIR/ngrok-backend.pid"
( exec ngrok http 5174 ) > "$PID_DIR/ngrok-frontend.log" 2>&1 &
echo $! > "$PID_DIR/ngrok-frontend.pid"

# --------------------------------------------------
# Wait for tunnels to come online and capture URLs
# --------------------------------------------------
BACKEND_URL=""
FRONTEND_URL=""

wait_for_url() {
  local logfile="$1"
  local attempt=0
  while [ $attempt -lt 30 ]; do
    local url
    url=$(grep -oE 'https://[A-Za-z0-9.-]+\.ngrok-free\.(dev|app)' "$logfile" 2>/dev/null | head -1)
    if [ -n "$url" ]; then
      echo "$url"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  return 1
}

sleep 3
BACKEND_URL=$(wait_for_url "$PID_DIR/ngrok-backend.log")
FRONTEND_URL=$(wait_for_url "$PID_DIR/ngrok-frontend.log")

if [ -z "$BACKEND_URL" ] || [ -z "$FRONTEND_URL" ]; then
  echo "[dev-ngrok] ERROR: could not detect ngrok URLs."
  echo "[dev-ngrok] Check that ngrok is authenticated: ngrok config check"
  echo "[dev-ngrok] Backend log:  $PID_DIR/ngrok-backend.log"
  echo "[dev-ngrok] Frontend log: $PID_DIR/ngrok-frontend.log"
  echo "[dev-ngrok] Keeping services running; you can start them manually."
else
  echo
  echo "[dev-ngrok] ============================================="
  echo "[dev-ngrok] Backend API:    $BACKEND_URL/api/health"
  echo "[dev-ngrok] Frontend app:   $FRONTEND_URL"
  echo "[dev-ngrok] ============================================="

  # Point the frontend at the tunneled backend.
  # Preserve an existing VITE_LIVEKIT_URL from the user's frontend/.env
  # (so the LiveKit Cloud endpoint survives regeneration).
  EXISTING_LK=""
  if [ -f "$FRONTEND_ENV" ]; then
    EXISTING_LK=$(grep "^VITE_LIVEKIT_URL=" "$FRONTEND_ENV" | head -1 | cut -d= -f2-)
  fi

  cat > "$FRONTEND_ENV" <<EOF
# AUTO-GENERATED by scripts/dev-ngrok.sh on $(date -u +%FT%TZ)
# Do not edit — regenerated every time the script starts
# (VITE_LIVEKIT_URL is preserved if already set).
# .env is git-ignored, so it will not be committed.
VITE_API_URL=$BACKEND_URL/api
VITE_LIVEKIT_URL=$EXISTING_LK
VITE_SYNTHETIC_AUDIO=false
EOF
  echo "[dev-ngrok] Wrote $FRONTEND_ENV (VITE_API_URL=$BACKEND_URL/api)"
  echo "[dev-ngrok] NOTE: Vite reads .env at startup only — the current"
  echo "[dev-ngrok]       Vite process needs a restart to pick it up."
  echo "[dev-ngrok]       Run:  cd frontend && (kill \$(cat $PID_DIR/frontend.pid); npm run dev) &"
fi

echo
echo "[dev-ngrok] Everything running. Press Ctrl+C to stop all services."
echo "[dev-ngrok] Logs: backend=$PID_DIR/backend.log frontend=$PID_DIR/frontend.log"
echo "[dev-ngrok] ngrok : backend=$PID_DIR/ngrok-backend.log frontend=$PID_DIR/ngrok-frontend.log"
wait
