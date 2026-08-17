import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getSettings,
  updateProfile,
  updatePreferences,
  updatePassword,
  updateEmail,
  updateNotificationSettings,
  deactivateAccount,
  reactivateAccount,
  deleteAccount,
} from '../controllers/settingsController.js';

const router = express.Router();

// All settings routes require authentication
router.use(authenticate);

// Get all settings
router.get('/', getSettings);

// Update profile
router.patch('/profile', updateProfile);

// Update preferences
router.patch('/preferences', updatePreferences);

// Update password
router.patch('/password', updatePassword);

// Update email
router.patch('/email', updateEmail);

// Update notification settings
router.patch('/notifications', updateNotificationSettings);

// Deactivate account
router.post('/deactivate', deactivateAccount);

// Reactivate account
router.post('/reactivate', reactivateAccount);

// Delete account
router.delete('/account', deleteAccount);

export default router;
