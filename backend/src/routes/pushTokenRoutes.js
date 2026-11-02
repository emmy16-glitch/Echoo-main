import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { registerPushToken } from '../controllers/pushTokenController.js';

const router = express.Router();
router.use(authenticate);
router.post('/', registerPushToken);

export default router;
