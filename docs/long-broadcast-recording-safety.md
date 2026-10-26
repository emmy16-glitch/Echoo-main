# Long broadcast recording safety

Echoo's live audio transport and recording recovery are separate. Recording errors must never terminate a healthy LiveKit room or listener audio.

## Safeguards

- **Browser:** Echoo stores a creator-owned recovery master in origin-private file storage (OPFS) and checkpoints every 15 seconds where supported. The browser capacity-planning window is 12 hours (not a live-broadcast duration limit), subject to actual disk quota and operating-system/browser conditions. An active creator gets a browser navigation warning before refresh; refresh nonetheless stops the browser's microphone/LiveKit publisher.
- **Reload:** Returning to authenticated Creator Studio rechecks pending protected recordings. A recovery or failed upload is visible on Broadcast and Content; server retries never delete the OPFS recovery master before a confirmed saved replay.
- **Backend:** The server continuously writes MP3 from LiveKit Track Egress. A failed/aborted encoder now moves a nontrivial MP3 fragment to a private, uniquely named `*.interrupted-*.mp3`, instead of deleting it. The Broadcast document records `serverRecording.partialAvailable` and `partialBytes`. **These fragments are not complete verified replays and must not be published automatically.** 
- **Finalization:** The server allows up to 30s for the write backlog and 60s for FFmpeg closure. It does not pause or block listener streaming.

## Hosting must-haves

1. Ensure the backend `REPLAY_ARCHIVE_DIR` directory and its surrounding disk survive deploys and restarts. The default is `backend/uploads/replay` resolved from process working directory. Use a dedicated persistent disk, not a temporary container filesystem.
2. Size server and browser storage for the target duration; roughly 320 kbps MP3 is ~1.4 GB per 10 hours excluding overhead. A 48 kHz, 24-bit stereo WAV safety master is ~10.4 GB per 10 hours plus headroom.
3. Back up the server replay archive outside the machine and monitor free disk space, FFmpeg health, LiveKit Egress status, and Broadcast error metadata. Automatically alert operators when `partialAvailable` is true. Server-fragment retention is not an offsite backup.
4. Never clear browser site storage, log into a different creator account to attempt recovery, or reinstall the browser/app until the recovery master has been verified and saved.
5. To investigate a failed encoder, locate the private `*.interrupted-*.mp3` file by broadcast ID, verify it with ffprobe/ffmpeg, copy it to safe storage and assess missing duration before any manual restoration. Do not replace the canonical replay file with an unverified fragment.
6. Run a complete 10-hour rehearsal with network interruptions, app refresh/restart, backend restart, full disk, and post-live MP3 checks. Validate audio continuity and compare recorded duration to live duration before claiming long-session reliability.

## Multi-day and multi-week recording requirements

The browser safety recording plans for 12 hours of capacity and chooses a compressed backup if lossless storage is inadequate. This does **not** bypass LiveKit Cloud's **12-hour raw Track Egress limit**. True multi-day or multi-week reliability requires rotating Egress sessions before 12 hours without touching the creator's live publisher; completing and durably storing independently recoverable recording segments; and verifying gaps and durations when assembling the final recording. A week-long recording is **not yet end-to-end verified** by this safety patch. Server disk must have permanent storage, alerting and backups.

## Explicit limitations

No web app can keep a creator's microphone publishing uninterrupted after that browser tab refreshes, crashes, loses OS microphone permission, or the device powers off. The correct long-term answer for publisher continuity is independent ingest and redundant audio capture, not a promise of zero failures. This change protects previously captured audio and enables recovery; a future milestone can introduce durable multi-segment server recording and automatic stitching/verification. 
