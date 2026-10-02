# Echoo live recovery architecture

Status: implemented for the web creator/listener runtime in the LiveKit 2.22.3 reliability upgrade.

## Goal

A short network interruption must not turn an active Echoo show into a permanent
"Reconnecting" state. The broadcast identity, mixer output and protected
recording are session state. A LiveKit `Room` is transport state and is
replaceable.

## Architecture references studied

Echoo keeps LiveKit as the realtime SFU, but borrows recovery principles from
several mature open-source systems:

- **LiveKit client-sdk-js** — distinguishes signal-only reconnect from full
  media reconnect, exposes a bounded reconnect policy and owns ICE/signalling
  recovery internally.
- **SRS** — treats the stream as more durable than a single origin/edge path.
  Failed paths can be replaced without changing the logical stream.
- **mediasoup** — separates application/session state from WebRTC transport
  state, observes transport statistics, restarts ICE first, and closes/rebuilds
  failed transports instead of leaving them half-alive.
- **Janus** — uses ICE restart for network-path changes without mutating the
  media session, especially for audio-only rooms.
- **Galène** — automatically restarts ICE after transport failure, explicitly
  replaces streams, buffers/flushes candidate state carefully and uses explicit
  liveness checks.

Echoo does not call `RTCPeerConnection.restartIce()` directly because LiveKit
owns the peer connection. Doing so from the application layer would race the
SDK. Instead Echoo supervises LiveKit's recovery and escalates only when the SDK
has not recovered in time.

## Recovery ladder

### Stage 0 — healthy

Creator publishes exactly one canonical `echoo-studio-mix`. Listeners
subscribe only to that publication.

### Stage 1 — signal-only recovery

`RoomEvent.SignalReconnecting` means signalling is interrupted but RTP may
still be flowing.

Echoo therefore:

- keeps the existing program publication authoritative;
- continues sender/receiver RTP progress checks;
- does not show the manual hard-reconnect action merely because signalling is
  recovering;
- waits for LiveKit to resume signalling.

### Stage 2 — LiveKit native media recovery

`RoomEvent.Reconnecting` means the media connection itself is interrupted.
LiveKit receives the short retry schedule defined by
`LIVEKIT_RECONNECT_DELAYS_MS`.

Echoo arms an independent hard deadline at the same time. This prevents the
application from trusting a stuck SDK reconnect forever.

### Stage 3 — hard transport replacement

If the same room is still not connected after 30 seconds:

Creator:

1. keeps the existing Echoo mixer `MediaStreamTrack`;
2. obtains fresh creator credentials;
3. detaches the stale LiveKit room;
4. creates a fresh room;
5. republishes the same canonical program track;
6. preserves pause state, broadcast ID and recording session.

Listener:

1. applies a per-client jitter to avoid reconnect stampedes;
2. tears down the stale room through the normal component lifecycle;
3. obtains fresh subscriber credentials;
4. joins a fresh room;
5. explicitly subscribes only to the canonical program publication;
6. removes stale audio elements and attaches the replacement publication.

The logical broadcast does not restart.

### Stage 4 — continued recovery

Creator recovery keeps retrying through the backend's normal disconnect grace
window and then at a slow bounded cadence. Listener recovery continues while the
broadcast is live. Offline time does not consume the creator recovery budget.

## Liveness

A DOM `<audio>` element reporting "playing" is not enough. Echoo samples RTP
counters:

- creator: sender bytes/packets;
- listener: receiver bytes/packets.

A sustained lack of progress escalates recovery even if the browser or LiveKit
object still appears nominally alive. This follows the same principle used by
transport-centric systems such as mediasoup and Galène: transport progress is
stronger evidence than UI state.

## Stale-event protection

Every recovery callback is scoped to the room/session generation that created
it.

Creator handlers require both the active session generation and the same
`activeRoom`.

Listener handlers require `roomRef.current === room`.

A late event from an abandoned room therefore cannot overwrite health state or
disconnect a replacement room.

## Anti-stampede behavior

Only one creator publishes the program feed, so creator hard recovery can be
immediate after its deadline.

Listeners add stable per-client jitter before a hard rejoin. Hundreds of
listeners therefore do not request fresh tokens simultaneously after a shared
network event.

## Dependency baseline

Web and mobile pin `livekit-client` to **2.22.3**. This includes the 2.22.2
subscriber reconnect fix that prevents remote ICE candidates from remaining
buffered indefinitely after a reconnect, plus later 2.22.3 fixes.

The 2.22.x state-machine dependency requires Node 22.22+ for web/mobile
dependency installation and builds. Backend runtime remains independently
compatible with Node 20+.

## Failure tests

The reliability gate must cover:

- signal-only reconnect while RTP continues;
- full reconnect that succeeds within the native recovery window;
- reconnect that exceeds 30 seconds and forces a fresh room;
- creator republish with a new track SID;
- listener replacement of a stale program publication;
- Wi-Fi/mobile-network path changes;
- sender/receiver RTP stalls while objects still look connected;
- offline/online transitions;
- staggered listener recovery under a large audience.

The source-contract tests protect the supervisor wiring, while
`liveRecoveryPolicy.test.mjs` tests the actual policy predicates and deadlines.
Cross-browser Playwright and deployment smoke tests remain the final release
gate.

## Future extension

If Echoo later operates multiple LiveKit ingress/region URLs, the credential API
can return an ordered candidate list and the hard-recovery stage can rotate
between them. That would apply the SRS multiple-origin failover idea without
changing the public broadcast identity.


## Long-session lifecycle hardening

The logical broadcast is now explicitly longer-lived than any one LiveKit
participant or room instance.

- Creator participant loss stores a durable `creatorDisconnectedAt` timestamp
  and keeps the broadcast `live`.
- An established show gets a default 24-hour recovery lease
  (`LIVEKIT_CREATOR_RECOVERY_TTL_HOURS`, bounded to 1–48 hours).
- Rejoining clears the durable disconnect timestamp.
- Backend restart does not lose cleanup state: the orphan sweep runs
  immediately and periodically, discovers missed participant-left webhooks,
  verifies actual LiveKit creator presence, and only expires a disconnected
  show after its recovery lease.
- Explicit **End Broadcast** remains the normal authority for ending a show.

This separation follows the transport/session split used by mediasoup, Janus,
Galène and resilient origin/edge systems: a replaceable transport is not the
same thing as the user's logical live session.

## Multi-hour protected recording

Echoo's disk-backed browser master uses **RF64/WAV** rather than classic RIFF
for new recordings. RF64 keeps the same 48 kHz stereo 24-bit PCM program audio
but carries 64-bit sizes, avoiding RIFF's ~4 GiB ceiling during multi-hour
shows.

Legacy RIFF masters remain readable. Post-live server recovery still slices the
master into small ordinary RIFF/WAV chunks, so backend recovery validation does
not need giant-file handling.

Desktop exports use bounded IPC chunks instead of converting a multi-gigabyte
Blob into one ArrayBuffer. Local MP3 conversion also reads the RF64 master in
bounded slices.

Storage capacity remains a physical device constraint: RF64 removes the file
format ceiling, not the need for enough free local storage.


The release gate also syntax-checks the Electron main/preload recording bridge so
the chunked multi-hour export path is validated alongside web, backend, and
mobile code.
