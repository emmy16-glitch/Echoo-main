import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
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
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `station-${uniqueSuffix}${ext}`);
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

// Public station discovery.
router.get('/', getStations);

// Creator-owned collection must be declared before /:stationId.
router.get('/mine/all', authenticate, getMyStations);

// Public station profile. Private stations remain owner-only in the controller.
router.get('/:stationId', getStationById);

// Stations are created and managed only through this resource.
// `logo` is optional; metadata-only JSON requests remain supported.
router.post('/', authenticate, uploadStationLogo.single('logo'), createStation);
router.patch('/:stationId', authenticate, uploadStationLogo.single('logo'), updateStation);
router.delete('/:stationId', authenticate, deleteStation);

// Broadcasts are the only authority for live state and future broadcast timing.

export default router;
