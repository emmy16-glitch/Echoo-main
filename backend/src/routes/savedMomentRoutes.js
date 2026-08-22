import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { createSavedMoment, deleteSavedMoment, listSavedMoments } from '../controllers/savedMomentController.js';

const router = express.Router();
router.use(authenticate);
router.get('/', listSavedMoments);
router.post('/', createSavedMoment);
router.delete('/:momentId', deleteSavedMoment);
export default router;
