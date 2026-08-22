import fs from 'fs';
import path from 'path';
import Audio from '../models/Audio.js';
import { verifyAccessToken } from '../config/jwt.js';
import {
  buildAudioStreamUrl,
  createAudioStreamToken,
  verifyAudioStreamToken,
} from '../services/audioStreamAccess.js';
import { canAccessReplayAudio } from '../services/assetAccessService.js';

const safeLocalAudioPath = (audio) => {
  const storedFilename = path.basename(
    String(audio?.filename || audio?.fileKey || '')
  );
  if (!storedFilename) return null;
  return path.join(process.cwd(), 'uploads', 'audio', storedFilename);
};

const bearerToken = (req) => {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

const streamGrantForRequest = (req, audioId) => {
  const signedToken = String(req.query.token || '').trim();
  if (signedToken) return verifyAudioStreamToken(signedToken, audioId);

  const accessToken = bearerToken(req);
  if (!accessToken) {
    const error = new Error('Audio stream authentication is required');
    error.code = 'AUDIO_STREAM_AUTH_REQUIRED';
    error.status = 401;
    throw error;
  }

  const decoded = verifyAccessToken(accessToken);
  return {
    type: 'access',
    access: 'account',
    userId: String(decoded.sub || ''),
  };
};

const authorizeGrant = async (audio, grant) => {
  const ownerId = String(audio.artist?._id || audio.artist || '');

  if (grant?.type === 'access') {
    if (await canAccessReplayAudio(audio, grant.userId)) return;
  } else if (grant?.type === 'audio-stream') {
    if (grant.access === 'public' && audio.isPublic) return;
    if (grant.access === 'account' && await canAccessReplayAudio(audio, grant.userId)) return;
    if (
      grant.access === 'owner' &&
      ownerId &&
      String(grant.ownerId || '') === ownerId
    ) {
      return;
    }
  }

  const error = new Error('You do not have access to this audio');
  error.code = 'AUDIO_STREAM_FORBIDDEN';
  error.status = 403;
  throw error;
};

export const parseSingleByteRange = (rangeHeader, size) => {
  const total = Number(size);
  if (!Number.isInteger(total) || total < 0) return null;
  if (!rangeHeader) return { start: 0, end: Math.max(0, total - 1), partial: false };

  const value = String(rangeHeader).trim();
  if (!value.startsWith('bytes=') || value.includes(',')) return null;

  const spec = value.slice(6).trim();
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match || (!match[1] && !match[2]) || total === 0) return null;

  let start;
  let end;

  if (!match[1]) {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, total - suffixLength);
    end = total - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    if (!Number.isFinite(start) || start < 0 || start >= total) return null;

    if (match[2]) {
      end = Number.parseInt(match[2], 10);
      if (!Number.isFinite(end) || end < start) return null;
      end = Math.min(end, total - 1);
    } else {
      end = total - 1;
    }
  }

  return { start, end, partial: true };
};

export async function issueAudioStreamUrl(req, res, next) {
  try {
    const audio = await Audio.findOne({
      _id: req.params.id,
      isDeleted: false,
    }).select('_id artist isPublic visibility publicationStatus sourceBroadcast duration');

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    const ownerId = String(audio.artist || '');
    const isOwner = ownerId === String(req.userId || '');
    if (!await canAccessReplayAudio(audio, req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this audio' },
      });
    }

    const access = isOwner ? 'owner' : audio.isPublic ? 'public' : 'account';
    let signed = buildAudioStreamUrl(audio, { access });
    if (access === 'account') {
      const grant = createAudioStreamToken({ audioId: audio._id, access, ownerId: req.userId, duration: audio.duration });
      signed = {
        url: `/api/audio/${encodeURIComponent(String(audio._id))}/stream?token=${encodeURIComponent(grant.token)}`,
        expiresIn: grant.ttl,
      };
    }
    if (!signed?.url) {
      return res.status(503).json({
        error: {
          code: 'AUDIO_STREAM_UNAVAILABLE',
          message: 'Echoo could not prepare this audio stream.',
        },
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      data: {
        streamUrl: signed.url,
        expiresIn: signed.expiresIn,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function streamAudio(req, res, next) {
  try {
    const audioId = String(req.params.id || '');
    const grant = streamGrantForRequest(req, audioId);

    // Authorization and current visibility are checked for every range request.
    // If a creator makes a track private, previously issued public links stop
    // working immediately even if their token has not yet expired.
    const audio = await Audio.findOne({
      _id: audioId,
      isDeleted: false,
    }).select(
      '_id artist isPublic visibility publicationStatus sourceBroadcast filename fileKey mimeType originalName duration fileSize'
    );

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    await authorizeGrant(audio, grant);

    const absolutePath = safeLocalAudioPath(audio);
    if (!absolutePath) {
      return res.status(404).json({
        error: {
          code: 'AUDIO_FILE_MISSING',
          message: 'The audio file is not available on this backend.',
        },
      });
    }

    let stat;
    try {
      stat = await fs.promises.stat(absolutePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return res.status(404).json({
          error: {
            code: 'AUDIO_FILE_MISSING',
            message: 'The audio file is not available on this backend.',
          },
        });
      }
      throw error;
    }

    if (!stat.isFile()) {
      return res.status(404).json({
        error: {
          code: 'AUDIO_FILE_MISSING',
          message: 'The audio file is not available on this backend.',
        },
      });
    }

    const size = stat.size;
    const range = parseSingleByteRange(req.headers.range, size);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', audio.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(audio.originalName || 'echoo-audio')}`
    );

    if (!range) {
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.status(416).end();
    }

    const start = range.partial ? range.start : 0;
    const end = range.partial ? range.end : Math.max(0, size - 1);
    const contentLength = size === 0 ? 0 : end - start + 1;

    if (range.partial) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    } else {
      res.status(200);
    }
    res.setHeader('Content-Length', String(contentLength));

    if (req.method === 'HEAD' || size === 0) return res.end();

    const fileStream = fs.createReadStream(absolutePath, { start, end });
    fileStream.on('error', (streamError) => {
      if (!res.headersSent) next(streamError);
      else res.destroy(streamError);
    });
    fileStream.pipe(res);
    return undefined;
  } catch (error) {
    if (error?.message === 'Access token expired') {
      error.status = 401;
      error.code = 'ACCESS_TOKEN_EXPIRED';
    } else if (error?.message === 'Invalid access token') {
      error.status = 401;
      error.code = 'INVALID_ACCESS_TOKEN';
    }
    next(error);
  }
}

export default {
  issueAudioStreamUrl,
  streamAudio,
  parseSingleByteRange,
};
