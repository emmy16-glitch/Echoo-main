import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { jwtConfig } from '../config/jwt.js';

const STREAM_AUDIENCE = 'echoo-audio-stream';
const STREAM_ISSUER = 'echoo-api';
const MIN_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_PUBLIC_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_OWNER_TTL_SECONDS = 60 * 60;
const PLAYBACK_BUFFER_SECONDS = 15 * 60;

const streamSecret = () =>
  String(process.env.AUDIO_STREAM_SECRET || jwtConfig.access.secret || '').trim();

const configuredTtl = (name, fallback) => {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, parsed));
};

export const isCanonicalPublicAudio = (audio) => Boolean(
  audio &&
  audio.isPublic === true &&
  audio.visibility === 'public' &&
  audio.publicationStatus === 'published'
);

export const audioStreamTtlSeconds = ({ access = 'public', duration = 0 } = {}) => {
  const base = access === 'owner'
    ? configuredTtl('AUDIO_PRIVATE_STREAM_TOKEN_TTL_SECONDS', DEFAULT_OWNER_TTL_SECONDS)
    : configuredTtl('AUDIO_PUBLIC_STREAM_TOKEN_TTL_SECONDS', DEFAULT_PUBLIC_TTL_SECONDS);
  const durationSeconds = Math.max(0, Math.ceil(Number(duration) || 0));
  return Math.min(
    MAX_TTL_SECONDS,
    Math.max(base, durationSeconds + PLAYBACK_BUFFER_SECONDS)
  );
};

export const createAudioStreamToken = ({
  audioId,
  access = 'public',
  ownerId = '',
  duration = 0,
}) => {
  const id = String(audioId || '').trim();
  if (!id) throw new Error('audioId is required for an audio stream token');
  if (!['public', 'account', 'owner'].includes(access)) {
    throw new Error('Invalid audio stream access scope');
  }

  const secret = streamSecret();
  if (!secret) {
    const error = new Error('Audio stream signing is not configured');
    error.code = 'AUDIO_STREAM_CONFIG_MISSING';
    error.status = 503;
    throw error;
  }

  const ttl = audioStreamTtlSeconds({ access, duration });
  const payload = {
    type: 'audio-stream',
    audioId: id,
    access,
    ...(access === 'owner' ? { ownerId: String(ownerId || '') } : {}),
    ...(access === 'account' ? { userId: String(ownerId || '') } : {}),
  };

  const token = jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: ttl,
    audience: STREAM_AUDIENCE,
    issuer: STREAM_ISSUER,
    jwtid: randomUUID(),
  });

  return { token, ttl };
};

export const verifyAudioStreamToken = (token, audioId) => {
  const secret = streamSecret();
  if (!secret) {
    const error = new Error('Audio stream signing is not configured');
    error.code = 'AUDIO_STREAM_CONFIG_MISSING';
    error.status = 503;
    throw error;
  }

  try {
    const decoded = jwt.verify(String(token || ''), secret, {
      algorithms: ['HS256'],
      audience: STREAM_AUDIENCE,
      issuer: STREAM_ISSUER,
    });

    if (
      decoded?.type !== 'audio-stream' ||
      String(decoded?.audioId || '') !== String(audioId || '') ||
      !['public', 'account', 'owner'].includes(decoded?.access)
    ) {
      const error = new Error('Invalid audio stream token');
      error.code = 'INVALID_AUDIO_STREAM_TOKEN';
      error.status = 401;
      throw error;
    }

    return decoded;
  } catch (cause) {
    if (cause?.status && cause?.code) throw cause;
    const expired = cause?.name === 'TokenExpiredError';
    const error = new Error(
      expired ? 'Audio stream link has expired' : 'Invalid audio stream token'
    );
    error.code = expired ? 'AUDIO_STREAM_TOKEN_EXPIRED' : 'INVALID_AUDIO_STREAM_TOKEN';
    error.status = 401;
    throw error;
  }
};

export const buildAudioStreamUrl = (audio, { access = 'public' } = {}) => {
  const audioId = audio?._id || audio?.id;
  if (!audioId) return null;

  const artistId = audio?.artist?._id || audio?.artist;

  // A bearer-free URL is shareable by definition, so issue a public token only
  // when every canonical publication field says the asset is public. Do not let
  // the legacy isPublic boolean alone broaden a private/followers-only asset.
  if (access === 'public' && !isCanonicalPublicAudio(audio)) return null;
  if (access === 'owner' && !artistId) return null;
  if (access === 'account' && !artistId) return null;

  const { token, ttl } = createAudioStreamToken({
    audioId,
    access,
    ownerId: artistId,
    duration: audio?.duration,
  });

  return {
    url: `/api/audio/${encodeURIComponent(String(audioId))}/stream?token=${encodeURIComponent(token)}`,
    expiresIn: ttl,
  };
};

export default {
  buildAudioStreamUrl,
  createAudioStreamToken,
  verifyAudioStreamToken,
  audioStreamTtlSeconds,
  isCanonicalPublicAudio,
};
