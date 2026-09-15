# Echoo web app

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
