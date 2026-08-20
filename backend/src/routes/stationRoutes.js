import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { requireStationDeletionSafe } from '../middleware/stationDeletionGuard.js';
import {
  boundedSearchText,
  escapeRegexLiteral,
} from '../utils/queryText.js';
import {
  createStation,
  getStations,
  getMyStations,
  getStationById,
  updateStation,
  deleteStation,
} from '../controllers/stationController.js';

const router = express.Router();

const STATION_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'stations');
if (!fs.existsSync(STATION_UPLOAD_DIR)) {
  fs.mkdirSync(STATION_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STATION_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `station-${Date.now()}-${randomUUID()}${ext}`);
  },
});

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const stationLogoFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();

  if (
    !ALLOWED_IMAGE_EXTENSIONS.has(extension) ||
    !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)
  ) {
    const error = new Error('Station logo must be a JPG, PNG or WebP image.');
    error.code = 'UNSUPPORTED_STATION_LOGO';
    error.status = 415;
    return cb(error, false);
  }

  return cb(null, true);
};

const uploadStationLogo = multer({
  storage,
  fileFilter: stationLogoFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

const validateStationListQuery = (req, res, next) => {
  if (req.query.search === undefined) return next();

  try {
    const text = boundedSearchText(req.query.search, { maxLength: 120 });
    req.query.search = escapeRegexLiteral(text);
    return next();
  } catch (error) {
    return res.status(error.status || 400).json({
      error: {
        code: error.code || 'INVALID_SEARCH',
        message: error.message || 'Invalid station search text',
      },
    });
  }
};

// Multer writes the file before the controller runs. If later validation or a
// database write returns 4xx/5xx, remove that new file instead of leaking one
// orphaned logo on disk for every failed request.
const cleanupFailedStationUpload = (req, res, next) => {
  const uploadedPath = req.file?.path;
  if (uploadedPath) {
    res.once('finish', () => {
      if (res.statusCode < 400) return;
      fs.promises.unlink(uploadedPath).catch((error) => {
        if (error?.code !== 'ENOENT') {
          console.warn('Failed station-logo cleanup warning:', error?.message || error);
        }
      });
    });
  }
  next();
};

// Public station discovery.
router.get('/', validateStationListQuery, getStations);

// Creator-owned collection must be declared before /:stationId.
router.get('/mine/all', authenticate, getMyStations);

// Public station profile. Optional auth is required here so the controller can
// distinguish an anonymous visitor from the owner of a private station.
router.get('/:stationId', optionalAuth, getStationById);

// Stations are created and managed only through this resource.
// `logo` is optional; metadata-only JSON requests remain supported.
router.post(
  '/',
  authenticate,
  uploadStationLogo.single('logo'),
  cleanupFailedStationUpload,
  createStation
);
router.patch(
  '/:stationId',
  authenticate,
  uploadStationLogo.single('logo'),
  cleanupFailedStationUpload,
  updateStation
);
router.delete(
  '/:stationId',
  authenticate,
  requireStationDeletionSafe,
  deleteStation
);

// Broadcasts are the only authority for live state and future broadcast timing.

export default router;
