# Echoo

Echoo is an audio-first live streaming platform.

## Repository structure

- `frontend/` — React + Vite client
- `backend/` — Node.js/Express API
- Live media — LiveKit
- Database — MongoDB
- Realtime infrastructure — Redis / Socket.IO as implemented

## Current live audio architecture

Creator microphone
→ LiveKit room
→ Echoo listeners

LiveKit Egress and OvenMediaEngine remain optional future distribution/recording infrastructure and are not required for the current direct-listener architecture.

## Development

Frontend and backend environment variables must be created locally from their `.env.example` files.

Never commit real secrets.
