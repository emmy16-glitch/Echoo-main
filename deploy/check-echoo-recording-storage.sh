#!/usr/bin/env bash
set -euo pipefail

# Used by systemd ExecStartPre as the unprivileged Echoo service account.
# A host restart must never bypass the deployment's NFS mount safety checks.
STORAGE_DIR=/mnt/storage/media/echoo
REPLAY_DIR="$STORAGE_DIR/replay"
if [[ "${LIVEKIT_SERVER_RECORDING_ENABLED:-}" != "true" ||
      "${SERVER_RECORDING_SEGMENTS_ENABLED:-}" != "true" ||
      "${REPLAY_ARCHIVE_DIR:-}" != "$REPLAY_DIR" ]]; then
  echo "ECHOO recording environment is not configured for digi02 persistent backup." >&2
  exit 1
fi
if [[ ! -d "$STORAGE_DIR" || ! -w "$STORAGE_DIR" ]]; then
  echo "ECHOO persistent media volume does not exist or is read-only: $STORAGE_DIR" >&2
  exit 1
fi
storage_mount=$(findmnt -n -T "$STORAGE_DIR" -o TARGET 2>/dev/null || true)
if [[ -z "$storage_mount" || "$storage_mount" == "/" ]]; then
  echo "ECHOO persistent media mount missing: refusing root-filesystem fallback." >&2
  exit 1
fi
if ! mkdir -p "$REPLAY_DIR/segments" || [[ ! -w "$REPLAY_DIR/segments" ]]; then
  echo "ECHOO recording archive is not writable: $REPLAY_DIR" >&2
  exit 1
fi
probe=$(mktemp "$REPLAY_DIR/.echoo-storage-check.XXXXXXXX") || {
  echo "ECHOO cannot write a recording archive probe file." >&2
  exit 1
}
trap 'rm -f "$probe"' EXIT
printf 'echoo persistent storage probe\n' > "$probe"
sync -f "$probe"
echo "ECHOO persistent recording mount writable at startup."
