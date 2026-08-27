# Transcription privacy boundaries

## Browser Parakeet

Live inference runs in the creator browser. The post-master audio used by Parakeet is not intentionally uploaded to a third-party STT service. Final transcript text and transcript metadata are sent to the ECHOO backend for persistence. Model assets are fetched/cached by the browser according to the configured Parakeet model source.

## Gemini Live

Gemini Live is a cloud fallback. When enabled, the transcription copy of the creator's post-master audio is sent directly from the browser to Google's Gemini Live service. The permanent `GEMINI_API_KEY` remains on the ECHOO backend. The browser receives a short-lived constrained token created for a live connection.

## Gemini quality

When enabled, durable post-broadcast quality WAV data is sent from the ECHOO backend to Gemini Transcribe. The raw/original transcript remains in ECHOO and a Gemini output is treated as a quality candidate subject to validation and creator review.

## Whisper

Whisper remains an optional deployment/fallback path. Its privacy boundary depends on where `WHISPER_FLOW_URL` / `WHISPER_QUALITY_FLOW_URL` are deployed. A self-hosted deployment keeps that provider path under the operator's control.

## Logging and secrets

New provider code does not intentionally log raw audio, Gemini API keys or complete transcript bodies. `GEMINI_API_KEY` must never be placed in a `VITE_` variable. ECHOO's browser APIs return only provider capability flags and ephemeral Gemini tokens when specifically requested by an authenticated broadcast owner.

Free/paid provider data-use policies can change. Product/privacy copy should be based on the provider's current contractual terms at deployment time rather than hard-coded assumptions in ECHOO source.
