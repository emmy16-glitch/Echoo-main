# Echoo architecture

This repository is the source of truth for the Echoo product.

## Repository

- `frontend/` — React + Vite web client
- `backend/` — Express + MongoDB API/control plane
- Live media — LiveKit
- Realtime application events — Socket.IO
- Prerecorded/recording storage — persistent local backend disk or S3-compatible object storage behind protected streaming endpoints
- Recording runtime — FFmpeg + FFprobe on the backend (automatic replay MP3 + trimming)

## Core authority rules

Echoo avoids multiple competing implementations for the same product state.

### Stations

Creator Studio → **Stations** is the only station creation/management UI.

Canonical backend resource:

- `POST /api/stations`
- `GET /api/stations/mine/all`
- `PATCH /api/stations/:stationId`
- `DELETE /api/stations/:stationId`

`Station.isLive` and `Station.listenerCount` are derived runtime fields controlled by the Broadcast/LiveKit lifecycle. A creator cannot manually toggle them through the Station API.

Station does not own a second schedule. Future timing belongs to Broadcast records.

### Broadcast scheduling and lifecycle

Broadcast is the single scheduling/lifecycle model.

Canonical lifecycle:

```text
draft/scheduled/failed
        ↓
     starting
        ↓
post-master Echoo program track published to LiveKit
        ↓
       live
        ↓
      ending
        ↓
    completed
```

Other terminal state: `cancelled`.

Lifecycle mutations use explicit endpoints:

- `POST /api/broadcasts/:broadcastId/start`
- `POST /api/broadcasts/:broadcastId/confirm-live`
- `POST /api/broadcasts/:broadcastId/end`
- `POST /api/broadcasts/:broadcastId/cancel`

A generic Broadcast metadata update must not change lifecycle status.

### Creator Broadcast Studio

Immediate and scheduled broadcasts converge on the same Creator Studio → **Broadcast** workspace.

The current production media path is:

```text
Host microphone ─┐
Guest microphone ├─> Web Audio mixer ─> master protection/output
Music/system ────┘                         ↓
                                   echoo-studio-mix
                                          ↓
                           stereo Opus, DTX disabled
                                          ↓
                                       LiveKit
                                          ↓
                               receive-only listeners
```

Important invariants:

- The browser mixer owns the audio program.
- The post-master track is named `echoo-studio-mix`.
- The backend only confirms LIVE after that program publication is visible in LiveKit.
- The backend is a control plane; Node/Express does not relay the live audio bytes to every listener.
- Echoo must never silently fall back from the mixer to a raw microphone publication.

Current quality profile targets a 48 kHz browser pipeline where supported and a 256 kbps maximum Opus bitrate target for the stereo program feed. Actual WebRTC bitrate remains network/browser dependent.

### Listener live audio

Public live broadcasts can be joined by authenticated listener participants without requiring a Follow relationship.

Listener LiveKit grants are receive-only:

- room join: yes
- media subscribe/receive: yes
- media publish: no
- data publish: no

The listener attaches only to Echoo's named program publication rather than arbitrary remote audio tracks.

### Presence

LiveKit participants are authoritative for current live presence.

Echoo synchronizes:

- `Broadcast.listenerCount`
- `Broadcast.peakListeners`
- `Station.listenerCount`

The API uses short-lived/coalesced presence reads so listener bursts do not cause a database/refetch storm.

### Realtime chat/status

MongoDB/REST is the persisted source of truth for chat. Socket.IO is the realtime delivery layer for messages, reactions, moderation, broadcast status and presence-change hints. REST refresh is the recovery fallback.

Current Socket.IO state is process-local. A single backend process is supported today. Audience joins/leaves are coalesced into one presence snapshot instead of broadcasting one event per listener, listener clients consume that snapshot directly, and realtime-outage fallback uses jittered presence-only polling instead of repeated chat-history polling. Horizontal multi-instance deployment requires a shared Socket.IO adapter/state layer (for example Redis) before realtime rooms/events can be treated as cluster-wide.

### Recordings, prerecorded audio and private media

The primary long-lived-server recording path is LiveKit Track Egress. The
creator publishes the post-master program track once; LiveKit sends that same
track to Echoo's signed recording WebSocket and backend FFmpeg writes the
canonical MP3. The browser OPFS WAV is local recovery/lossless-export data and
does not normally upload after the show.

If LiveKit server recording fails, the OPFS master can be uploaded afterward in
bounded chunks as a recovery path. That fallback never runs while listener
WebRTC is live. A backend process restart also invalidates ownership of any
in-progress server recorder; an orphan Egress is failed closed rather than
allowed to overwrite the previous MP3 with a tail-only recording.

Saved-recording trims are server-side and non-destructive: the client sends
timestamps, the backend creates a separate trimmed recording, and the original
remains unchanged.

Physical audio bytes may remain on persistent local backend disk or be archived
to configured S3-compatible object storage. Direct `/uploads/audio/...` access
is deliberately blocked.

Playback uses:

- `POST /api/audio/:id/stream-token` — issue a scoped, expiring playback grant
- `GET /api/audio/:id/stream` — protected streaming with HTTP Range support
- `HEAD /api/audio/:id/stream` — metadata/range-compatible probe
- `GET /api/audio/:id/download` — authenticated explicit download

Every stream request rechecks the current Audio record. A previously issued public URL cannot continue opening a track after it is unpublished or deleted.

The frontend must not persist signed stream tokens as permanent media identifiers.

Ephemeral/container/serverless deployments must use private object storage.
Persistent VPS/bare-metal deployments may keep canonical MP3 files on durable
local disk, while preserving Echoo's authorization layer.

### Follow relationships

Creator follows and Station follows are separate relationships:

- creator/user relationship → `Follow`
- station relationship → `StationFollow`

Following never controls access to public live audio.

### Library and playback state

- Saved audio and playlists are backend-authoritative.
- Browser `localStorage` is not the authoritative library database.
- Cache Storage may hold downloaded media bytes for offline use.
- A listener playback-progress report may update that user's progress/history only; it must never rewrite creator-owned canonical Audio metadata.

### Search and analytics honesty

Search reads real public Echoo data only: audio, creators, stations and public playlists.

Analytics and trend surfaces may show only recorded values. Echoo does not fabricate geography, demographics, follower curves, query counts or trend percentages when those measurements do not exist.

## Authentication and account state

- Access and refresh JWTs are separate token types and are verified against their configured algorithms.
- Logout/password changes invalidate older refresh tokens through `refreshTokenVersion`.
- Normal authenticated routes require an active account.
- Reactivation is an explicit exception: a valid signed session may identify an inactive account only for the dedicated reactivation operation.
- Authentication, sensitive account operations, search and large uploads have endpoint-specific request throttles. Current in-memory rate-limit stores are per backend process; multi-instance enforcement requires a shared store.

## Health semantics

- `/api/health` — process liveness
- `/api/health/ready` — API readiness, currently requiring MongoDB
- `/api/health/livekit` — explicit LiveKit connectivity/configuration check
- `/api/health/recording` — FFmpeg/FFprobe recording readiness; a recording-capable production backend requires HTTP 200 with `automaticServerMp3: true` and `trimming: true`

For host/deploy requirements, [HOSTING.md](HOSTING.md) is authoritative.

## Media infrastructure

Direct LiveKit remains the listener transport. LiveKit Track Egress is the
preferred server-recording path on long-lived backends (LiveKit Cloud provides
Egress; self-hosted LiveKit requires its separate Egress service), but a recorder failure
must never interrupt or block the live listener stream. OvenMediaEngine remains
optional legacy/future relay infrastructure and is not required for normal
broadcasting.

## Mock-data policy

Production routes and connected product screens must not substitute fake broadcasts, listeners, followers, creators, recommendations, bundled sample audio or synthetic analytics when the backend is empty or unavailable.

Use honest empty states instead.

## Optional transcript pipeline

Transcription is optional and is deliberately independent of recording. It is
**off by default** and requires `TRANSCRIPTION_ENABLED=true` plus valid Whisper
credentials before any transcript session/job can run. With the flag false, stale
Whisper credentials do nothing, no transcript jobs are created, and End Broadcast /
MP3 finalization never waits on transcription.

If transcription is enabled later, transcript processing may use durable audio
chunks and the existing `BroadcastProcessingJob` quality worker, but those
jobs must not sit in the critical listener or server-recording path.

The current product decision is deliberately private processing: no live transcript text is rendered to creators or listeners. The creator reviews and publishes the final transcript on the processing screen, and listeners see/search it only on the published replay.
