#!/usr/bin/env bash
set -Eeuo pipefail

TARGET_SHA="${1:-}"
PRODUCTION_PATH="${ECHOO_PRODUCTION_PATH:-}"
RESTART_COMMAND="${ECHOO_RESTART_COMMAND:-}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ -n "$TARGET_SHA" ] || fail "Missing deploy SHA"
[ -n "$PRODUCTION_PATH" ] || fail "ECHOO_PRODUCTION_PATH is not set on the production runner"
[ -n "$RESTART_COMMAND" ] || fail "ECHOO_RESTART_COMMAND is not set on the production runner"
[ -d "$PRODUCTION_PATH/.git" ] || fail "$PRODUCTION_PATH is not an Echoo git checkout"

cd "$PRODUCTION_PATH"

REMOTE_URL="$(git remote get-url origin)"
case "$REMOTE_URL" in
  *emmy16-glitch/Echoo-main*) ;;
  *) fail "Production checkout origin is unexpected: $REMOTE_URL" ;;
esac

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "Production checkout has tracked local changes. Refusing to overwrite them."
fi

echo "Fetching production commit..."
git fetch origin main --tags

git cat-file -e "$TARGET_SHA^{commit}" 2>/dev/null || fail "Commit $TARGET_SHA is unavailable after fetch"

if ! git merge-base --is-ancestor "$TARGET_SHA" origin/main; then
  fail "Refusing to deploy $TARGET_SHA because it is not contained in origin/main"
fi

echo "Deploying exact commit: $TARGET_SHA"
git checkout main
git reset --hard "$TARGET_SHA"

echo "Checking mandatory runtime dependencies..."
command -v node >/dev/null || fail "node is missing"
command -v npm >/dev/null || fail "npm is missing"
command -v ffmpeg >/dev/null || fail "ffmpeg is missing"
command -v ffprobe >/dev/null || fail "ffprobe is missing"
ffmpeg -version >/dev/null
ffprobe -version >/dev/null

echo "Installing backend dependencies..."
cd "$PRODUCTION_PATH/backend"
npm ci --omit=dev

echo "Building production frontend..."
cd "$PRODUCTION_PATH/frontend"
npm ci
VITE_API_URL=/api \
VITE_BUILD_BASE=/ \
VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org \
npm run build

echo "Restarting Echoo using the host-defined restart command..."
cd "$PRODUCTION_PATH"
bash -lc "$RESTART_COMMAND"

echo "Waiting for services..."
sleep 8

echo "Checking API health..."
curl --fail --silent --show-error https://echoo.digi02.org/api/health

echo
echo "Checking recording health..."
recording_json="$(mktemp)"
trap 'rm -f "$recording_json"' EXIT
curl --fail --silent --show-error https://echoo.digi02.org/api/health/recording > "$recording_json"

node - "$recording_json" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
const ok =
  payload.ffmpeg === 'available' &&
  payload.ffprobe === 'available' &&
  payload.automaticServerMp3 === true &&
  payload.trimming === true;

if (!ok) {
  console.error('Recording health gate failed.');
  console.error(JSON.stringify({
    ffmpeg: payload.ffmpeg,
    ffprobe: payload.ffprobe,
    automaticServerMp3: payload.automaticServerMp3,
    trimming: payload.trimming,
  }));
  process.exit(1);
}

console.log('Recording health gate passed.');
NODE

echo "Checking deployed frontend identity..."
curl --fail --silent --show-error https://echoo.digi02.org/ |
  grep -q 'name="echoo-app"' ||
  fail "Production frontend marker is missing"

echo "Echoo production deploy completed successfully for $TARGET_SHA"
