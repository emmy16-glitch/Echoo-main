import express from 'express';
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

// Public station discovery.
router.get('/', getStations);

// Creator-owned collection must be declared before /:stationId.
router.get('/mine/all', authenticate, getMyStations);

// Public station profile. Private stations remain owner-only in the controller.
router.get('/:stationId', getStationById);

// Stations are created and managed only through this resource.
router.post('/', authenticate, createStation);
router.patch('/:stationId', authenticate, updateStation);
router.delete('/:stationId', authenticate, deleteStation);

// There is intentionally no station toggle-live or station schedule endpoint.
// Broadcast lifecycle is the single authority for live/scheduled state.

export default router;
