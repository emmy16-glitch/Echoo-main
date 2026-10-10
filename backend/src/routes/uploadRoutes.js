import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../middleware/auth.js';
import {
  initiateUpload,
  uploadChunk,
  completeUpload,
  getUploadStatus,
  cancelUpload,
} from '../controllers/uploadController.js';

const router = express.Router();

// Configure multer for chunk uploads
const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp');
fs.mkdirSync(TEMP_DIR, { recursive: true });
const MAX_CHUNK_SIZE = Math.min(16 * 1024 * 1024, Math.max(1024 * 1024, Number(process.env.AUDIO_UPLOAD_CHUNK_BYTES) || 5 * 1024 * 1024));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => cb(null, `${randomUUID()}.part`),
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_CHUNK_SIZE,
  },
});

const uploadChunkFile = (req, res, next) => {
  upload.single('chunk')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Upload chunk exceeds the configured limit.'
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
        message: error.message || 'This upload chunk could not be accepted.',
      },
    });
  });
};

// All upload routes require authentication
router.use(authenticate);

// Initiate upload
router.post('/initiate', initiateUpload);

// Upload chunk
router.post('/:uploadId/chunk', uploadChunkFile, uploadChunk);

// Complete upload
router.post('/:uploadId/complete', completeUpload);

// Get upload status
router.get('/:uploadId/status', getUploadStatus);

// Cancel upload
router.delete('/:uploadId', cancelUpload);

export default router;
