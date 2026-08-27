# ECHOO transcription architecture

## Non-negotiable media path

Transcription is never in the listener audio path.

```text
Host / guests / music / screen
          |
          v
ECHOO Web Audio Mixer
          |
          v
post-master echoo-studio-mix
      |          |             |
      v          v             v
   LiveKit    recording   transcription tap
      |                        |
      v                        v
  listeners             16 kHz mono PCM
                              |
                    Transcription Orchestrator
                      |       |        |
                      v       v        v
                  Parakeet  Gemini   Whisper
```

A failure in Parakeet, Gemini, Whisper, MongoDB transcript persistence or transcript processing must not tear down the published LiveKit track.

## Live provider policy

1. Browser Parakeet (`parakeet-tdt-0.6b-v3`) is attempted first.
2. If local inference is unsupported, fails to initialize or becomes unavailable, feature-flagged Gemini Transcribe Live is attempted.
3. Existing Whisper Flow is retained as the last live fallback when configured.
4. If all providers fail, ECHOO reports transcription unavailable and leaves the broadcast running.

Parakeet and Gemini browser sessions use the existing `TranscriptSession`/`TranscriptSegment` database. They do not create another transcript store. The server creates provider-bound sessions and rejects a segment whose claimed provider does not match that session.

## Post-broadcast quality

The existing durable `BroadcastAudioChunk` and `BroadcastProcessingJob` pipeline remains authoritative. When Gemini quality is enabled, a durable WAV chunk is sent to `gemini-3.5-transcribe` through the Interactions API. The result is validated before reconciliation. Rejected Gemini candidates preserve the live/raw transcript. If Gemini fails and Whisper quality is configured, the existing Whisper quality path is used. Creator-edited segments are never overwritten by automated quality processing.

## Source locations

- LiveKit publisher: `frontend/src/services/livekitPublisher.js`
- Orchestrator: `frontend/src/services/transcription/orchestrator.js`
- Post-master STT tap: `frontend/src/services/transcription/audioTap.js`
- Parakeet provider/worker: `frontend/src/services/transcription/BrowserParakeetProvider.js`, `frontend/src/workers/parakeet.worker.js`
- Gemini Live provider: `frontend/src/services/transcription/GeminiLiveProvider.js`
- Provider-session API: `backend/src/controllers/transcriptionProviderController.js`
- Canonical persistence: `backend/src/services/transcriptPersistenceService.js`
- Durable quality processing: `backend/src/services/transcriptQualityService.js`
