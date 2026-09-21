# Echoo transcription deployment

LiveKit remains the live media authority. The transcription gateway is an
optional, failure-isolated server-side branch.

## Migration order

1. Back up MongoDB and check that each non-deleted Broadcast has at most one replay Audio record.
2. Run `npm run migrate:transcription` from `backend/`. The migration is idempotent and preserves unrelated indexes.
3. Deploy `echoo-whisper/` with a persistent model volume and GPU access. Configure
   the same backend-only `WHISPER_FLOW_API_KEY` on Echoo and Whisper Flow.
4. Configure LiveKit to send signed webhooks to `POST /api/webhooks/livekit`.
5. Deploy the backend, then deploy the frontend. Remove any obsolete `VITE_WHISPER_FLOW_URL` from hosted frontend settings.
6. Run `npm run probe:transcription` in staging against a protocol-compatible provider, then verify a real creator-to-listener session.

The migration backfills `sessionId`, `confidence`, and `providerRevision`, replaces
the old provider-segment uniqueness rule, creates cursor/text indexes, and adds
the one-replay-per-broadcast constraint. It stops without changing replay indexes
when duplicate replay records need operator review.

## Provider contract

Echoo opens an authenticated WebSocket and sends a `start` message followed by
timestamped JSON `audio` packets. Each packet contains the broadcast ID, session
ID, sequence, broadcast-relative timestamp, and base64 PCM audio. PCM is signed
16-bit little-endian mono at 16 kHz in 20 ms (640 byte) frames. The provider
returns explicit `ack` messages, revisable `segment` messages, and a `flushed`
message only after confirmed final text has been emitted. Stable provider segment
IDs make each partial update replace its earlier revision.

## Runtime checks

- `GET /api/health/transcription` reports configuration and bounded runtime counts without exposing secrets.
- Listener clients recover persisted segments through cursor-paginated Transcript APIs after Socket.IO reconnects.
- A provider outage changes transcript status only. LiveKit publication and listener playback continue unchanged.
- Multi-instance deployment requires sticky creator Socket.IO routing or a dedicated/shared transcription worker.
- Use `wss://` between hosts. `ws://127.0.0.1` is suitable only when both services
  share a trusted host or private container network.
