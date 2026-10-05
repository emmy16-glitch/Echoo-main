# Architecture

## System map

```text
┌─────────────┐   ┌─────────────┐   ┌──────────────┐
│ Web (Vite)  │   │  Desktop    │   │ Mobile (Expo)│  ◄── clients
│ React SPA   │   │ (Electron + │   │ iOS + Android│
└──────┬──────┘   │ local React)│   └──────┬───────┘
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

- **One shared backend per environment.** Web, Windows Desktop, and Mobile talk to the same API + database; that is what makes accounts, broadcasts, chat, recordings, and channels consistent across clients. Echoo Desktop does **not** bundle a private API, database, Render service, or server credentials.
- **LiveKit is the live media authority.** Playback attaches only to the named `echoo-studio-mix` publication; listener tokens are hidden and subscribe-only, listeners explicitly subscribe only to the program track, and reconnects are jittered to avoid audience stampedes.
- **Private media by default.** Recording files, covers, and replays resolve through signed, time-limited stream URLs. Cloud object URLs are never exposed in API output.
- **Recording runtime is a backend capability.** Automatic replay MP3 and saved-recording trim require FFmpeg + FFprobe. Production readiness is exposed by `GET /api/health/recording`.
- **Public data is explicit.** Only broadcasts flagged public appear in discovery, shared links, and guest endpoints; private broadcasts 404 like missing ones.
- **Single API process for realtime.** Socket.IO runs in-process; audience presence changes are coalesced instead of emitted per listener, and realtime-outage fallback is jittered presence-only polling. Multi-instance API deployment still needs a shared adapter before rooms can span processes.
- **No mock data.** The product never serves fabricated shows, counts, or transcripts; empty states are honest.

## Broadcast lifecycle (happy path)

`scheduled → starting → live → ending → completed` (plus `cancelled`/`failed` exits). Going live mints the LiveKit room and creator token. During the show, the creator publishes one program track to LiveKit, LiveKit Track Egress feeds the server recorder when enabled, and the browser writes only its local OPFS recovery master. Ending stops listener delivery, closes the local master, flushes/finalizes the canonical MP3 replay, and links it idempotently to the broadcast. Browser WAV chunks are post-live recovery only. Trimming is a later non-destructive Recordings action that creates a separate private copy; it is not part of the End Broadcast save path.

## Clients

- **Web** (`frontend/`): React SPA, lazy-loaded Listener/Creator shells, and Vite proxying in development.
- **Windows Desktop** (`desktop/`): the canonical Electron client. Its React renderer is built locally into the installer and served from the private `echoo-app://app` origin. Native Windows capabilities include single-instance routing, `echoo://` deep links, tray/background lifecycle, notifications, filesystem recording saves, File Explorer actions, audio-device recovery, auto-launch, power management, taskbar progress, default-browser handoff, and GitHub auto-updates. It uses the same shared Echoo API + LiveKit platform as Web and contains no private backend/database or server secrets. Details: `desktop/README.md`.
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
