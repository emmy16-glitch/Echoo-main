import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const { uploadId } = req.params;
    const chunkIndex = req.body.chunkIndex || 0;
    cb(null, `${uploadId}-chunk-${chunkIndex}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per chunk
  },
});

// All upload routes require authentication
router.use(authenticate);

// Initiate upload
router.post('/initiate', initiateUpload);

// Upload chunk
router.post('/:uploadId/chunk', upload.single('chunk'), uploadChunk);

// Complete upload
router.post('/:uploadId/complete', completeUpload);

// Get upload status
router.get('/:uploadId/status', getUploadStatus);

// Cancel upload
router.delete('/:uploadId', cancelUpload);

export default router;
