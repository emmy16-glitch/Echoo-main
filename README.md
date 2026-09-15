# Echoo

> **Go live in minutes. Anyone with the link can listen — no account needed.**

[![CI](https://github.com/emmy16-glitch/Echoo-main/actions/workflows/echoo-check.yml/badge.svg)](https://github.com/emmy16-glitch/Echoo-main/actions/workflows/echoo-check.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json) [![Python 3.10](https://img.shields.io/badge/python-3.10-blue.svg)](echoo-whisper/requirements.txt) [![Electron 41](https://img.shields.io/badge/electron-41-9FEAF0.svg)](desktop/package.json) [![MongoDB](https://img.shields.io/badge/MongoDB-7+-47A248.svg)](backend/package.json)

**Echoo** is an audio-first live broadcasting platform. Creators mix microphone, guests, and media in a studio workstation and go live over real-time audio; listeners join from a shared link on the web, desktop, or mobile apps. Finished shows are saved automatically as small cloud recordings ready to publish for replay.

| Resource | Link |
|---|---|
| 🌐 **Live site** | **[https://echoo.digi02.org/](https://echoo.digi02.org/)** |
| 📦 Repository | [https://github.com/emmy16-glitch/Echoo-main](https://github.com/emmy16-glitch/Echoo-main) |
| 📖 Full docs hub | [docs/README.md](docs/README.md) |
| 🖥️ Desktop downloads | [GitHub Releases](https://github.com/emmy16-glitch/Echoo-main/releases) |
| 🚀 Deployment guide | [docs/deployment.md](docs/deployment.md) |
| 🎙️ 60-second go-live | [The go-live loop](#the-60-second-go-live-loop) |

---

## Table of contents

- [The 60-second go-live loop](#the-60-second-go-live-loop)
- [Why this is different](#why-this-is-different)
- [Features](#features)
- [Tech stack](#tech-stack)
- [How it works](#how-it-works)
- [LiveKit implementation](#livekit-implementation)
- [Recordings & storage implementation](#recordings--storage-implementation)
- [Limits and honesty rules](#limits-and-honesty-rules)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Verification](#verification)
- [API diagnostics](#api-diagnostics)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Product truth rules](#product-truth-rules)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## The 60-second go-live loop

1. **Prepare — Mix.** Open Creator Studio: connect mic, guests, and media, test the mix on the meters.
2. **Go Live — Broadcast.** One click opens the LiveKit room; presence flips to live, followers can join.
3. **Share — Grow.** Copy the listen link (`/listen/live/:id`) — anyone opening it hears the show instantly, account or not.
4. **Engage — Chat.** Signed-in listeners chat and react live; guests watch the conversation stream read-only.
5. **End — Keep.** Ending the broadcast finalizes the master, compresses it (~17 MB/hour), and archives it to cloud storage as a private draft.
6. **Replay — Publish.** Review in Recordings, publish — listeners stream or download on demand.

One connected loop:

**Mix → Broadcast → Share → Engage → Keep → Replay**

## Why this is different

Echoo is deliberately **not** another upload-and-wait audio host. It separates live presence, identity, and bytes:

- **LiveKit Cloud** routes real-time audio — the API never touches per-listener audio bytes, so a room scales without server load.
- **Guest-first listening** — shared links work with zero signup; accounts unlock chat, follows, and libraries, and guest sessions migrate into new accounts.
- **Honest states everywhere** — empty rooms, offline servers, and unconfigured audio say exactly what is wrong instead of spinning or faking.
- **Recordings are automatic** — the end of a broadcast, not an export button, is what saves the show.
- **One shared world per environment** — every install talks to the same API + database, so a broadcast is visible to everyone. No mock shows, counts, or transcripts, ever.

## Features

| Area | What you get |
|---|---|
| 📡 **Live rooms** | WebRTC stereo Opus via LiveKit Cloud, three creator quality profiles, live diagnostics |
| 🔗 **Share links** | `/listen/live/:id` works account-free — public card, guest token, subscriber-only audio |
| 💬 **Live chat** | Real-time messages, reactions, moderation (mute/pin/delete); read-only for guests |
| 👥 **Presence** | Live listener counts, peak tracking, creator-connected state |
| ⏺️ **Recordings** | Automatic post-broadcast save, Opus transcode (~17 MB/hr), cloud archive, publish/unpublish |
| 📝 **Transcripts** | Optional live transcription with quality pipeline, review + publish flow |
| 🔔 **Notifications** | In-app + native OS alerts (desktop) with per-type preferences |
| 📴 **Offline & background** | Downloads, offline cache, background audio on web/desktop/mobile, lock-screen controls |
| 🖥️ **Desktop extras** | System tray with room controls, close-to-tray while live, auto-launch, auto-updates |
| 📊 **Creator analytics** | Listeners, peaks, replays, and content performance per station |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, lazy-loaded listener/creator shells |
| Backend | Node.js 20 + Express + Socket.IO + Mongoose (MongoDB) |
| Live audio | LiveKit Cloud (WebRTC SFU), `livekit-client` / `@livekit/react-native` |
| Mobile | Expo React Native (iOS + Android), `expo-audio`, native foreground service for live |
| Desktop | Electron 41, bundled API server, embedded-DB fallback |
| Recordings | FFmpeg (Opus transcode) + S3-compatible object storage (R2 / Backblaze B2) |
| Transcription (optional) | Whisper gateway (Python service), failure-isolated |
| Testing | `node --test` suites, `tsc`, Vite build, GitHub Actions (`echoo-check`) |
| Deployment | Hosted site + Cloudflare, GitHub Releases (AppImage / NSIS `.exe` / DMG), EAS (mobile) |

## How it works

```
Creator studio (mixer: mic, guests, media)
        │  24-bit master → Opus over WebRTC
        ▼
LiveKit Cloud (real-time audio routing, no per-listener server load)
        ▼
Listeners (web / desktop / mobile — subscribe-only, account optional)
        │
        ▼ JSON / HTTPS + Socket.IO
Echoo API (Express)
  │       │        │        │
  │       │        │        └── MongoDB (accounts, shows, chat, media records)
  │       │        └─────────── S3-compatible storage (Opus replays, covers)
  │       └──────────────────── Whisper gateway (optional transcription)
  └──────────────────────────── Socket.IO rooms (chat, presence, status)
```

The API manages identity, lifecycle, chat, presence, tokens, and product data. It never relays live audio per listener. See [docs/architecture.md](docs/architecture.md) and [docs/audio-architecture.md](docs/audio-architecture.md).

## LiveKit implementation

Echoo uses LiveKit Cloud as its real-time audio SFU:

- **Creator** publishes exactly one `echoo-studio-mix` program publication (stereo Opus, 48 kHz; profiles up to 510 kbps) with a short-lived publisher token.
- **Listeners** attach only that publication to a native audio element with subscriber-only tokens (`canPublish: false`), reissued automatically on reconnect/expiry.
- **Guests** get server-generated `guest:<uuid>` identities with the same subscriber-only grants — they can never publish or impersonate accounts.
- Token issuance is IP rate-limited; rooms are created on go-live and swept when orphaned.

Backend knobs: `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (production requires public `wss://`). Local dev: `livekit-server --dev` (see [docs/getting-started.md](docs/getting-started.md)).

## Recordings & storage implementation

The browser captures a 24-bit/48 kHz stereo WAV master (~660 MB/hour) to local OPFS storage during the show. On broadcast end it finalizes and uploads it; the backend then:

1. Links it as the broadcast's replay (private draft).
2. Transcodes to Opus (`AUDIO_OPUS_BITRATE`, default `48k` stereo ≈ 17.5 MB/hour, ~38× smaller — measured).
3. PUTs it to S3-compatible object storage and deletes the local WAV (kept on any failure — archiving never breaks the upload).

Playback always resolves through signed, time-limited `/api/audio/:id/stream` URLs: local files stream with HTTP ranges; cloud files redirect (public buckets) or mint short-lived object URLs (private buckets — the free no-card setup). Only replays are transcoded; uploaded music keeps its original encoding.

Free, no-card storage: **Backblaze B2** (10 GB ≈ 570 show-hours, private bucket + signed playback). Setup: [backend/.env.example](backend/.env.example) (`AUDIO_*`).

## Limits and honesty rules

The default configuration is intentionally conservative:

| Guardrail | Default |
|---|---|
| Live site | [https://echoo.digi02.org/](https://echoo.digi02.org/) |
| Real-money anything | Nonexistent — no payments, no payouts anywhere |
| Guest audio | Subscribe-only, IP rate-limited tokens |
| Private broadcasts | 404 like missing ones (existence not probeable) |
| Unconfigured audio/storage | Clear in-app message, never a silent failure |
| Failed uploads | Local master kept; retry, never silent loss |
| Secrets | `.env` files only, gitignored, never committed |

See [docs/deployment.md](docs/deployment.md).

## Getting started

### Prerequisites

- Node.js `>= 20` (repo runs on 20.x)
- Python `3.10` for the Whisper transcription service (optional)
- MongoDB (local or a URI), FFmpeg on PATH (recording transcode)

### 1. Full stack (one command)

```bash
npm run dev:all
```

Starts MongoDB → LiveKit → backend (`:5017`) → frontend (`:5273`) → desktop, with readiness polling. Ctrl-C stops everything.

### 2. Per service

```bash
cd backend  && cp .env.example .env && npm run dev   # API + Socket.IO
cd frontend && npm run dev                            # web app (Vite)
cd desktop  && npm run dev                            # Electron shell
cd mobile   && npm start                              # Expo (see mobile/README.md)
```

Ports are project-specific, not framework defaults (`5273`/`5017`), and every readiness gate verifies app identity — see [docs/getting-started.md](docs/getting-started.md).

> Without LiveKit keys, a Whisper gateway, or cloud storage, Echoo still runs its account/discovery/replay surface and clearly reports which integrations are unavailable.

## Environment variables

| Scope | File | Key variables |
|---|---|---|
| Backend | `backend/.env.example` | `PORT`, `MONGODB_URI`, `JWT_*`, `CLIENT_ORIGINS`, `LIVEKIT_*`, `AUDIO_*`, `WHISPER_*`, `MASTER_ARCHIVE_*`, `RADIO_*` |
| Frontend | build-time | `VITE_API_URL` (packaged/desktop override), `VITE_PUBLIC_APP_ORIGIN` (share links), `VITE_LIVEKIT_URL` (fallback) |
| Desktop | build-time | `LIVEKIT_*` (baked into installers for zero-config go-live) |

See [backend/.env.example](backend/.env.example) for defaults and semantics.

## Verification

```bash
cd backend  && npm test
cd frontend && node --test src/services/*.test.mjs src/Components/CreatorStudio/*.test.mjs
cd mobile   && npx tsc --noEmit
```

GitHub Actions (`echoo-check`) runs lint, build, and checks on every push to `main` and every PR. Useful read-only probes (also live under `/api/...`): `GET /api/health`.

## API diagnostics

- `GET /api/health` — `{status: "ok", service: "echoo-api"}`
- `GET /api/broadcasts/:id/presence` — public listener counts (no auth)
- `GET /api/broadcasts/:id/public` — public broadcast card for share links (no auth)
- `POST /api/broadcasts/:id/guest-token` — guest listener credentials (no auth, rate-limited)
- `GET /api/audio/:id/stream-token` → `streamUrl` — signed playback (auth)

## Project structure

```
Echoo-main/
├── frontend/               # React + Vite web app (listener + creator shells)
│   └── src/services/       # api, realtime, livekit, recordings, storage clients
├── backend/                # Express API (trust boundary)
│   ├── src/routes/         # auth, broadcasts, audio, chat, stations, ...
│   ├── src/controllers/    # request handlers
│   ├── src/services/       # livekit, archive, transcription, mixer helpers
│   ├── src/models/         # User, Broadcast, Audio, Recording, Chat, ...
│   └── test/               # node --test suites
├── desktop/                # Electron shell + packaging (AppImage / NSIS / DMG)
│   └── src/main.js         # window, tray, IPC, bundled backend, updater
├── mobile/                 # Expo app (iOS + Android) + live-audio foreground module
├── echoo-landing/          # Marketing and release site
├── echoo-whisper/          # Python transcription service (optional)
├── docs/                   # Product, setup, architecture, deployment guides
├── scripts/                # dev-all, port checks, shared tooling
└── HOSTED-SERVER-SYNC.md   # Active hosted-server operator checklist
```

Backend source map: see [docs/architecture.md](docs/architecture.md).

## Deployment

**Live: [https://echoo.digi02.org/](https://echoo.digi02.org/)** (frontend + API, Cloudflare-fronted).

- Desktop installers ship from [GitHub Releases](https://github.com/emmy16-glitch/Echoo-main/releases) with update manifests the in-app updater consumes.
- Mobile preview APKs ship from EAS (`mobile/APK_BUILD.md`).
- Self-hosting checklist (env, LiveKit Cloud, storage, CORS, fresh frontend): [docs/deployment.md](docs/deployment.md).

## Product truth rules

Echoo must never claim:

- an unavailable room is live, or a private room exists,
- a simulated or missing number is a real measurement,
- one broadcast proves repeatable reach,
- research/transcription output is human-verified,
- a virtual balance, badge, or receipt is withdrawable value,
- an order, payment, or payout was placed,
- unavailable audio/storage is working.

If evidence is unavailable, the product says so. If an integration fails, the UI stays understandable and shows an actionable message — never an HTTP status, traceback, or connector error.

## Documentation

| Document | Contents |
|---|---|
| [docs/README.md](docs/README.md) | Docs hub / reading order |
| [docs/product.md](docs/product.md) | Roles, journeys, feature map |
| [docs/getting-started.md](docs/getting-started.md) | Dev stack, ports, env, tests |
| [docs/architecture.md](docs/architecture.md) | System map, authority rules, lifecycle |
| [docs/audio-architecture.md](docs/audio-architecture.md) | Capture → mixer → LiveKit → ear deep dive |
| [docs/deployment.md](docs/deployment.md) | Hosted site, production checklist, releases |
| [docs/transcription.md](docs/transcription.md) | Whisper gateway deployment |
| [desktop/README.md](desktop/README.md) | Shell internals, IPC, CSP, updater, release matrix |
| [mobile/README.md](mobile/README.md) + [APK_BUILD.md](mobile/APK_BUILD.md) | App guide, background audio, EAS builds |
| [HOSTED-SERVER-SYNC.md](HOSTED-SERVER-SYNC.md) | Hosted-server operator checklist (active task) |
| [docs/archive/](docs/archive/) | Frozen audits and historical reports |

## Contributing

1. Fork and branch from `main`.
2. Keep media authority in LiveKit and product truth in the API — never let generated/provisional text overwrite measured state.
3. Add or update tests for behavior changes (`node --test`, `tsc`).
4. Run [Verification](#verification) locally before opening a PR.
5. Respect the [Product truth rules](#product-truth-rules).

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 Emmanuel Okunlola.
