# Echoo web app

> **Hosting or deploying the full Echoo platform? Read [../HOSTING.md](../HOSTING.md) first.**
> A successful Vite build does not prove server recording is ready; the backend
> must have FFmpeg + FFprobe and pass `/api/health/recording`.

React + Vite single-page application. Serves both experiences from one codebase with lazy-loaded shells:

- **Listener** (`src/Components/Listener*`, `ListenerV2/`) — home, search, live rooms, stations, library, downloads, settings.
- **Creator Studio** (`src/Components/CreatorStudio/`) — broadcast workstation (mixer, guests, go-live), channels, content, analytics, settings.
- **Shared** — routing (`src/routing/`), services (`src/services/` — API, realtime, LiveKit, recordings, storage), design system (`src/Components/Shared/`, `src/design-system/`, `src/theme/`).

## Run

```bash
npm run dev    # Vite on :5273 (strict port; proxies /api, /socket.io, /uploads to :5017)
npm run build  # production bundle in dist/ (relative asset base — also runs inside Electron)
```

## Conventions that matter

- **Ports are project-specific** (`5273`, backend `5017`) — see `docs/getting-started.md`. Never assume framework defaults.
- **Identity marker:** `index.html` carries `<meta name="echoo-app">` — dev tooling and the desktop shell trust only content bearing it.
- **Live audio:** creator publishes one `echoo-studio-mix` Opus publication via LiveKit; listeners attach it to a native `<audio>` element (no AudioContext processing on the listen path).
- **Auth:** token pair in localStorage; logged-out visitors get guest live access on shared links (public card + guest token + read-only chat).
- **Desktop coexistence:** no absolute `/...` asset or fetch paths in app code — the same bundle runs over `file://` (use `buildMediaUrl` for media).


## Production hosting note

The web app is only one part of Echoo. Do not deploy `frontend/dist/` and call
the platform complete without validating the backend, LiveKit, database and
recording pipeline.

For a same-origin production build:

```bash
VITE_API_URL=/api \
VITE_BUILD_BASE=/ \
VITE_PUBLIC_APP_ORIGIN=https://your-domain.example \
npm run build
```

The real Digi02 production build must use
`VITE_PUBLIC_APP_ORIGIN=https://echoo.digi02.org`, not the Vercel staging
origin.

See [../HOSTING.md](../HOSTING.md) and [../docs/deployment.md](../docs/deployment.md).
