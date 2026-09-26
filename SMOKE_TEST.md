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

OvenMediaEngine is not required for direct LiveKit listening. LiveKit Egress is also not part of the listener delivery path, but it **is required for the primary production server-recording path** when `LIVEKIT_SERVER_RECORDING_ENABLED=true`. LiveKit Cloud provides Egress; a self-hosted LiveKit deployment must run the Egress service separately.

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
- pause the creator program for >15 seconds and confirm the publisher watchdog does not reconnect it
- resume and confirm bytes/packets progress again without a duplicate program publication

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

## 9. Automatic server recording and trimming

Run a real short broadcast with `LIVEKIT_SERVER_RECORDING_ENABLED=true`.

While LIVE verify:

1. the browser does **not** continuously upload raw recording chunks;
2. pause the creator for >15 seconds and confirm no false publisher recovery;
3. interrupt creator networking for 20–40 seconds and confirm automatic recovery continues instead of permanently failing after the first short retry sequence;
4. force a creator republish/new track SID and confirm the server recorder hands off without creating a second MP3 or accepting a partial file;
5. confirm a stale old `track_unpublished` webhook cannot clear the newer program SID.

At End Broadcast verify:

1. the browser does **not** upload one giant final WAV;
2. there is no HTTP 413;
3. the browser recovery WAV stops at off-air rather than after backend cleanup latency;
4. the backend finalizes exactly one canonical MP3 replay;
5. the replay appears in Creator Recordings;
6. refresh and play beginning/middle/end;
7. restart the backend and confirm the replay still plays;
8. create a saved-recording trim and confirm a separate trimmed copy appears;
9. confirm the original recording still exists and plays;
10. confirm the configured device copy policy (MP3/WAV/server-only) behaves correctly;
11. block or stop the Echoo API immediately after OFF AIR and confirm **Save MP3 to device** and **Save WAV to device** remain usable without waiting for the server;
12. verify the local MP3 is a real playable `audio/mpeg` file encoded from the local WAV, not renamed WAV bytes and not a server download;
13. on a phone, verify WAV opens the native share/save path immediately; for a long MP3, if encoding outlives the original tap, confirm the UI changes to **MP3 ready · Tap to save** and the second tap opens the native share/save path without re-encoding;
14. on a browser without a verified picker/share result, confirm a started download is labelled as unverified and the OPFS master is retained;
15. deliberately fail/cancel a device copy and confirm the OPFS master is retained;
16. restore the API and choose **Retry Echoo server save**; confirm this retry does not create a second device download and only clears OPFS after both server durability and the chosen device policy are satisfied.

Expected:

- canonical replay is MP3 (default `AUDIO_REPLAY_MP3_BITRATE=320k`);
- persistent local disk or configured S3-compatible storage survives restart;
- trim sends timestamps rather than a huge replacement WAV;
- FFmpeg failure is surfaced clearly and does not silently claim the replay was saved.

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

## 18. Transcription-disabled recording isolation

Echoo production currently keeps transcription disabled by default.

1. Set `TRANSCRIPTION_ENABLED=false`.
2. Start a broadcast and speak continuously for at least 30 seconds.
3. Confirm the creator publishes only the LiveKit program track and writes the
   recovery WAV to OPFS locally.
4. Confirm there are **no live 10-second browser PCM/WAV uploads** competing
   with WebRTC during a healthy show.
5. Confirm there is no Whisper WebSocket session and no transcript-quality job
   creation while the flag is off.
6. End the broadcast.
7. If LiveKit server recording succeeded, confirm no browser recovery chunks
   are uploaded at all.
8. Deliberately fail the server recorder in a separate recovery test. Only
   after OFF AIR, confirm Echoo may read the completed OPFS WAV in bounded
   chunks to repair the server copy.
9. Confirm local Save MP3 / Save WAV remains available even if that server
   recovery fails.
10. Confirm `transcriptState` remains `disabled` and neither End Broadcast
    nor MP3 finalization waits on transcription.

Expected: transcription has zero latency impact on realtime audio and recording
when disabled. Browser PCM upload is a post-live emergency recovery mechanism,
never part of the healthy live transport.
