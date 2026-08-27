# Transcription provider fallback

ECHOO chooses one live canonical provider at a time so two engines do not write duplicate live transcript streams.

```text
Browser Parakeet
      |
      | unsupported / initialization failure / provider failure
      v
Gemini Transcribe Live (only when enabled)
      |
      | unavailable / token failure / quota / connection failure
      v
Existing Whisper Flow (only when configured)
      |
      | unavailable
      v
Transcription disabled for this broadcast

LiveKit audio continues at every step.
```

Browser providers create server-owned provider sessions. Final segments are uploaded through the authenticated transcript API using stable provider segment IDs. A bounded retry queue protects short backend/network interruptions and server-side persistence is idempotent by broadcast/session/providerSegmentId.

Parakeet inference and upload queues are bounded to prevent memory growth. Gemini overlap audio is also bounded. Provider errors are surfaced as transcription state changes, not as broadcast failures.

At broadcast end ECHOO stops producing STT audio, flushes the provider and pending segment queue, closes its transcript session, and finalizes the transcript independently from disconnecting LiveKit.
