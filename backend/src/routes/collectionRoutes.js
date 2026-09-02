import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import {
  addRecordings,
  createCollection,
  deleteCollection,
  getCollection,
  getMyCollections,
  getPublicCollectionsForStation,
  getSavedCollections,
  removeRecording,
  reorderCollection,
  saveCollection,
  unsaveCollection,
  updateCollection,
} from '../controllers/collectionController.js';

const router = express.Router();

const COLLECTION_COVER_DIR = path.join(process.cwd(), 'uploads', 'collection-covers');
fs.mkdirSync(COLLECTION_COVER_DIR, { recursive: true });

const collectionCoverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, COLLECTION_COVER_DIR),
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      callback(null, `collection-${Date.now()}-${randomUUID()}${extension}`);
    },
  }),
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const supported = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension)
      && ['image/jpeg', 'image/png', 'image/webp'].includes(String(file.mimetype || '').toLowerCase());
    if (supported) return callback(null, true);
    const error = new Error('Collection cover must be a JPG, PNG or WebP image.');
    error.status = 415;
    return callback(error, false);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const uploadCollectionCover = (req, res, next) => {
  collectionCoverUpload.single('cover')(req, res, (uploadError) => {
    if (!uploadError) return next();
    const tooLarge = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : uploadError.status || 400).json({
      error: {
        code: tooLarge ? 'COVER_FILE_TOO_LARGE' : 'INVALID_COLLECTION_COVER',
        message: tooLarge ? 'Collection cover must be 5 MB or smaller.' : uploadError.message,
      },
    });
  });
};

router.get('/mine/all', authenticate, getMyCollections);
router.get('/saved/mine', authenticate, getSavedCollections);
router.get('/station/:stationId', optionalAuth, getPublicCollectionsForStation);
router.get('/:id', optionalAuth, getCollection);
router.post('/', authenticate, createCollection);
router.patch('/:id', authenticate, uploadCollectionCover, updateCollection);
router.delete('/:id', authenticate, deleteCollection);
router.post('/:id/recordings', authenticate, addRecordings);
router.delete('/:id/recordings/:recordingId', authenticate, removeRecording);
router.patch('/:id/order', authenticate, reorderCollection);
router.post('/:id/save', authenticate, saveCollection);
router.delete('/:id/save', authenticate, unsaveCollection);

export default router;
