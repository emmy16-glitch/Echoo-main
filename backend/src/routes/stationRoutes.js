import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createStation,
  getStations,
  getStationById,
  updateStation,
  deleteStation,
  toggleLive,
  getStationSchedule,
  updateStationSchedule,
} from '../controllers/stationController.js';

const router = express.Router();

// Public routes
router.get('/', getStations);
router.get('/:stationId', authenticate, getStationById);

// Protected routes
router.post('/', authenticate, createStation);
router.patch('/:stationId', authenticate, updateStation);
router.delete('/:stationId', authenticate, deleteStation);
router.patch('/:stationId/toggle-live', authenticate, toggleLive);
router.get('/:stationId/schedule', authenticate, getStationSchedule);
router.patch('/:stationId/schedule', authenticate, updateStationSchedule);

export default router;
