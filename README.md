# Echoo

Echoo is an audio-first live broadcasting platform. Creators run live audio shows from a studio workstation; listeners tune in live from the web, desktop, or mobile apps — no account needed to listen via a shared link. Finished shows are saved as compressed cloud recordings that can be published for replay.

**Live site:** https://echoo.digi02.org/ · **Desktop downloads:** [GitHub Releases](https://github.com/emmy16-glitch/Echoo-main/releases)

## How it works

```text
Creator studio (browser mixer: mic, guests, media)
        │  24-bit master → Opus over WebRTC
        ▼
LiveKit Cloud (real-time audio routing, no per-listener server load)
        ▼
Listeners (web / desktop / mobile — subscribe-only, account optional)
```

The Echoo backend (Node.js + MongoDB) owns identity, broadcast lifecycle, live chat, presence, recordings, and audio access — it never touches the live audio bytes. Finished broadcasts are transcoded to Opus (~17 MB/hour) and archived to S3-compatible cloud storage automatically.

## Clients

| Client | Directory | Notes |
|---|---|---|
| Web app | `frontend/` | React + Vite. Main listener and creator experience. |
| Desktop | `desktop/` | Electron shell with bundled API server. [Installers on Releases](https://github.com/emmy16-glitch/Echoo-main/releases). See `desktop/README.md`. |
| Mobile | `mobile/` | Expo React Native (iOS + Android). See `mobile/README.md` and `mobile/APK_BUILD.md`. |
| Landing site | `echoo-landing/` | Public marketing and release site. |

## Quickstart (local development)

One command starts MongoDB → backend → frontend → desktop, in order, with readiness checks:

```bash
npm run dev:all
```

- Frontend: http://localhost:5273 · Backend: http://localhost:5017/api/health
- Ports are project-specific (not Vite/Express defaults) — see `docs/getting-started.md`.
- Copy `backend/.env.example` to `backend/.env` for local credentials (LiveKit, storage). Never commit real secrets.

## Documentation

Start at [`docs/`](docs/) — product overview, setup, architecture, deployment, and operations. Point-in-time audits and historical reports live in [`docs/archive/`](docs/archive/) and are frozen; do not treat them as current.
