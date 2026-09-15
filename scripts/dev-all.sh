#!/bin/sh
# dev-all.sh — start backend + frontend + desktop together, in order, with
# readiness POLLING (never fixed `sleep N`).
#
# Usage (from the repo root):
#   sh scripts/dev-all.sh
#   VITE_PORT=5274 sh scripts/dev-all.sh   # frontend on a different port
#   PORT=5018 sh scripts/dev-all.sh        # backend on a different port
#
# Default ports are project-specific (frontend 5273, backend 5017 — see
# frontend/vite.config.js): this repo is developed on a shared multi-user
# machine where common defaults like 5173/5001 are routinely owned by other
# people's servers, so a bare HTTP 200 proves nothing. Every readiness gate
# below verifies APP IDENTITY (Echoo marker / API shape), never just liveness.
#
# Order: MongoDB -> LiveKit -> backend (/api/health) -> frontend (HTTP 200) ->
# desktop (foreground; its own launcher waits for the Vite server). Ctrl-C
# stops all four. Each service keeps its own loud port-conflict check, so a
# squatted port aborts here with the occupant's PID instead of a blank window.
# POSIX sh only (macOS/Linux; Windows devs should use WSL/Git-Bash).

set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VITE_PORT="${VITE_PORT:-5273}"
BACKEND_PORT="${PORT:-5017}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_URL="http://127.0.0.1:${VITE_PORT}"

BACKEND_PID=""
FRONTEND_PID=""
DESKTOP_PID=""
LIVEKIT_PID=""

# Kill a whole process tree rooted at $1 (npm wrapper AND everything it
# spawned: sh -c, node, electron + its children). Plain `kill $pid` only kills
# the wrapper and orphans the server — which is exactly how stale Vite
# processes happen. Implemented via ps/awk so it works on Linux and macOS.
child_pids() {
  ps -eo pid,ppid 2>/dev/null | awk -v parent="$1" '$2 == parent { print $1 }'
}
kill_tree() {
  if [ -z "${1:-}" ]; then
    return 0
  fi
  for child in $(child_pids "$1"); do
    kill_tree "$child"
  done
  kill -TERM "$1" 2>/dev/null || true
}
cleanup() {
  kill_tree "$DESKTOP_PID"
  kill_tree "$FRONTEND_PID"
  kill_tree "$BACKEND_PID"
  kill_tree "$LIVEKIT_PID"
}
trap cleanup EXIT INT TERM

# Poll $1 (URL) until the service answers AND proves its identity, or $2
# (seconds) elapse. No fixed sleeps: checks every second, returns as soon as
# the service answers. A response WITHOUT Echoo's identity marker/shape fails
# FAST (a foreign squatter will never become Echoo no matter how long we wait)
# with a clear message — it is never treated as "up".
#   $1 url, $2 timeout_s, $3 label, $4 kind (backend|frontend)
wait_for_service() {
  url="$1"
  timeout_s="$2"
  label="$3"
  kind="$4"
  elapsed=0
  while [ "$elapsed" -lt "$timeout_s" ]; do
    if body=$(curl -sS --max-time 2 "$url" 2>/dev/null); then
      # Something answered over HTTP — now prove it is OURS, not a squatter.
      case "$kind" in
        backend)
          if printf '%s' "$body" | grep -q '"status"[ ]*:[ ]*"ok"' \
            && printf '%s' "$body" | grep -q '"service"[ ]*:[ ]*"echoo-api"'; then
            echo "OK [${label}]: Echoo API identity verified at ${url} (${elapsed}s)."
            return 0
          fi
          identity_hint='expected Echoo /api/health JSON with status "ok" + service "echoo-api"'
          ;;
        frontend)
          if printf '%s' "$body" | grep -q 'name="echoo-app"'; then
            echo "OK [${label}]: Echoo frontend identity verified at ${url} (${elapsed}s)."
            return 0
          fi
          identity_hint='no echoo-app marker found (expected <meta name="echoo-app"> in the HTML)'
          ;;
      esac
      port="${url##*:}"
      port="${port%%/*}"
      echo "ERROR [${label}]: port ${port} responded but the content doesn't look like Echoo (${identity_hint}) — another process may be squatting this port. Aborting." >&2
      echo "  Response preview: $(printf '%s' "$body" | tr -c '[:print:]\t' '.' | head -c 200)" >&2
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  echo "ERROR [${label}]: not reachable at ${url} after ${timeout_s}s — aborting." >&2
  return 1
}

echo "=== Echoo dev:all (backend :${BACKEND_PORT}, frontend :${VITE_PORT}) ==="

# 0a. LiveKit (local audio server for going live). Skipped silently when the
# binary is absent — but then "Go Live" fails with a clear in-app message
# instead of a mystery error (see api.js friendlyServerMessages).
if command -v livekit-server >/dev/null 2>&1; then
  if curl -s -m 2 http://127.0.0.1:7880/ >/dev/null 2>&1 || livekit-cli --url http://127.0.0.1:7880 --api-key devkey --api-secret secret list-rooms >/dev/null 2>&1; then
    echo "OK [livekit]: already running on :7880."
  else
    echo "--- starting local LiveKit server (:7880, dev credentials) ---"
    (livekit-server --dev --port 7880 >"/tmp/echoo-livekit.log" 2>&1) &
    LIVEKIT_PID="$!"
  fi
else
  echo "SKIP [livekit]: livekit-server not installed — going live will fail until it is (see desktop/README.md)."
fi

# 0. MongoDB must be healthy — the backend exits(1) without it.
if ! (cd "$ROOT/backend" && npm run -s db:local:status >/dev/null 2>&1); then
  echo "--- MongoDB not running; starting local instance ---"
  (cd "$ROOT/backend" && npm run -s db:local >/dev/null 2>&1 || true)
  sleep 2
fi
if (cd "$ROOT/backend" && npm run -s db:local:status >/dev/null 2>&1); then
  echo "OK [mongodb]: healthy."
else
  echo "ERROR [mongodb]: local MongoDB is not healthy and could not be started." >&2
  echo "  Start it manually: cd backend && npm run db:local" >&2
  exit 1
fi

# 1. Backend (its `predev` hook fails loudly if BACKEND_PORT is squatted).
echo "--- starting backend ---"
(cd "$ROOT/backend" && PORT="$BACKEND_PORT" npm run dev >"/tmp/echoo-backend-dev.log" 2>&1) &
BACKEND_PID="$!"
wait_for_service "${BACKEND_URL}/api/health" 30 "backend" "backend" || { echo "  Backend log tail (/tmp/echoo-backend-dev.log):" >&2; tail -n 15 /tmp/echoo-backend-dev.log >&2 || true; exit 1; }

# 2. Frontend (its `predev` hook fails loudly if VITE_PORT is squatted;
#    `--strictPort` guarantees no silent fallback).
echo "--- starting frontend ---"
(cd "$ROOT/frontend" && VITE_PORT="$VITE_PORT" npm run dev >"/tmp/echoo-frontend-dev.log" 2>&1) &
FRONTEND_PID="$!"
wait_for_service "$FRONTEND_URL" 60 "frontend" "frontend" || { echo "  Frontend log tail (/tmp/echoo-frontend-dev.log):" >&2; tail -n 15 /tmp/echoo-frontend-dev.log >&2 || true; exit 1; }

# 3. Desktop, kept in the foreground via `wait` so Ctrl-C stops everything.
#    Its launcher re-resolves the same VITE_PORT and refuses to open a blank
#    window if the server still isn't reachable.
echo "--- starting desktop (Ctrl-C stops everything) ---"
(cd "$ROOT/desktop" && VITE_PORT="$VITE_PORT" ECHOO_DEV_URL="http://localhost:${VITE_PORT}" npm run dev) &
DESKTOP_PID="$!"
wait "$DESKTOP_PID"
