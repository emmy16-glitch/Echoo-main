# Echoo production deployment on digi02

## Public route

Echoo uses one public hostname:

`https://echoo.digi02.org`

Cloudflare Tunnel sends it to local Nginx on `127.0.0.1:8165`. Nginx serves
the Vite frontend and forwards `/api`, `/socket.io`, and `/uploads` to the
private Node API on `127.0.0.1:5064`.

## One-time prerequisites

1. Make `/mnt/storage/media/echoo` writable by `digihosting`. This host
   currently sees the NFS storage VM as read-only, so uploads must not be
   deployed until the NFS export/mount is corrected.
2. Copy `deploy/echoo.production.env.example` to `backend/.env`, fill the
   LiveKit values and unique JWT secrets, and restrict it with `chmod 600`.
3. Confirm MongoDB accepts connections from this server. The configured
   private MongoDB endpoint is `192.168.20.10:27017`.
4. The backend keeps using the existing Node 20 runtime at
   `/home/digihosting/Documents/Apzs/e-metro/.tools/node/bin`. The frontend
   dependency install/build now requires **Node 22.22+** because
   `livekit-client@2.22.3` depends on `machina@7`. Install a Node 22.22+
   runtime on the host and set `ECHOO_FRONTEND_NODE_BIN` to its `bin`
   directory when it is not the system default.

## Cloudflare Tunnel

Use the existing digi02 tunnel `a6314630-89ca-4efb-9b99-e5ed3823fafa`.
Add the entry from `cloudflared/echoo-ingress.yml` before the catch-all
fallback in `/etc/cloudflared/config.yml`, then create the DNS route:

```bash
cloudflared tunnel route dns a6314630-89ca-4efb-9b99-e5ed3823fafa echoo.digi02.org
sudo systemctl restart cloudflared-kaduna-cng.service
```

Do not create an A/AAAA record for the server. The Tunnel-managed CNAME is
the DNS record required for the hostname.

## Ten-minute server recording on digi02

The dedicated **digi02 production server** enables recording segments. Render
remains a disposable test environment and must not be treated as the recording
archive. Set these values in the **real production** `backend/.env`
(the template alone cannot change the running server):

```env
LIVEKIT_SERVER_RECORDING_ENABLED=true
SERVER_RECORDING_SEGMENTS_ENABLED=true
REPLAY_ARCHIVE_DIR=/mnt/storage/media/echoo/replay
AUDIO_REPLAY_MP3_BITRATE=320k
```

The archive holds `<broadcastId>.mp3` plus private ten-minute segments under
`segments/<broadcastId>/<attemptId>/part-000000.mp3`. This is the persistent
digi02 media mount, not browser/Render storage. The deploy script refuses to
restart production unless that mount is writable and the actual FFmpeg tee
muxer produces a primary MP3 and independently closed segments in a temporary
probe. The preflight cleans up the probe files.

Before deploying, use `findmnt -T /mnt/storage/media/echoo` to confirm the
storage resides on a mounted volume rather than the server root disk. The
preflight rejects a missing mount even if its leftover directory is writable.
The systemd service also checks the mounted and writable archive at every
startup, including after a host reboot or automatic service restart. Restore
the media mount before restarting ECHOO if this fail-closed check fails.

**If the mount is still read-only**, correct NFS export/mount permissions first.
Do not silently replace the archive with an ephemeral fallback. Confirm
`/api/health/recording` after deployment, then run a short real broadcast and
verify server segment counts/bytes and listener audio before trusting long
sessions. Segment files are recoverable backups; automatic stitching into a
complete replay after primary recorder failure is not yet implemented.

## Deploy

```bash
./deploy/deploy-echoo.sh
```

The script builds the frontend, installs the systemd/Nginx configuration and
restarts the services. It stops before making changes if storage is not
writable or the required backend environment values are missing.

For a mobile release, set:

```text
EXPO_PUBLIC_API_URL=https://echoo.digi02.org/api
```
