# Echoo Continuous Transcript Quality Pipeline

## Implementation status

The continuous transcript-quality pipeline is implemented on the current `fix/echoo-main-architecture` branch. It extends the existing post-master recording, `BroadcastProcessingJob`, Whisper Flow, `TranscriptSegment`, creator processing, and notification paths. It does not introduce a second queue or a second transcript store.

## Runtime flow

During a live broadcast, the browser continues to capture the same post-limiter Echoo master bus used by the lossless replay recording. It emits authenticated ten-second 24-bit WAV chunks to `POST /api/broadcasts/:broadcastId/recording-chunks`. The server persists each chunk as `BroadcastAudioChunk` and creates one unique `BroadcastProcessingJob` with `jobType=transcript_quality_chunk`.

The existing processing worker claims those jobs, converts WAV to mono 16 kHz PCM, and sends the chunk through the existing Whisper Flow WebSocket protocol with `qualityPass=true`. Whisper can use `WHISPER_QUALITY_MODEL` when configured, or the normal configured model in quality decoding mode. Quality results are reconciled into the canonical `TranscriptSegment` model.

Reconciliation is idempotent by chunk and segment index. It preserves `originalText`, `editedText`, `qualityHistory`, `revision`, `revisionNumber`, `confidence`, `processedBy`, and `processedAt`. Creator-edited text is not replaced by a later automated quality pass. Completed chunk files are removed after durable processing, while failed chunks retain retry/error state.

When the broadcast ends, the browser closes the chunk window through `POST /api/broadcasts/:broadcastId/recording-chunks/complete`. Transcript completion waits for the browser closure marker, all quality chunk jobs, the live Whisper flush, and confirmed final transcript segments. Only then does the existing creator notification and `ready_for_review` transition occur. Existing review, edit, replay publication, and listener replay transcript routes remain the canonical user-facing flow.

There is intentionally no new live transcript panel. Live draft transcript events remain creator-side infrastructure only; listeners see the final transcript on the published replay.

## Main changes

| Area | Change |
|---|---|
| Browser recording | Reuses the post-master PCM capture and uploads authenticated ten-second WAV quality chunks with retries. |
| API | Adds start, chunk, and completion endpoints under the canonical broadcast router. |
| Persistence | Adds `BroadcastAudioChunk` and chunk-scoped job identity. |
| Worker | Adds `transcript_quality_chunk` processing, restart recovery, retry handling, and finalization gating. |
| Reconciliation | Adds quality history, creator-edit protection, confidence, provenance, and idempotent chunk segment identity. |
| Whisper Flow | Adds optional quality model selection and stronger quality decoding settings. |
| Configuration | Documents `WHISPER_QUALITY_FLOW_URL`, `WHISPER_QUALITY_FLOW_API_KEY`, and `WHISPER_QUALITY_MODEL`. |
| Documentation/tests | Updates architecture and smoke-test documentation and adds quality-pipeline regression tests. |

## Validation

The following checks passed after implementation:

| Check | Result |
|---|---:|
| `git diff --check` | Passed |
| Architecture guard | Passed |
| Runtime architecture guard | Passed |
| Backend tests | 112 passed, 0 failed, 0 skipped |
| Frontend lint | Passed with 0 errors and 0 warnings |
| Frontend production build | Passed |
| Whisper Python syntax compilation | Passed |

A real audio-quality run still requires the deployment environment to provide MongoDB, LiveKit, microphone/audio capture, and an authenticated Whisper Flow endpoint. Those external services are not available in the sandbox, so this implementation has been validated through source-level contracts, backend regression tests, frontend build/lint, and Whisper syntax checks rather than a real two-browser broadcast.

## Deployment prerequisites

Configure a real `MONGODB_URI`, JWT secrets, LiveKit credentials, `WHISPER_FLOW_URL`, and `WHISPER_FLOW_API_KEY`. For a separate high-quality provider, add `WHISPER_QUALITY_FLOW_URL`, `WHISPER_QUALITY_FLOW_API_KEY`, and `WHISPER_QUALITY_MODEL`. Production Whisper URLs must use `wss://`. Restart the backend after changing environment variables.
