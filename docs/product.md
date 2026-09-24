# Product overview

Echoo connects audio creators with live audiences. A creator opens the Creator Studio, mixes microphone, guests, and media sources, and goes live. Listeners join from a link — no account required — hear the show in real time, react in live chat, follow stations, and replay published recordings later.

## Roles

- **Listener** — discovers stations and live shows, listens live (account optional via shared links), chats and reacts (account required), follows stations, saves moments, downloads for offline, manages settings.
- **Creator** — owns a channel/station, runs the broadcast workstation (mixer, guests, audio quality profiles), goes live, ends shows, reviews transcripts, publishes replays and recordings, reads analytics, manages profile and account security.
- **Guest (no account)** — opens a shared listen link and hears the show live with live listener counts and read-only chat. Signing up unlocks chat, follows, and library features. Guest sessions migrate into new accounts automatically.

## Core journeys

1. **Go live (creator):** prepare workstation → test mix → Go Live → LiveKit room opens, presence flips to live → recording chunks stream to the backend during the show → End Broadcast finalizes the canonical server MP3 automatically as a private draft → optional MP3/WAV device copy follows the creator's remembered device preference.
2. **Listen live (anyone):** open `/listen/live/:id` → room card + live audio → optionally sign in to chat/follow.
3. **Replay (creator):** Recordings → review → publish → listeners stream or download. Replays are stored as MP3 files (server canonical copy, local disk or cloud object storage), streamed through signed time-limited URLs.
4. **Catch up (listener):** library, history, downloads, saved moments, notifications for followed stations.

## Feature map

| Area | Highlights |
|---|---|
| Live audio | WebRTC via LiveKit Cloud, stereo Opus, three creator quality profiles, diagnostics |
| Live chat | Real-time messages, reactions, moderation (mute/pin/delete), guest read-only |
| Presence | Live listener counts, peak tracking, creator-connected state |
| Recordings | Automatic 320k server MP3, non-destructive server-side trim copies, organized MP3/WAV device copies, cloud/local durable storage, publish/unpublish |
| Transcripts | Optional live transcription with quality pipeline, review + publish flow |
| Notifications | In-app + (desktop) native OS alerts with per-type preferences |
| Offline | Downloads, offline cache, background audio on all clients |
| Desktop extras | System tray with room controls, auto-launch, auto-updates via GitHub Releases |


## Recording product truth

- The server replay is saved automatically as MP3; creators do not manually
  upload or rename the normal replay.
- Trimming happens **after** the source replay exists and creates a separate
  private trimmed copy. It does not overwrite the original.
- Device MP3/WAV copies are separate from the canonical server recording.
- The browser recovery WAV is not the normal final server upload.
- A production host must have FFmpeg + FFprobe. See [../HOSTING.md](../HOSTING.md).
