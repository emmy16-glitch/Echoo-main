# Echoo architecture

This repository is the source of truth for the Echoo product.

## Repository

- `frontend/` — React + Vite web client
- `backend/` — Express + MongoDB API
- Live audio — LiveKit
- Realtime app events — Socket.IO

## Single-authority rules

Echoo intentionally avoids multiple competing implementations for the same product state.

### Stations

There is one creator UI for creating and managing stations: **Creator Studio → Stations**.

The canonical backend resource is:

- `POST /api/stations`
- `GET /api/stations/mine/all`
- `PATCH /api/stations/:stationId`
- `DELETE /api/stations/:stationId`

The Live and Schedule workspaces may select existing stations but must not create another station implementation.

`Station.isLive` and `Station.listenerCount` are runtime fields controlled by the broadcast/LiveKit lifecycle. Creators cannot manually toggle them through the Station API.

### Broadcast scheduling

There is one scheduling model: **Broadcast**.

Canonical fields:

- `startTime`
- `endTime`
- `status`

There is no separate Schedule document/API and no separate Station schedule that competes with Broadcast state.

### Broadcast lifecycle

Canonical state flow:

```text
draft/scheduled/failed
        ↓
     starting
        ↓
LiveKit creator connected
        ↓
      live
        ↓
     ending
        ↓
    completed
```

Other terminal state:

```text
cancelled
```

A generic Broadcast `PATCH` must not change lifecycle status.

Lifecycle actions use explicit endpoints:

- `POST /api/broadcasts/:broadcastId/start`
- `POST /api/broadcasts/:broadcastId/confirm-live`
- `POST /api/broadcasts/:broadcastId/end`
- `POST /api/broadcasts/:broadcastId/cancel`

### Creator live flow

#### Go Live Now

```text
Creator Studio → Live
        ↓
Choose existing station
        ↓
Broadcast details
        ↓
Local microphone check
        ↓
Save real Broadcast
        ↓
/start
        ↓
Creator connects/publishes microphone to LiveKit
        ↓
/confirm-live
        ↓
LIVE
```

#### Schedule Later

```text
Creator Studio → Schedule
        ↓
Choose existing station
        ↓
Details + date/time
        ↓
Save real scheduled Broadcast
        ↓
Enter Studio
        ↓
Same Live workspace
        ↓
Local microphone check
        ↓
/start → LiveKit publish → /confirm-live
        ↓
LIVE
```

Both flows converge on the same Creator Live Studio.

### Listener live audio

Current MVP media path:

```text
Creator microphone
        ↓
      LiveKit
        ↓
Listener receive-only participant
        ↓
Browser audio
```

Listeners do not need to follow a creator or station to hear a public live broadcast.

The listener LiveKit token is authenticated and receive-only:

- room join: yes
- media subscribe/receive: yes
- media publish: no
- data publish: no

`subscribe` in LiveKit terminology means receiving a media track. It is not an Echoo subscription product or paywall.

### Presence

LiveKit participants are authoritative for current live presence.

Echoo synchronizes:

- `Broadcast.listenerCount`
- `Broadcast.peakListeners`
- `Station.listenerCount`

Creator and listener UIs consume these real values.

### Realtime chat/status

Persisted chat remains in MongoDB/REST. Socket.IO is the realtime delivery layer for:

- chat messages
- reactions
- pinned/deleted messages
- broadcast status
- presence changes

REST refresh is a fallback, not a second source of truth.

### Follow relationships

Creator follows and Station follows are separate relationships:

- creator/user relationship → `Follow`
- station relationship → `StationFollow`

Following never controls access to public live audio.

### Library

- Saved audio lives on the Echoo user account.
- Playlists are MongoDB Playlist records.
- Browser `localStorage` is not the authoritative saved-audio or playlist database.

### Search

Search reads real public Echoo data only:

- audio
- creators
- stations
- public playlists

Empty search results remain empty. The frontend must not substitute demo content.

## Optional future media infrastructure

LiveKit Egress and OvenMediaEngine code may remain available for later requirements such as recording, RTMP/SRT export, HLS distribution or large passive-audience delivery.

They are **not required** for the current direct LiveKit listening path and must not block current live audio.

## Mock-data policy

Production routes and connected product screens must not substitute fake broadcasts, fake listeners, fake followers, fake creators, fake recommendations or bundled sample audio when the backend is empty or unavailable.

Use honest states such as:

- `No one is live right now.`
- `No public audio has been published yet.`
- `You are not following anyone yet.`

Design-only mock code should not be imported by production application routes.
