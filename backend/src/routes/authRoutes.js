import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  forgotPassword,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import {
  authLimiter,
  refreshLimiter,
} from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/refresh', refreshLimiter, refreshToken);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getCurrentUser);

export default router;
