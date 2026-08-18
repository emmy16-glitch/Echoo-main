import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getProfile,
  getMyProfile,
} from '../controllers/profileController.js';

const router = express.Router();

router.get('/me', authenticate, getMyProfile);
router.get('/:identifier', getProfile);

export default router;
