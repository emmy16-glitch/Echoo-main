# Product overview

Echoo connects audio creators with live audiences. A creator opens the Creator Studio, mixes microphone, guests, and media sources, and goes live. Listeners join from a link — no account required — hear the show in real time, react in live chat, follow stations, and replay published recordings later.

## Roles

- **Listener** — discovers stations and live shows, listens live (account optional via shared links), chats and reacts (account required), follows stations, saves moments, downloads for offline, manages settings.
- **Creator** — owns a channel/station, runs the broadcast workstation (mixer, guests, audio quality profiles), goes live, ends shows, reviews transcripts, publishes replays and recordings, reads analytics, manages profile and account security.
- **Guest (no account)** — opens a shared listen link and hears the show live with live listener counts and read-only chat. Signing up unlocks chat, follows, and library features. Guest sessions migrate into new accounts automatically.

## Core journeys

1. **Go live (creator):** prepare workstation → test mix → Go Live → LiveKit room opens, presence flips to live → end broadcast → trim/crop the master on a waveform screen → save as a private draft (server copy is MP3 automatically; optional MP3/WAV copy to the `Desktop/Echoo Recordings` PC library).
2. **Listen live (anyone):** open `/listen/live/:id` → room card + live audio → optionally sign in to chat/follow.
3. **Replay (creator):** Recordings → review → publish → listeners stream or download. Replays are stored as MP3 files (server canonical copy, local disk or cloud object storage), streamed through signed time-limited URLs.
4. **Catch up (listener):** library, history, downloads, saved moments, notifications for followed stations.

## Feature map

| Area | Highlights |
|---|---|
| Live audio | WebRTC via LiveKit Cloud, stereo Opus, three creator quality profiles, diagnostics |
| Live chat | Real-time messages, reactions, moderation (mute/pin/delete), guest read-only |
| Presence | Live listener counts, peak tracking, creator-connected state |
| Recordings | Trim/crop before save, automatic server MP3 (~86 MB/hr), PC copy as MP3/WAV, cloud archive, publish/unpublish |
| Transcripts | Optional live transcription with quality pipeline, review + publish flow |
| Notifications | In-app + (desktop) native OS alerts with per-type preferences |
| Offline | Downloads, offline cache, background audio on all clients |
| Desktop extras | System tray with room controls, auto-launch, auto-updates via GitHub Releases |
