import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getListenerDashboard } from '../controllers/listenerController.js';

const router = express.Router();

// All listener routes require authentication
router.use(authenticate);

// Dashboard
router.get('/dashboard', getListenerDashboard);

export default router;
