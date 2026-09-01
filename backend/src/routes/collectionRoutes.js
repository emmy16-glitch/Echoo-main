import express from 'express';
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

router.get('/mine/all', authenticate, getMyCollections);
router.get('/saved/mine', authenticate, getSavedCollections);
router.get('/station/:stationId', optionalAuth, getPublicCollectionsForStation);
router.get('/:id', optionalAuth, getCollection);
router.post('/', authenticate, createCollection);
router.patch('/:id', authenticate, updateCollection);
router.delete('/:id', authenticate, deleteCollection);
router.post('/:id/recordings', authenticate, addRecordings);
router.delete('/:id/recordings/:recordingId', authenticate, removeRecording);
router.patch('/:id/order', authenticate, reorderCollection);
router.post('/:id/save', authenticate, saveCollection);
router.delete('/:id/save', authenticate, unsaveCollection);

export default router;
