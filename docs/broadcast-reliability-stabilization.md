# Broadcast reliability stabilization

## Audited lifecycle

Echoo owns one long-lived browser mixer and one canonical post-master
`MediaStreamTrack`. That track feeds two independent branches:

1. `livekitPublisher.js` publishes `echoo-studio-mix` for realtime listeners.
2. `broadcastRecordingService.js` records the mixer bus to OPFS (with an Opus
   fallback) and optionally uploads bounded quality chunks.

The broadcast document and LiveKit room are coordination state. They must not
own or destroy the mixer track or recorder during a recoverable network fault.
Hard recovery therefore replaces only the LiveKit room/publication and keeps
the broadcast ID, mixer track, and active recorder.

Listeners receive a fresh short-lived subscriber token, connect to the room,
find the canonical publication, and attach exactly one live media element.
Room signalling recovery is not proof of playback recovery: the current
publication, subscribed track, DOM attachment, and media playback state must
all be revalidated after reconnect.

Ending is the only normal boundary that stops publication and finalizes the
recorder. The backend end endpoint is idempotent. During the show, bounded PCM/WAV
chunks feed the backend replay encoder. The browser OPFS master stays recoverable
until canonical server MP3 persistence is confirmed; completion retries reconcile
by broadcast ID rather than creating another replay.

FFmpeg and FFprobe are required on the backend for automatic server MP3
finalization and saved-recording trimming. `GET /api/health/recording` is the
deployment readiness gate for those capabilities.

Large replay trims are server jobs. The browser sends timestamps only; FFmpeg
reads the already-saved source, writes a separate trimmed output, validation
completes, and a new private Audio record is created. The original recording is
never replaced by a successful trim and remains untouched on every failure path.

## Recovery invariants

- Exactly one canonical `echoo-studio-mix` publication per creator room.
- Reconnect never calls `ensureBroadcastRecording` for an existing take.
- `stopLocalTrackOnUnpublish: false` remains mandatory.
- Every async recovery is scoped to a monotonically increasing generation.
- Automatic retries are bounded with 0/1/2/4/8-second backoff and cancellation.
- Creator health is derived from actual room, publication, and mixer-track
  state; backend presence is supplementary.
- Listener "playing" requires a current canonical track and a usable,
  non-ended media element rather than a remembered track ID.
- OPFS data is deleted only after confirmed canonical server persistence or explicit discard.
- End Broadcast must never depend on one giant final WAV upload.
- Exactly one canonical replay MP3 is linked per broadcast; trimming creates separate copies.

## Server coordination

LiveKit webhooks preserve a live broadcast through a configurable creator
disconnect grace window (20 seconds by default). A republishing creator cancels
the pending terminal transition. Presence continues to distinguish logical
broadcast status from current creator transport presence.


## Hosting requirement

Any operator or AI agent deploying this reliability path must read
[../HOSTING.md](../HOSTING.md). A deployment is not recording-ready until both
`ffmpeg -version` and `ffprobe -version` succeed in the backend runtime and
`GET /api/health/recording` reports `automaticServerMp3: true` and
`trimming: true`.
