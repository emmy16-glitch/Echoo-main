# Echoo public testing deployment

This branch is prepared for a public Echoo test without changing the localhost development workflow.

## Target architecture

- Frontend: Cloudflare Pages (`echoo-test`)
- API + Socket.IO: public Node.js host running `backend/`
- Database: MongoDB Atlas or another public MongoDB deployment
- Live audio: LiveKit Cloud or another public LiveKit deployment
- Cloudflare: frontend hosting, TLS, custom domain/DNS if desired

LiveKit is intentionally not placed behind a normal Cloudflare Pages HTTP deployment. Creator and Listener browsers connect to the public LiveKit WebSocket/WebRTC service directly.

## 1. Public backend environment

Start from `backend/.env.production.example` and provide real values in the backend host's secret/environment settings. Do not commit a real `.env.production` file.

Required production values:

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `CLIENT_ORIGINS`
- `LIVEKIT_URL`
- `LIVEKIT_PUBLIC_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The production API starts with `npm start`.

After deployment, verify:

```bash
curl https://YOUR_API_HOST/api/health
curl https://YOUR_API_HOST/api/health/livekit
```

Both must report healthy before the public frontend is deployed.

## 2. Frontend production environment

Copy the safe template locally:

```bash
cd frontend
cp .env.production.example .env.production
```

Fill only these two values:

```env
VITE_API_URL=https://YOUR_API_HOST/api
VITE_LIVEKIT_URL=wss://YOUR_LIVEKIT_HOST
```

`npm run cf:check` rejects localhost, non-HTTPS API URLs, and non-WSS LiveKit URLs.

## 3. Cloudflare authentication and Pages project

From `frontend/`:

```bash
npm run cf:login
npm run cf:create
```

The Pages project is named `echoo-test` and its production branch is `integration/echoo-core-cleanup`.

If the project already exists, skip `npm run cf:create`.

## 4. Deploy

```bash
npm run cf:deploy
```

The command runs the production environment preflight, builds Vite, and uploads `dist` to the `echoo-test` Cloudflare Pages project.

The Pages SPA fallback is already included in `frontend/public/_redirects`, so routes such as `/listen/live/:broadcastId` can be opened/refreshed directly.

## 5. Backend CORS after the Pages URL is known

Set the backend production origin values to the real frontend hostname, for example:

```env
CLIENT_ORIGINS=https://echoo-test.pages.dev
CLIENT_ORIGIN_SUFFIXES=echoo-test.pages.dev
```

Restart/redeploy the backend after changing these values.

## 6. Public livestream smoke test

1. Creator logs into the Cloudflare Pages URL.
2. Creator opens Broadcast Studio and tests microphone permission.
3. Creator starts the broadcast.
4. Backend transitions the Broadcast through `starting` to `live` only after Creator LiveKit publishing is confirmed.
5. A second account/device opens the same Cloudflare Pages URL and enters Listener > Live.
6. Listener joins the broadcast and hears the Creator audio through LiveKit.
7. Test Live Chat and presence.
8. End the broadcast and confirm the Listener exits the live state.

Do not merge the integration branch to `main` until this public Creator + Listener smoke test passes.
