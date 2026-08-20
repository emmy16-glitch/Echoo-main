# Echoo implementation status

This document describes the current repository architecture. `main` is the integration source of truth; feature/audit branches are merged only after Echoo checks and the architecture guard are green.

## Creator Studio

- One Creator Studio shell with Home, Stations, Broadcast, Audio, Audience, Analytics and Settings workspaces.
- Stations is the only station-creation authority.
- Broadcast owns both Go Live Now and Schedule Later flows.
- Scheduled and immediate broadcasts converge on the same Broadcast Studio.
- The live Broadcast Studio contains the full mixer, live status/control surface and Live Chat.

## Live audio

Current production media path:

```text
Host Mic + Guest Mic + Music/System
                ↓
          Web Audio mixer
                ↓
        post-master program
        `echoo-studio-mix`
                ↓
             LiveKit
                ↓
      receive-only listeners
```

Implemented protections include:

- mixer output is mandatory; no silent raw-microphone fallback
- backend confirm-live waits for the actual named program publication
- stereo program publishing with DTX disabled and a 256 kbps maximum Opus bitrate target
- Studio Clean / Voice Cleanup microphone profiles
- preferred 48 kHz capture/context where the browser/device supports it
- creator reconnect handling without intentionally stopping the externally owned mixer track
- listener attaches only to the Echoo program publication
- local post-master recording with disk-backed lossless capture when supported and a truthful high-quality fallback otherwise

LiveKit remains the only required live media distribution layer. OME is not enabled in the current path.

## Broadcast lifecycle and presence

- Broadcast is the single schedule/lifecycle model.
- Explicit lifecycle endpoints own start, confirm-live, end and cancel.
- One active live/start lease per creator is enforced with MongoDB-backed coordination.
- Presence reads are cached/coalesced to avoid request storms.
- Broadcast and Station listener counters are synchronized from LiveKit presence.

## Realtime

- Chat persistence is MongoDB/REST.
- Socket.IO delivers realtime chat/status/presence-change events.
- REST remains recovery fallback.
- Socket authentication refreshes with the HTTP session when access tokens rotate.
- Current Socket.IO deployment is process-local; horizontal scale still requires a shared adapter/state layer.

## Prerecorded audio

- Audio uploads are validated by extension, MIME intent and file signature.
- Physical filenames are randomized and not exposed in normal API JSON.
- `/uploads/audio/...` is blocked.
- Protected playback uses scoped `/api/audio/:id/stream` URLs with HTTP Range support.
- Stream authorization is rechecked against current visibility on every request.
- Creator Studio can obtain owner-scoped playback URLs for private recordings.
- Explicit downloads are authenticated.
- Offline browser metadata does not persist expiring signed playback tokens.
- Current storage is local disk; private object storage/CDN remains a future production-scale migration.

## Authentication and account controls

- Access and refresh JWTs are separate token types.
- JWT verification pins the configured signing algorithm.
- Logout and password changes invalidate older refresh tokens using `refreshTokenVersion`.
- Auth, refresh, search, sensitive account actions and audio uploads have endpoint-specific request throttles.
- Normal product routes reject inactive accounts.
- The dedicated account-reactivation path can identify an inactive account through a valid signed session.
- Forgot-password API routing exists; outbound reset-email delivery/token workflow is still a product integration item.

## Listener/library data integrity

- Saved audio and playlists are backend-authoritative.
- Playback state, history, queues and downloads re-evaluate audio visibility so deleted/private tracks do not remain usable by unauthorized listeners.
- Listener playback progress cannot rewrite canonical creator-owned Audio duration metadata.
- Queue, playlist ordering and download-revival edge cases have regression coverage.

## Search and analytics honesty

- Search uses real public Echoo data only.
- Regex-like input is bounded/escaped where literal public matching is intended.
- Unsupported demographics/trends remain unavailable instead of being fabricated.
- Creator follower totals are counted independently from the bounded follower sample returned to the UI.

## Health and validation

- `/api/health` — process liveness
- `/api/health/ready` — MongoDB readiness
- `/api/health/livekit` — LiveKit connectivity
- GitHub Actions runs frontend lint/build, backend syntax/invariant tests and mobile lint/typecheck.
- A separate architecture check guards critical single-authority/media invariants.

## Known scale/deployment work that is not falsely marked complete

- real multi-browser/device LiveKit soak/load tests must be run against the deployed environment
- multi-instance Socket.IO requires a shared adapter/store
- rate-limit enforcement is process-local until a shared store is configured
- prerecorded media should move from local disk to private object storage/CDN for mature production scale
- account hard-delete/cascade policy should be deliberately designed before using hard deletion as a production data-retention workflow

LiveKit Egress and OvenMediaEngine remain optional future infrastructure and do not block the current direct LiveKit path.
