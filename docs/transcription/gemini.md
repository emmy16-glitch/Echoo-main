# Gemini transcription providers

Gemini is optional. ECHOO does not require it for the listener audio path and does not expose the permanent Gemini key to frontend code.

## Gemini Live fallback

Backend environment:

```env
GEMINI_API_KEY=
GEMINI_LIVE_ENABLED=false
GEMINI_LIVE_MODEL=gemini-3.5-transcribe-live
GEMINI_LIVE_ROTATE_SECONDS=560
GEMINI_LIVE_OVERLAP_SECONDS=5
```

The authenticated creator requests a token from ECHOO. The backend verifies that the user owns an active/ending broadcast and mints a one-use Gemini Live token with `@google/genai` using the `v1alpha` ephemeral-token API. The browser receives only the ephemeral token and connects directly to Gemini Live.

The same 16 kHz post-master transcription copy used by local STT is converted to 16-bit PCM and sent with MIME type `audio/pcm;rate=16000`.

### Rotation

ECHOO does not wait for a provider hard-close. Around 560 seconds it requests a fresh token, opens a successor session, confirms it is open, replays a bounded recent overlap, switches new input to the successor, and closes the predecessor after the overlap period. Rotation schedules again for every successor. Text around the boundary uses conservative multi-word deduplication; a single matching word is never enough to delete transcript content.

If successor creation fails, the old session is retained and ECHOO retries before the hard service limit. If Gemini becomes unavailable, the orchestrator can fall back to Whisper when configured. LiveKit is unaffected.

## Gemini post-broadcast quality

```env
GEMINI_QUALITY_ENABLED=false
GEMINI_TRANSCRIBE_MODEL=gemini-3.5-transcribe
```

Quality processing uses the existing durable ECHOO recording chunks and `@google/genai` Interactions API (`v1beta`). Audio is supplied as an audio content block and optional transcription configuration uses the SDK's current `transcription_config`/`custom_vocabulary` contract.

A Gemini result is a candidate, not unquestioned truth. `originalText` is retained and the provider-independent validation gate rejects empty, extreme, repetitive, malformed or obviously answer-like output. Existing creator edits take priority over any automated candidate.

The current durable browser recorder already produces short quality chunks. ECHOO processes those existing chunks rather than introducing a second recording pipeline. Aggregating multiple chunks into larger cloud requests is a future cost/throughput optimization, not a prerequisite for correctness.
