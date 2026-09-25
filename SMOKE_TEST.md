# Echoo end-to-end smoke test

> Before production deployment, read [HOSTING.md](HOSTING.md). The smoke test
> assumes the backend has FFmpeg + FFprobe and persistent recording storage.

Run this checklist against the exact candidate commit before production deployment or after substantial live/audio/auth changes.

## Services

Required for the current direct-listening path:

- MongoDB
- Echoo backend on port `5017` (local default)
- LiveKit
- Echoo frontend on port `5273` (local default)
- FFmpeg + FFprobe available to the backend process

OvenMediaEngine and LiveKit Egress are not required for direct LiveKit listening.

## 1. Health

1. Open `/api/health`.
2. Open `/api/health/ready` with MongoDB running and then with it unavailable in a disposable environment.
3. Open `/api/health/livekit`.
4. Open `/api/health/recording`.

Expected:

- liveness answers while the Node process is alive
- readiness is 200 only when MongoDB is connected
- LiveKit health reports its own dependency state independently
- recording health is 200 only when both FFmpeg and FFprobe are available and reports `automaticServerMp3: true` plus `trimming: true`

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
4. Pause playback intentionally for at least 10 seconds and confirm the watchdog does not auto-resume it.
5. Interrupt/recover network connectivity and test Reconnect.
6. When practical, simulate a stale inbound path where the audio element remains attached but RTP stops progressing.

Expected:

- real post-master creator program is audible
- listener cannot publish microphone/media/data
- unrelated remote audio tracks are not attached as the Echoo program
- intentional listener Pause remains paused
- stale/failed inbound RTP eventually triggers recovery instead of leaving a false "playing" silent state
- listener reconnect does not use the replay MP3, FFmpeg, or OME

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

## 9. Automatic server recording and trimming

Run a real short broadcast with `LIVEKIT_SERVER_RECORDING_ENABLED=true`.

While LIVE verify:

1. the browser is **not** continuously uploading raw recording chunks;
2. listener audio remains direct LiveKit/WebRTC;
3. server recording/FFmpeg failure does not stop listener audio;
4. creator Pause for more than 15 seconds does not trigger a false publisher recovery;
5. a short creator network interruption can recover inside the configured 90-second server grace window.

At End Broadcast verify:

1. the browser does **not** upload one giant final WAV;
2. there is no HTTP 413;
3. the backend finalizes exactly one canonical MP3 replay;
4. the replay appears in Creator Recordings;
5. refresh and play beginning/middle/end;
6. restart the backend and confirm the replay still plays;
7. create a saved-recording trim and confirm a separate trimmed copy appears;
8. confirm the original recording still exists and plays;
9. confirm the configured device copy policy (MP3/WAV/server-only) behaves correctly.

Then run a separate failure test with the server recorder intentionally unavailable and confirm the browser OPFS master is retained and only then uses bounded post-live recovery chunks.

Expected:

- canonical replay is MP3 (default `AUDIO_REPLAY_MP3_BITRATE=320k`);
- persistent local disk or configured S3-compatible storage survives restart;
- trim sends timestamps rather than a huge replacement WAV;
- FFmpeg/server-recorder failure is surfaced clearly and does not silently claim the replay was saved;
- recording failure does not become a realtime-listener failure.

## 10. Schedule Later

1. Schedule a future Broadcast from the Broadcast workspace.
2. Return to/enter the same Broadcast Studio.
3. Run preflight and start it.

Expected: scheduled and immediate flows converge on the same mixer/live lifecycle.

## 11. Protected prerecorded audio

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

## 12. Library, playback and queues

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

## 13. Downloads

1. Download a public track for offline use.
2. Remove download metadata and download it again.
3. Test browser storage eviction/recovery if practical.

Expected:

- deleted download records can be revived/recreated correctly
- expiring signed stream tokens are not treated as permanent offline identifiers

## 14. Search

Search for real creator/station/audio titles and regex-like input such as `a+b`.

Expected:

- real public data only
- literal matching where intended
- bounded input
- honest empty results
- request floods are throttled

## 15. Settings

Test profile/preferences plus password/email changes, deactivation and reactivation on disposable accounts.

Expected:

- sensitive operations require the expected credentials
- sensitive operations are throttled
- password/logout token-version changes invalidate older refresh tokens

## 16. Empty account

With an account that has no content/relationships, confirm honest empty states and zero real metrics. No bundled mock audio, fake listeners, creators, analytics or broadcasts should appear.

## 17. Deployment-only validation

Repository CI cannot prove physical audio/network capacity. Before claiming a listener target is supported, run against the deployed LiveKit/API environment:

- `/api/health/recording` check on the deployed backend
- multi-browser/device audio checks
- automatic server MP3 + trim-copy checks
- long-duration broadcast soak test
- network-loss/recovery test
- API presence burst probe
- LiveKit subscriber load test at the intended concurrency

Record the exact deployment, browser/device matrix and test result instead of inferring capacity from `maxParticipants` or CI alone.

## 18. Transcription disabled contract

Current production policy keeps transcription outside the live and recording path.

1. Set `TRANSCRIPTION_ENABLED=false`.
2. Leave any old Whisper URL/API-key values present in a disposable test environment.
3. Start and end a broadcast.
4. Confirm no live Whisper session opens.
5. Confirm no transcript-quality jobs are created.
6. Confirm End Broadcast and MP3 finalization do not wait on transcript state.
7. Confirm listener audio and server recording work normally with Whisper completely unavailable.

Expected:

- the explicit feature flag wins over stale Whisper credentials;
- transcript state remains disabled;
- no transcript network/process work adds latency or failure coupling to LiveKit, FFmpeg, recording, or End Broadcast.

If transcription is intentionally re-enabled in the future, it must remain a separate optional pipeline and must never become a prerequisite for live playback or canonical recording.
