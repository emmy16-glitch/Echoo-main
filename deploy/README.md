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
4. Node.js 20 is required. This server already has a Node 20 runtime at
   `/home/digihosting/Documents/Apzs/e-metro/.tools/node/bin`; the systemd
   service and deployment script use it because `/usr/bin/node` is v12.

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
