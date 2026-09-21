#!/bin/sh
# check-ports.sh — fail loudly when a port is already occupied.
#
# Usage:
#   sh scripts/check-ports.sh <port> "<label>"
#
# Exit 0 when the port is free. Exit 1 with the occupant's details when it is
# taken, so a squatted port aborts `npm run dev` here instead of serving a
# foreign app behind our back on a shared machine.
# POSIX sh only.

set -eu

port="${1:-}"
label="${2:-service}"

if [ -z "$port" ]; then
  echo "check-ports.sh: usage: sh scripts/check-ports.sh <port> \"<label>\"" >&2
  exit 2
fi

occupant=""
if command -v ss >/dev/null 2>&1; then
  # Listeners on exactly this port (TCP, numeric).
  occupant="$(ss -ltnp 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" {print}' | head -n 3 || true)"
  if [ -z "$occupant" ]; then
    occupant="$(ss -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$" {print}' | head -n 3 || true)"
  fi
fi

if [ -n "$occupant" ]; then
  echo "check-ports.sh: port ${port} is already in use — ${label} refuses to start behind another server:" >&2
  echo "$occupant" >&2
  echo "check-ports.sh: stop the occupant or rerun with a free port (e.g. PORT=<free> npm run dev)." >&2
  exit 1
fi

echo "check-ports.sh: port ${port} is free — starting ${label}."
exit 0
