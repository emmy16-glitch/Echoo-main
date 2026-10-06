FROM node:20-bookworm-slim

# Echoo's server-side recording and trim pipeline requires both ffmpeg and ffprobe.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --chown=node:node backend ./

RUN mkdir -p /app/backend/uploads/audio \
    && chown -R node:node /app/backend/uploads

ENV NODE_ENV=production
ENV FFMPEG_PATH=ffmpeg
ENV FFPROBE_PATH=ffprobe

USER node

CMD ["node", "src/app.js"]
