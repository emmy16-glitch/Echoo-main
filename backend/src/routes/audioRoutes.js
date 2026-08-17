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

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.webm',
]);

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();
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
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
});

router.get('/', getAudio);
router.get('/:id', authenticate, getAudioById);
router.post('/upload', authenticate, upload.single('audio'), uploadAudio);
router.patch('/:id', authenticate, updateAudio);
router.delete('/:id', authenticate, deleteAudio);
router.post('/:id/play', authenticate, incrementPlays);
router.post('/:id/like', authenticate, toggleLike);

export default router;
