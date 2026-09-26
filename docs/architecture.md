# Architecture

## System map

```text
┌─────────────┐   ┌─────────────┐   ┌──────────────┐
│ Web (Vite)  │   │  Desktop    │   │ Mobile (Expo)│  ◄── clients, subscribe-only for listeners
│ React SPA   │   │ (Electron + │   │ iOS + Android│
└──────┬──────┘   │  bundled API)│   └──────┬───────┘
       │          └──────┬───────┘          │
       └────────┬───────┴────────┬─────────┘
                ▼                ▼
┌────────────────────────┐   ┌──────────────────┐
│ Echoo API (Express)    │   │  LiveKit Cloud   │  ◄── real-time audio routing
│ identity, lifecycle,   │   │  (WebRTC SFU)    │
│ chat, presence, media  │   └──────────────────┘
│ access, recordings     │
└───────┬────────────────┘
        ▼
┌────────────────────────┐   ┌──────────────────┐
│ MongoDB                │   │ S3-compatible    │  ◄── recordings archive
│ (accounts, shows,      │   │ object storage   │
│  chat, media records)  │   │ (R2 / B2)        │
└────────────────────────┘   └──────────────────┘
```

Realtime product events (chat, presence, status) travel over Socket.IO from the API process. Live listener audio travels creator → LiveKit → listeners. On a long-lived recording-capable backend, LiveKit Track Egress sends the already-published program to Echoo's recording WebSocket and FFmpeg writes the canonical MP3. The browser writes a local OPFS WAV safety master and sends bounded WAV recovery chunks only after OFF AIR if server recording failed. The API does not relay live audio per listener.

## Authority rules

- **One shared backend per environment.** Every install in an environment talks to the same API + database; that is what makes a broadcast visible to everyone. (Desktop installers can bundle a local server for offline/single-machine use, but a shared world needs the hosted API — see `deployment.md`.)
- **LiveKit is the live media authority.** Playback attaches only to the named `echoo-studio-mix` publication; listener tokens are hidden and subscribe-only, listeners explicitly subscribe only to the program track, and reconnects are jittered to avoid audience stampedes.
- **Private media by default.** Recording files, covers, and replays resolve through signed, time-limited stream URLs. Cloud object URLs are never exposed in API output.
- **Recording runtime is a backend capability.** Automatic replay MP3 and saved-recording trim require FFmpeg + FFprobe. Production readiness is exposed by `GET /api/health/recording`.
- **Public data is explicit.** Only broadcasts flagged public appear in discovery, shared links, and guest endpoints; private broadcasts 404 like missing ones.
- **Single API process for realtime.** Socket.IO runs in-process; audience presence changes are coalesced instead of emitted per listener, and realtime-outage fallback is jittered presence-only polling. Multi-instance API deployment still needs a shared adapter before rooms can span processes.
- **No mock data.** The product never serves fabricated shows, counts, or transcripts; empty states are honest.

## Broadcast lifecycle (happy path)

`scheduled → starting → live → ending → completed` (plus `cancelled`/`failed` exits). Going live mints the LiveKit room and creator token. During the show, the creator publishes one program track to LiveKit, LiveKit Track Egress feeds the server recorder when enabled, and the browser writes only its local OPFS recovery master. Ending stops listener delivery, closes the local master, flushes/finalizes the canonical MP3 replay, and links it idempotently to the broadcast. Browser WAV chunks are post-live recovery only. Trimming is a later non-destructive Recordings action that creates a separate private copy; it is not part of the End Broadcast save path.

## Clients

- **Web** (`frontend/`): React SPA, lazy-loaded listener/creator shells, Vite proxy to the API in dev, relative asset base so the same bundle also runs inside Electron's `file://`.
- **Desktop** (`desktop/`): Electron shell — single instance, tray with room controls, native notifications, auto-launch, GitHub auto-updates, graceful LiveKit/socket shutdown. Default builds are hosted thin clients; bundling the API server + embedded-database fallback is an explicit opt-in. Details: `desktop/README.md`.
- **Mobile** (`mobile/`): Expo app, `expo-audio` playback with lock-screen controls, LiveKit listener rooms, Android media-playback foreground service for background live audio. Details: `mobile/README.md`, builds: `mobile/APK_BUILD.md`.
- **Landing** (`echoo-landing/`): marketing and release site (separate concern).

## Deep dives

- [Audio pipeline](audio-architecture.md) — capture, mixer, publishing profiles, listener attach.
- [Transcription](transcription.md) — Whisper gateway deployment and behavior.
- [Desktop internals](../desktop/README.md) — IPC contract, CSP, updater, release matrix.


## Hosting authority

Deployment/runtime requirements are defined in [../HOSTING.md](../HOSTING.md).
An AI or human operator must not infer hosting solely from this architecture
diagram. In particular, FFmpeg + FFprobe and persistent recording storage are
mandatory for a recording-capable production backend.


## Recording host dependency

The backend requires **FFmpeg and FFprobe** for automatic server MP3 replay
finalization and server-side trimming. Hosting agents must verify
`GET /api/health/recording` before declaring a deployment ready. See
[../HOSTING.md](../HOSTING.md).
