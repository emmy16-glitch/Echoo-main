# Echoo end-to-end smoke test

Run this checklist against the exact candidate commit before production deployment or after substantial live/audio/auth changes.

## Services

Required for the current direct-listening path:

- MongoDB
- Echoo backend on port `5001` (local default)
- LiveKit
- Echoo frontend on port `5174` (local default)

OvenMediaEngine and LiveKit Egress are not required for direct LiveKit listening.

## 1. Health

1. Open `/api/health`.
2. Open `/api/health/ready` with MongoDB running and then with it unavailable in a disposable environment.
3. Open `/api/health/livekit`.

Expected:

- liveness answers while the Node process is alive
- readiness is 200 only when MongoDB is connected
- LiveKit health reports its own dependency state independently

## 2. Authentication and account state

1. Register/log in as a creator.
2. Register/log in as a listener in another browser profile/device.
3. Exercise invalid password/login attempts and verify throttling eventually returns 429.
4. Call forgot-password and confirm the route exists and returns the non-enumerating response.
5. Deactivate a disposable account, then use the dedicated Reactivate flow while its signed session is still valid.
6. Log out and verify an older copied refresh token can no longer mint a session.

Expected: no fake product data is inserted into empty UI states and inactive accounts cannot use normal authenticated product APIs.

## 3. Station single authority

1. Open Creator Studio → Stations.
2. Create one station.
3. Open Creator Studio → Broadcast.
4. Test both Go Live Now and Schedule Later setup.

Expected:

- Stations is the only station-creation UI.
- Broadcast selects an existing station.
- Scheduling creates a Broadcast record, not a second Station schedule.

## 4. Broadcast preflight and mixer

Creator:

1. Open Creator Studio → Broadcast.
2. Select the station and enter broadcast details.
3. Connect Host Mic.
4. Test Studio Clean and Voice Cleanup using appropriate input hardware.
5. Connect Guest Mic if available.
6. Share Music/System Audio if available.
7. Verify channel meters, Mute and Listen Only.
8. Verify Headphones/Monitor changes only monitoring, not Audience Output.
9. Verify Audience Output moves when the post-master mix is active.

Expected:

- Listen Only never removes other channels from the audience program
- the audience program is one post-master mix
- no raw microphone is published as a fallback

## 5. Go Live

1. Start the Broadcast.
2. Inspect LiveKit using its dashboard/CLI if available.

Expected lifecycle:

```text
scheduled/draft → starting → post-master track published → live
```

Expected LiveKit creator publication:

- track name: `echoo-studio-mix`
- audio program is stereo where supported
- DTX is disabled for the program profile
- backend does not confirm LIVE until this publication exists

## 6. Listener direct audio

Listener in a second browser/device:

1. Open the real public live broadcast.
2. If autoplay is blocked, press `Tap to hear audio`.
3. Change output device where the browser supports it.
4. Interrupt/recover network connectivity and test Reconnect.

Expected:

- real post-master creator program is audible
- listener cannot publish microphone/media/data
- unrelated remote audio tracks are not attached as the Echoo program
- reconnect does not require OME/Egress

## 7. Presence and Live Chat

1. Join from multiple authenticated listener sessions.
2. Send messages and reactions.
3. Pin/unpin/remove messages with the correct ownership/moderation roles.
4. Leave/rejoin sessions.

Expected:

- messages persist in MongoDB
- Socket.IO delivers realtime hints/events
- REST refresh recovers state if realtime delivery is unavailable
- presence/listener counts converge to LiveKit participant state without request storms

## 8. End broadcast

Creator: press End Broadcast.

Expected:

```text
live → ending → completed
```

Also verify:

- LiveKit room/publisher is cleaned up
- Station returns offline
- live listener count becomes zero
- listener UI shows ended state
- peak listener snapshot remains available for analytics

## 9. Schedule Later

1. Schedule a future Broadcast from the Broadcast workspace.
2. Return to/enter the same Broadcast Studio.
3. Run preflight and start it.

Expected: scheduled and immediate flows converge on the same mixer/live lifecycle.

## 10. Protected prerecorded audio

Creator:

1. Upload a supported audio file.
2. Upload a file with a renamed/invalid signature and confirm rejection.
3. Upload a private track.
4. Quick-play the private track from Creator Studio Home and Audio.
5. Request a protected stream URL.
6. Send `Range: bytes=10-19` to the stream URL.
7. Try direct `/uploads/audio/<stored-name>` access in a controlled test where the stored name is known.
8. Make a previously public track private and retry an old public signed stream URL.

Expected:

- protected stream returns `206 Partial Content` for valid Range requests
- seeking/pause/resume work
- direct `/uploads/audio/...` is blocked/404
- Creator owner-scoped playback works for private recordings
- an old public stream grant stops working after the track becomes private
- physical filename/fileKey is not exposed in ordinary Audio JSON

## 11. Library, playback and queues

1. Save a public track.
2. Play, pause and resume it.
3. Verify Continue Listening and History.
4. Create/reorder a playlist.
5. Exercise next/previous queue operations.
6. Make a queued/saved track private from another creator account and reload listener surfaces.

Expected:

- unauthorized private/deleted audio disappears from playback surfaces
- listener progress updates do not modify canonical Audio duration/metadata
- playlist reorder requires an exact permutation, not duplicate IDs

## 12. Downloads

1. Download a public track for offline use.
2. Remove download metadata and download it again.
3. Test browser storage eviction/recovery if practical.

Expected:

- deleted download records can be revived/recreated correctly
- expiring signed stream tokens are not treated as permanent offline identifiers

## 13. Search

Search for real creator/station/audio titles and regex-like input such as `a+b`.

Expected:

- real public data only
- literal matching where intended
- bounded input
- honest empty results
- request floods are throttled

## 14. Settings

Test profile/preferences plus password/email changes, deactivation and reactivation on disposable accounts.

Expected:

- sensitive operations require the expected credentials
- sensitive operations are throttled
- password/logout token-version changes invalidate older refresh tokens

## 15. Empty account

With an account that has no content/relationships, confirm honest empty states and zero real metrics. No bundled mock audio, fake listeners, creators, analytics or broadcasts should appear.

## 16. Deployment-only validation

Repository CI cannot prove physical audio/network capacity. Before claiming a listener target is supported, run against the deployed LiveKit/API environment:

- multi-browser/device audio checks
- long-duration broadcast soak test
- network-loss/recovery test
- API presence burst probe
- LiveKit subscriber load test at the intended concurrency

Record the exact deployment, browser/device matrix and test result instead of inferring capacity from `maxParticipants` or CI alone.

## 17. Continuous transcript quality pipeline

1. Start a broadcast with a creator account and verify the browser records the post-master mix.
2. Confirm the backend receives authenticated `POST /api/broadcasts/:broadcastId/recording-chunks/start` before the first live chunk.
3. Speak continuously for at least 30 seconds and verify 10-second WAV chunks are uploaded while the broadcast remains live.
4. Confirm each chunk creates one `BroadcastAudioChunk` and one `BroadcastProcessingJob` with `jobType=transcript_quality_chunk`.
5. Confirm the quality worker starts before the broadcast ends and uses the Whisper quality pass.
6. End the broadcast and verify the browser calls the chunk completion endpoint after its final chunk.
7. Confirm only queued or incomplete chunks are processed after the end event; already completed quality jobs are not duplicated.
8. Confirm the transcript remains private during live audio and becomes `ready_for_review` only after quality jobs, live Whisper flush, and final reconciliation complete.
9. Confirm a creator notification is generated, creator edits preserve `originalText`, `editedText`, `qualityHistory`, and revision metadata, and publishing still uses the existing replay/transcript flow.
10. Confirm listeners see no live transcript events and can search the final transcript only on the published replay.

Expected failure behavior: provider downtime, backend restart, worker crash, or network interruption retries queued chunks without duplicating completed chunks. An unrecovered browser chunk upload prevents the transcript from being marked reviewable and is surfaced as processing failure rather than silently publishing an incomplete quality pass.
