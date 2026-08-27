# Parakeet + Gemini integration audit

## Existing ECHOO path retained

The existing creator runtime already converged source audio through the Web Audio mixer into the `echoo-studio-mix` MediaStreamTrack. `livekitPublisher.js` publishes that track to LiveKit, `broadcastRecordingService` records the same post-master program, and the previous Whisper client cloned that track into an AudioWorklet that produced 16 kHz mono PCM. This made the post-master track the correct place for a provider-independent STT tap.

Existing backend infrastructure already provided:

- `TranscriptSession` for live session lifecycle and recovery offsets.
- `TranscriptSegment` for canonical partial/final text, original text, revisions and publication state.
- authenticated creator transcript routes.
- Socket.IO creator-only transcript events.
- `BroadcastAudioChunk` + `BroadcastProcessingJob` durable quality processing.
- `transcriptQualityService` reconciliation that protects creator corrections and uses quality chunk idempotency markers.
- existing Whisper Flow live and quality implementations.

## Coupling changed

Before this feature `livekitPublisher.js` called `startWhisperFlowTranscription` directly. It now calls a provider orchestrator after the LiveKit program track has published. The orchestrator selects Browser Parakeet, optional Gemini Live, then existing Whisper.

Browser providers cannot use the old Whisper `/sessions` endpoint because that endpoint represents a gateway-backed Whisper session. Dedicated provider-session routes now create/close Parakeet/Gemini sessions without pretending a Whisper websocket exists.

Canonical segment persistence now verifies that the segment's provider matches its server-created session. This prevents a browser from arbitrarily changing provider identity while retaining the existing transcript database.

## Audio format

The new shared transcription tap receives the same post-master `MediaStreamTrack`, clones it, downmixes channels and resamples from the browser AudioContext sample rate to 16 kHz mono Float32. Gemini converts that copy to PCM16 for its realtime API. Parakeet consumes Float32 at 16 kHz.

## Quality lifecycle

The existing browser recording/quality chunk lifecycle was retained. Gemini quality is selected only when enabled. A Gemini failure can fall back to the existing Whisper quality provider, and a rejected candidate preserves an already available raw live transcript rather than destroying or blocking it.

## Risks requiring real-device/service verification

- WebGPU support/performance varies by browser/GPU/driver.
- Actual Parakeet first-load bytes depend on selected model artifacts/quantization and must be measured in a clean browser profile.
- Gemini availability/quota and Transcribe Live behavior require an actual server-side API key for end-to-end verification.
- Long broadcasts should be exercised with shortened development rotation timing before production rollout.
