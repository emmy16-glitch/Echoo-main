import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth.js';
import { requireAudioDownloadAccess } from '../middleware/audioDownloadAccess.js';
import {
  uploadAudio,
  getAudio,
  getAudioById,
  downloadAudio,
  updateAudio,
  deleteAudio,
  incrementPlays,
} from '../controllers/audioController.js';
import { toggleAudioLike } from '../controllers/audioLikeController.js';
import {
  issueAudioStreamUrl,
  streamAudio,
} from '../controllers/audioStreamController.js';

const router = express.Router();

const AUDIO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
const COVER_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio-covers');
[AUDIO_UPLOAD_DIR, COVER_UPLOAD_DIR].forEach((directory) => {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
});

const MAX_CLASSIC_WAV_BYTES = 0xffffffff;
const configuredUploadLimit = Number.parseInt(
  process.env.AUDIO_UPLOAD_MAX_BYTES || '',
  10
);
const MAX_LOCAL_AUDIO_UPLOAD_BYTES = Number.isFinite(configuredUploadLimit)
  ? Math.max(
      1024 * 1024,
      Math.min(MAX_CLASSIC_WAV_BYTES, configuredUploadLimit)
    )
  : MAX_CLASSIC_WAV_BYTES;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === 'cover' ? COVER_UPLOAD_DIR : AUDIO_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac', '.webm',
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();

  if (file.fieldname === 'cover') {
    const validImage =
      mimeType.startsWith('image/') && ALLOWED_IMAGE_EXTENSIONS.has(extension);
    if (!validImage) {
      const error = new Error('Cover image must be JPG, PNG or WebP.');
      error.code = 'UNSUPPORTED_COVER_IMAGE';
      error.status = 415;
      return cb(error, false);
    }
    return cb(null, true);
  }

  const looksLikeAudio =
    mimeType.startsWith('audio/') ||
    (mimeType === 'video/webm' && extension === '.webm');

  if (!looksLikeAudio || !ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    const error = new Error(
      'Unsupported audio file. Upload MP3, M4A/AAC, WAV, OGG/Opus, FLAC or audio WebM.'
    );
    error.code = 'UNSUPPORTED_AUDIO_FILE';
    error.status = 415;
    return cb(error, false);
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_LOCAL_AUDIO_UPLOAD_BYTES,
    files: 2,
    fields: 20,
    fieldSize: 64 * 1024,
  },
});

const uploadAudioFields = (req, res, next) => {
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ])(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'This upload is too large for the current Echoo backend.'
          : error.message;

      return res.status(status).json({
        error: {
          code: error.code || 'UPLOAD_ERROR',
          message,
        },
      });
    }

    return res.status(400).json({
      error: {
        code: error.code || 'UPLOAD_REJECTED',
        message: error.message || 'This upload could not be accepted.',
      },
    });
  });
};

const requireCreator = (req, res, next) => {
  const creator =
    req.user?.userType === 'creator' || req.userRoles?.includes('creator');
  if (!creator) {
    return res.status(403).json({
      error: {
        code: 'CREATOR_REQUIRED',
        message: 'Only Echoo creators can publish or manage audio.',
      },
    });
  }
  return next();
};

const validateAudioId = (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({
      error: { code: 'INVALID_AUDIO_ID', message: 'Invalid audio ID' },
    });
  }
  return next();
};

const validateAudioListQuery = (req, res, next) => {
  if (req.query.userId && !mongoose.isValidObjectId(req.query.userId)) {
    return res.status(400).json({
      error: { code: 'INVALID_USER_ID', message: 'Invalid creator user ID' },
    });
  }

  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit || '20', 10) || 20)
  );
  req.query.page = String(page);
  req.query.limit = String(limit);

  if (req.query.search && String(req.query.search).length > 120) {
    return res.status(400).json({
      error: {
        code: 'SEARCH_TOO_LONG',
        message: 'Search text cannot exceed 120 characters',
      },
    });
  }

  return next();
};

const uploadedFiles = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat().filter(Boolean);
  }
  return req.file ? [req.file] : [];
};

const removeUploadedFiles = async (req) => {
  await Promise.all(
    uploadedFiles(req).map(async (file) => {
      if (!file?.path) return;
      try {
        await fs.promises.unlink(file.path);
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          console.warn('Failed upload cleanup warning:', error?.message || error);
        }
      }
    })
  );
};

const readFileHeader = async (filePath, length = 16) => {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const ascii = (buffer, start, end) => buffer.toString('ascii', start, end);

export const matchesUploadedFileSignature = (file, header) => {
  const extension = path.extname(file?.originalname || '').toLowerCase();
  if (!header?.length) return false;

  switch (extension) {
    case '.wav':
      return header.length >= 12 &&
        ascii(header, 0, 4) === 'RIFF' &&
        ascii(header, 8, 12) === 'WAVE';
    case '.flac':
      return header.length >= 4 && ascii(header, 0, 4) === 'fLaC';
    case '.ogg':
    case '.oga':
    case '.opus':
      return header.length >= 4 && ascii(header, 0, 4) === 'OggS';
    case '.webm':
      return header.length >= 4 &&
        header[0] === 0x1a &&
        header[1] === 0x45 &&
        header[2] === 0xdf &&
        header[3] === 0xa3;
    case '.mp3':
      return (
        (header.length >= 3 && ascii(header, 0, 3) === 'ID3') ||
        (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
      );
    case '.aac':
      return header.length >= 2 &&
        header[0] === 0xff &&
        (header[1] & 0xf0) === 0xf0;
    case '.m4a':
      return header.length >= 12 && ascii(header, 4, 8) === 'ftyp';
    case '.jpg':
    case '.jpeg':
      return header.length >= 3 &&
        header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case '.png':
      return header.length >= 8 &&
        header.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        );
    case '.webp':
      return header.length >= 12 &&
        ascii(header, 0, 4) === 'RIFF' &&
        ascii(header, 8, 12) === 'WEBP';
    default:
      return false;
  }
};

const validateUploadedFileSignatures = async (req, res, next) => {
  try {
    for (const file of uploadedFiles(req)) {
      const header = await readFileHeader(file.path, 16);
      if (!matchesUploadedFileSignature(file, header)) {
        const cover = file.fieldname === 'cover';
        const error = new Error(
          cover
            ? 'The uploaded cover does not match its image file type.'
            : 'The uploaded audio bytes do not match the selected audio file type.'
        );
        error.code = cover
          ? 'INVALID_COVER_SIGNATURE'
          : 'INVALID_AUDIO_SIGNATURE';
        error.status = 415;
        throw error;
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

const cleanupUploadError = async (err, req, res, next) => {
  if (!req.audioUploadCommitted) {
    await removeUploadedFiles(req);
  }

  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'AUDIO_FILE_TOO_LARGE' : err.code || 'UPLOAD_ERROR',
        message: tooLarge
          ? 'The audio file exceeds Echoo’s configured local upload limit.'
          : err.message || 'Invalid audio upload.',
      },
    });
  }

  if (
    err?.code === 'UNSUPPORTED_AUDIO_FILE' ||
    err?.code === 'UNSUPPORTED_COVER_IMAGE' ||
    err?.code === 'INVALID_AUDIO_SIGNATURE' ||
    err?.code === 'INVALID_COVER_SIGNATURE'
  ) {
    return res.status(err.status || 415).json({
      error: { code: err.code, message: err.message },
    });
  }

  return next(err);
};

router.get('/', validateAudioListQuery, getAudio);

router.post('/:id/stream-token', validateAudioId, authenticate, issueAudioStreamUrl);
router.get('/:id/stream', validateAudioId, streamAudio);
router.head('/:id/stream', validateAudioId, streamAudio);

router.get(
  '/:id/download',
  validateAudioId,
  authenticate,
  requireAudioDownloadAccess,
  downloadAudio
);
router.get('/:id', validateAudioId, authenticate, getAudioById);
router.post(
  '/upload',
  authenticate,
  requireCreator,
  uploadAudioFields,
  validateUploadedFileSignatures,
  uploadAudio,
  cleanupUploadError
);
router.patch('/:id', validateAudioId, authenticate, requireCreator, updateAudio);
router.delete('/:id', validateAudioId, authenticate, requireCreator, deleteAudio);
router.post('/:id/play', validateAudioId, authenticate, incrementPlays);
router.post('/:id/like', validateAudioId, authenticate, toggleAudioLike);

export default router;
