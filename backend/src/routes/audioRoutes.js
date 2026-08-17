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

// Configure multer for audio uploads
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// For development/testing - accept all files
const fileFilter = (req, file, cb) => {
  // Accept all files in development
  // In production, you should validate properly
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Routes
router.get('/', getAudio);
router.get('/:id', authenticate, getAudioById);
router.post('/upload', authenticate, upload.single('audio'), uploadAudio);
router.patch('/:id', authenticate, updateAudio);
router.delete('/:id', authenticate, deleteAudio);
router.post('/:id/play', authenticate, incrementPlays);
router.post('/:id/like', authenticate, toggleLike);

export default router;
