# Echoo production pull & acceptance — Digi02 handoff

This is an operator checklist for the **existing** Digi02 server. The code can be
reviewed and tested without server access; only the host operator can verify
production storage, database, LiveKit Egress and uninterrupted audio.

Read `AGENTS.md`, `HOSTING.md`, `deploy/README.md` and
`HOSTED-SERVER-SYNC.md` before starting. Do not use archived hosting guides.

## Safe pull

Run as the existing deployment operator on the configured Digi02 host:

```bash
cd /home/digihosting/Documents/Apzs/Echoo-main
git status --short
git fetch origin
git pull --ff-only origin main
```

If there are local changes, resolve them deliberately; do not use
`git reset --hard` to erase files. Do not commit, print or replace
`backend/.env`. It contains real MongoDB, JWT and LiveKit secrets.

**A pull alone does not build the frontend or restart the server.**

## Validate before restarting

The repository's `deploy/deploy-echoo.sh` checks all of the following before
a production restart:

- The installed backend Node binary is **20.19 or newer**; the frontend build
  uses **Node 22.22 or newer** (set `ECHOO_FRONTEND_NODE_BIN` if necessary).
- The actual `backend/.env` passes the backend's production configuration
  parser, even with transcription disabled.
- FFmpeg and FFprobe exist.
- Required recording variables are enabled on Digi02.
- The persistent NFS archive is mounted and writable; the FFmpeg tee writes
  a primary MP3 and multiple sealed segments.
- Production dependencies and the correct web frontend build succeed.

Do not bypass a failed preflight. Fix its cause first, preserving existing
services and media. Then, with the usual server permissions:

```bash
./deploy/deploy-echoo.sh
```

Do not switch to an ephemeral upload directory merely to make the test green.

## Post-deploy acceptance (operator must record pass/fail)

1. Check both health routes and confirm automatic MP3 recording and trimming:

   ```bash
   curl --fail --silent --show-error https://echoo.digi02.org/api/health
   curl --fail --silent --show-error https://echoo.digi02.org/api/health/recording
   ```

2. Confirm the **deployed** backend commit, the built frontend revision and
   correct persistent media mount; do not equate a GitHub merge with deployment.
3. Start a new broadcast, listen on a separate device/network, verify audible
   stereo audio and stable playback. Never use an existing recording as proof
   that a live stream works.
4. Run a short completed recording: end it, verify one canonical MP3, play
   beginning/middle/end, reload and replay it, then verify non-destructive trim.
5. Run two simultaneous organizations/broadcasts; confirm identities, files,
   progress and replays remain separate.
6. Repeat with deliberate **test** network interruption, reconnect, refresh
   and backend restart; prove that existing saved media survives and unfinished
   browser recovery copies remain available.
7. Perform a controlled long-duration endurance test for the expected 7–9 hour
   use case; track stream interruptions, disk space, CPU, memory and FFmpeg
   failures. Audit actual playback duration and content, not just metadata.
8. Before a large audience event, verify actual LiveKit project quotas and
   staged load. GitHub E2E tests cannot certify 500 real listeners.

**Do not call production verified** until these host-only checks are completed.
Keep test recordings and logs without exposing passwords, JWT keys or private
media. If any step fails, stop before a large real event and report the exact
failing step and deployed commit.

## What remains outside repository-only validation

GitHub CI cannot prove Digi02's NFS availability, Cloudflare Tunnel,
LiveKit account quotas, real microphone/phone behaviour, long-term CPU
saturation, or multi-hour recording survival. These require host and real
device access after deployment.
