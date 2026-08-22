import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimiter.js';
import { createFeedback } from '../controllers/feedbackController.js';

const router = express.Router();

router.post('/', sensitiveLimiter, authenticate, createFeedback);

export default router;
