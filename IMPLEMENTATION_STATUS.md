# Echoo implementation status

Working branch: `integration/echoo-core-cleanup`

This branch is intentionally kept separate from `main` until frontend build, backend syntax checks and the end-to-end LiveKit smoke test are green.

## Implemented on this branch

### One station creation flow

- Creator Studio → Stations is the only intended station creation UI.
- Live selects an existing station.
- Schedule selects an existing station.
- Station API no longer exposes manual live toggles or a second scheduling authority.
- Station runtime state is controlled by Broadcast + LiveKit presence.

### One broadcast lifecycle

- Broadcast is the scheduling source of truth.
- Removed the separate backend Schedule route/controller.
- Removed the duplicate listener LiveKit token route.
- Generic Broadcast metadata updates cannot put a Broadcast into `live` state.
- Explicit lifecycle: start → LiveKit publisher connection → confirm-live → end/cancel.

### Creator flows

- Go Live Now uses real Broadcast records.
- Schedule Later creates real scheduled Broadcast records.
- Schedule → Enter Studio converges on the same Live workspace.
- Microphone test remains local until the creator starts.
- Creator microphone publishes directly to LiveKit.

### Listener live experience

- Real public live discovery only.
- Receive-only authenticated listener LiveKit token.
- Direct LiveKit audio player.
- Real Live Chat persistence.
- Socket.IO realtime room updates with REST recovery fallback.
- Real listener/peak presence synchronization.

### Social

- Correct creator Follow relationship.
- Separate StationFollow relationship.
- Real Following frontend.
- Real Station follow UI.
- Real Creator profile frontend.

### Listener product data

- Removed listener mock service and mock media service.
- Removed old mock Live experience.
- Removed bundled sample audio/mock broadcast images.
- Listener Home uses real broadcasts/audio/creators/stations.
- Search uses real audio/creators/stations/public playlists.
- Library saved audio is backend-authoritative.
- Playlists are backend-authoritative and can receive saved tracks.
- Notifications have a real frontend.
- Listener Settings has a real frontend.

### Creator data

- Creator dashboard backend metrics no longer contain hardcoded fake audience/play/follower numbers.
- Upcoming scheduled Broadcasts come from the real Broadcast collection.
- Audience metrics use Follow/Broadcast data.
- Analytics stores completed-broadcast listener snapshots.
- Creator Settings account/profile/security controls use the real Settings API.

### Uploads

- `/uploads` is served by the backend.
- Creator audio uploads now reject unsupported non-audio files.
- Audio genre enum matches the frontend creator categories used by upload/recommendations.

### Repository quality

- Added `ARCHITECTURE.md`.
- Added `SMOKE_TEST.md`.
- Added frontend/backend CI workflow.
- Added an architecture guard to detect duplicate production implementations.

## Preserved for later, not required by the MVP

- LiveKit Egress support
- OvenMediaEngine provider/integration code

These remain optional future recording/distribution infrastructure. They do not block direct LiveKit listening.

## Required before merge

1. Run frontend install/lint/build on this exact branch.
2. Run backend syntax/import checks on this exact branch.
3. Run the end-to-end two-browser test in `SMOKE_TEST.md`:
   creator mic → LiveKit → listener audio.
4. Verify scheduled Broadcast → Enter Studio → Go Live.
5. Verify chat realtime and fallback.
6. Verify one station creation UI only.
7. Verify there are no runtime imports of removed mock services/assets.
8. Fix any check or runtime issue before changing the PR from draft to ready.
