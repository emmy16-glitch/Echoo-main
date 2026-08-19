import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import {
  uploadAudio,
  getAudio,
  getAudioById,
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
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
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
    const validImage = mimeType.startsWith('image/') && ALLOWED_IMAGE_EXTENSIONS.has(extension);
    if (!validImage) {
      const error = new Error('Cover image must be JPG, PNG or WebP.');
      error.code = 'UNSUPPORTED_COVER_IMAGE';
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
    return cb(error, false);
  }

  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // Local-first broadcast recordings can run for several hours. Keep enough
    // headroom for an Opus/WebM studio recording during testing. Cloud storage,
    // quotas and resumable uploads can replace this when online media storage
    // is introduced.
    fileSize: 256 * 1024 * 1024,
    files: 2,
  },
});

const requireCreator = (req, res, next) => {
  const creator = req.user?.userType === 'creator' || req.userRoles?.includes('creator');
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

router.get('/', getAudio);
router.get('/:id', authenticate, getAudioById);
router.post(
  '/upload',
  authenticate,
  requireCreator,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  uploadAudio
);
router.patch('/:id', authenticate, requireCreator, updateAudio);
router.delete('/:id', authenticate, requireCreator, deleteAudio);
router.post('/:id/play', authenticate, incrementPlays);
router.post('/:id/like', authenticate, toggleLike);

export default router;
