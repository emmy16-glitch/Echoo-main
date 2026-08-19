import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import { authenticate } from '../middleware/auth.js';
import {
  uploadAudio,
  getAudio,
  getAudioById,
  downloadAudio,
  updateAudio,
  deleteAudio,
  incrementPlays,
  toggleLike,
} from '../controllers/audioController.js';

const router = express.Router();

const AUDIO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
const COVER_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio-covers');
[AUDIO_UPLOAD_DIR, COVER_UPLOAD_DIR].forEach((directory) => {
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
});

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
    // Echoo's local-first post-live master is 48 kHz / 24-bit stereo PCM WAV.
    // Multer streams the multipart body to disk; it does not keep the entire
    // uploaded file in backend memory. This development ceiling should be
    // replaced by resumable object-storage uploads before large-scale release.
    fileSize: 2 * 1024 * 1024 * 1024,
    files: 2,
    fields: 20,
  },
});

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

// Multer writes to disk before the controller creates the Mongo record. If the
// multipart parser or database/controller fails, delete those temporary files
// so repeated failed uploads cannot silently fill the backend disk.
const cleanupUploadError = async (err, req, res, next) => {
  await removeUploadedFiles(req);

  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'AUDIO_FILE_TOO_LARGE' : err.code || 'UPLOAD_ERROR',
        message: tooLarge
          ? 'The audio file exceeds Echoo’s current local upload limit.'
          : err.message || 'Invalid audio upload.',
      },
    });
  }

  if (
    err?.code === 'UNSUPPORTED_AUDIO_FILE' ||
    err?.code === 'UNSUPPORTED_COVER_IMAGE'
  ) {
    return res.status(err.status || 415).json({
      error: { code: err.code, message: err.message },
    });
  }

  return next(err);
};

router.get('/', validateAudioListQuery, getAudio);
router.get('/:id/download', validateAudioId, authenticate, downloadAudio);
router.get('/:id', validateAudioId, authenticate, getAudioById);
router.post(
  '/upload',
  authenticate,
  requireCreator,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  uploadAudio,
  cleanupUploadError
);
router.patch('/:id', validateAudioId, authenticate, requireCreator, updateAudio);
router.delete('/:id', validateAudioId, authenticate, requireCreator, deleteAudio);
router.post('/:id/play', validateAudioId, authenticate, incrementPlays);
router.post('/:id/like', validateAudioId, authenticate, toggleLike);

export default router;
