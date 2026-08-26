# ECHOO Codex Cloud Task: Browser Parakeet V3 + Gemini 3.5 Transcription

This directory contains the complete implementation specification for the ECHOO transcription architecture. The specification was split into six files only to avoid chat/upload size limits. Together, the six files are the authoritative task prompt and must be read in order before implementation begins.

Read these files in this exact order:

1. `docs/codex/echoo-parakeet-gemini/prompt-part-01.md`
2. `docs/codex/echoo-parakeet-gemini/prompt-part-02.md`
3. `docs/codex/echoo-parakeet-gemini/prompt-part-03.md`
4. `docs/codex/echoo-parakeet-gemini/prompt-part-04.md`
5. `docs/codex/echoo-parakeet-gemini/prompt-part-05.md`
6. `docs/codex/echoo-parakeet-gemini/prompt-part-06.md`

## Codex Cloud execution instruction

Treat all six files as one continuous specification covering Sections 0 through 44. Do not implement from only one part. Read the complete specification first, then execute it end-to-end.

Do not stop after the audit unless there is a genuine technical blocker. Preserve the existing LiveKit, mixer, recording, MongoDB, Socket.IO, transcript, authentication, creator-review, and VibeCurb UI behavior. Do not push or merge to `main`.

The core architectural rule is that transcription is a side-car enhancement. The broadcast path must continue to work even if Parakeet, Gemini, Whisper, or transcript processing all fail:

`Creator -> ECHOO Mixer -> LiveKit -> Listener`

At completion, produce the full final report required by Section 44 in `prompt-part-06.md`.
