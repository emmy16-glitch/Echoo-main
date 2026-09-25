# Echoo audio architecture

Echoo has one canonical browser Master Output: the Web Audio mixer combines Host,
Guest 1 (`channel2` internally), Guest 2 (`guest` internally), media and tab audio
at the browser's actual `AudioContext.sampleRate` (requested at 48 kHz). A
conservative -1 dBFS peak-protection AudioWorklet feeds the stereo program output,
meters, monitor, LiveKit and a separate PCM capture tap. The faders, source labels
and monitor-only solo routing remain shared by all outputs.

## Realtime

The `livekit-client` dependency is 2.21.x. Its `TrackPublishOptions` supports
`audioPreset.maxBitrate`, `forceStereo`, `dtx`, and `red`, so Echoo publishes the
single master as stereo Opus with these explicit profiles:

| Profile | Requested max bitrate | Stereo | DTX | RED |
| --- | ---: | --- | --- | --- |
| Broadcast High | 256,000 bps | yes | off | on |
| Studio | 384,000 bps | yes | off | on |
| Studio Max | 510,000 bps | yes | off | off |

All three profiles request a 48 kHz stereo master. Broadcast High is the default.
510 kbps is supported by the
installed SDK publishing API; it remains a target, not a claimed negotiated rate.
Changing this creator preference applies to the next publication/broadcast; Echoo
does not fake a hot quality switch for an already-published track.
`refreshLiveKitPublishingDiagnostics()` obtains current outbound sender stats
(bitrate, packets, loss, RTT and jitter where supplied by the browser). Verify
codec/channel count and actual bitrate in the browser's outbound WebRTC stats.

Raw Audio disables browser echo cancellation, noise suppression and AGC for source
capture, and requests stereo where a professional source supports it; Enhanced Audio
preserves Echoo's existing voice path. The Master Output is
always marked program/music audio and is not passed through speech processing.

Listener playback attaches only the named `echoo-studio-mix` LiveKit publication
to a native HTML audio element. A read-only analyser may observe the remote
`MediaStreamTrack` for UI metering, but playback is not routed through that
`AudioContext`; Echoo does not downmix to mono, apply speech enhancement, or
switch to the radio MP3 URL. WebRTC/LiveKit
therefore chooses the highest stereo Opus quality that the listener's negotiated
connection can sustain; listener volume/mute are native element controls only.

Both sides use explicit recovery state machines. A creator transport watchdog
checks outbound byte/packet progress and, after a sustained stall, replaces the
LiveKit room and republishes the same mixer track with a fresh token. This does
not create a new broadcast or recorder. A listener validates the canonical
publication, current track, DOM attachment, and actual media-element playback;
stale attachments are detached and rebuilt. Recovery retries are bounded at
0/1/2/4/8 seconds plus jitter and can be cancelled by broadcast end/unmount.

## Local recording durability and replay save

Echoo has two complementary recording durability paths.

### Browser recovery master

The preferred browser recorder writes 48 kHz stereo 24-bit PCM directly to
OPFS. It does not retain a long recording in JavaScript memory. Every 15 seconds
the writer checkpoints a valid WAV header and persists a recovery manifest.

This OPFS WAV is a **local recovery/lossless-export master**. It is not the
normal server replay upload.

On reload/crash recovery, Echoo can reopen the checkpointed file. The local
master remains available until the canonical server replay is confirmed safe or
the creator explicitly discards it.

### Canonical server replay

The creator publishes the protected master bus to LiveKit once. On a
recording-capable long-lived backend, LiveKit Track Egress sends that published
program track as raw PCM to Echoo's signed recording WebSocket. Backend FFmpeg
encodes the canonical MP3 while listeners continue receiving the normal LiveKit
Opus stream.

The browser keeps a lossless OPFS master only for recovery. It uploads bounded
PCM/WAV chunks after the show only if the primary server recorder failed.

At End Broadcast:

1. the browser flushes pending recording chunks;
2. the backend verifies chunk/finalization state;
3. FFmpeg finalizes the canonical MP3 replay (default
   `AUDIO_REPLAY_MP3_BITRATE=320k`);
4. exactly one replay Audio record is linked idempotently to the broadcast;
5. the MP3 remains on persistent local storage or is archived to configured
   S3-compatible storage;
6. only after canonical persistence is confirmed may the browser recovery master
   be cleared.

The source broadcast ID/replay file key is the idempotency boundary. Retrying
completion must return/reconcile the existing replay rather than create a second
recording.

**FFmpeg and FFprobe are mandatory for this production recording path.** The
backend exposes `GET /api/health/recording`; a recording-capable deployment must
return HTTP 200 with `automaticServerMp3: true` and `trimming: true`.

A huge final WAV POST at End Broadcast is an architecture regression. Do not
solve it by increasing proxy/body limits.

## Saved recording trims

Saved recordings are trimmed on the backend and trimming is non-destructive.

The browser sends only `startSeconds` and `endSeconds`. The backend obtains
the already-saved source recording (local disk or configured object storage),
runs FFmpeg, validates the output, and creates a **separate private trimmed Audio
record**. The original remains unchanged.

For MP3 source recordings, Echoo uses FFmpeg stream copy where possible instead
of another lossy MP3 re-encode. This keeps trimming fast and avoids unnecessary
quality loss.

Invalid ranges, missing FFmpeg/FFprobe, object-storage read failures, or trim
errors leave the original untouched. The browser never creates and uploads a
large replacement WAV merely to trim a saved replay.


## Limiter and master metering

The normal master protection is an AudioWorklet, not a `DynamicsCompressorNode`.
It uses about 5 ms lookahead, linked sample-peak detection, a -1 dBFS ceiling, gain
hold, and a 120 ms release. The fallback is a conservative `DynamicsCompressorNode`
(-1 dB threshold, 20:1 ratio, 3 ms attack, 180 ms release) when AudioWorklet is
unavailable. Neither path claims oversampled inter-sample/true-peak protection; a
dedicated true-peak limiter requires follow-up evaluation. The real master meter
observes the protected final master.

## Secondary outputs

The AudioWorklet tap is pre-Opus: it receives interleaved float PCM from the same
post-master bus before the WebRTC encoder. It converts to 24-bit PCM and posts
bounded 10-second authenticated WAV chunks to the backend. The backend validates
each WAV as 48 kHz, stereo, 24-bit PCM and can feed two independent FFmpeg stdin
processes:

```
Master PCM -> Opus / LiveKit (realtime)
           -> libmp3lame 320k CBR -> Icecast-compatible source (optional)
           -> FLAC level 5, 24-bit -> private archive storage (optional)
```

The MP3 and FLAC encoders never use decoded Opus or MP3 as input. Therefore a
completed FLAC generated by this configured path is `pre_opus_pcm` and is a
Lossless Master Capture of the Web Audio program bus. It does **not** prove the hardware
source was itself 24-bit. If AudioWorklet/OPFS capture is unavailable, Echoo falls
back to a local Opus recording marked `opus-fallback`; it is never called lossless.

Enable `MASTER_ARCHIVE_ENABLED=true` and set `MASTER_ARCHIVE_DIR` to a private,
persisted backend volume. The backend already requires FFmpeg + FFprobe for
canonical replay MP3 and trimming; use `FFMPEG_PATH` / `FFPROBE_PATH` only
when the binaries are not on PATH. Enable radio only with all `RADIO_STREAM_*`
settings present; `RADIO_PUBLIC_BASE_URL`
is optional and contains no secret. Archive files are not written under `/uploads`
and are not made public by this integration.

Radio/archive failures update their independent optional-output status and do not
stop LiveKit. On normal completion the browser flushes PCM before the lifecycle
endpoint stops the encoders; backend lifecycle and LiveKit-disconnect paths provide
an additional cleanup safety net. The raw PCM branch costs about 2.304 Mbps at
48 kHz/stereo/24-bit in addition to WebRTC, so deploy it only on an upload path that
can sustain it.

## Future work (not implemented)

Evaluate chunked browser-side FLAC capture with low-priority/resumable uploads only
after CPU, thermal, memory, and battery benchmarking. A possible design is Master
 PCM to FLAC chunks, bounded persistent local storage, then periodic resumable upload
to the backend. It needs crash recovery, capability detection, and must
never destabilize realtime audio; WASM FLAC is not production architecture today.

For large passive audiences, a future master branch may use AAC/HLS/CDN while
WebRTC/Opus remains the low-latency interactive path. Standard HLS has materially
higher latency; LL-HLS is a separate project. Listener Data Saver and per-listener
codec tiers are future work, not part of this implementation.

## Manual verification

1. Select Raw Audio for an interface/console or Enhanced Audio for a laptop mic;
   confirm the input device labels and real analyser meters still change.
2. Test Broadcast High (256 kbps, RED on), Studio (384 kbps, RED on), and Studio
   Max (510 kbps, RED off). For each, inspect `outbound-rtp` stats:
   codec must be Opus, channels stereo when supported, and bitrate is an observed
   value rather than an assumed profile value.
3. Before any recording test, call `GET /api/health/recording` and confirm
   FFmpeg + FFprobe are available. End a short broadcast and confirm exactly one
   canonical MP3 replay is created and remains playable after refresh. If the
   optional master archive is enabled, also inspect the private FLAC with
   `ffprobe`; it should report 48 kHz, two channels and 24-bit.
4. With Icecast configured, open only the external radio URL in a separate player;
   Listener UI continues using LiveKit and must not play both paths.
5. Stop Icecast and confirm the optional radio branch can fail without stopping
   creator/listener LiveKit audio. Separately, make FFmpeg unavailable in a test
   environment and confirm `/api/health/recording` returns 503 and Echoo clearly
   reports server recording/trimming unavailable instead of pretending the MP3
   will be saved.
6. During a live session, disable networking for 5–15 seconds. Confirm creator
   state moves through reconnecting/recovering, the same broadcast resumes, and
   the recording start timestamp does not change. Confirm listeners return to
   `playing` without duplicate `<audio>` elements.
7. Leave a recording active for at least 20 seconds, then simulate a page crash.
   Reload and confirm the OPFS recovery master reopens from the last committed
   checkpoint. Retry server replay completion after dropping one response and
   confirm only one replay exists for the broadcast.
8. Trim a saved replay and inspect the new trimmed copy. Confirm the original is
   unchanged. Repeat with an invalid range and with FFmpeg unavailable; in both
   failures, confirm the original stored file still plays and no giant browser
   WAV upload occurs.
