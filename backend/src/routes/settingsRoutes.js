import express from 'express';
import {
  authenticate,
  authenticateIncludingInactive,
} from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/rateLimiter.js';
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

// Reactivation must be reachable after deactivation. The special middleware
// verifies the access token but intentionally allows the identified account to
// be inactive; every normal settings route below still requires an active user.
router.post(
  '/reactivate',
  sensitiveLimiter,
  authenticateIncludingInactive,
  reactivateAccount
);

router.use(authenticate);

router.get('/', getSettings);
router.patch('/profile', updateProfile);
router.patch('/preferences', updatePreferences);
router.patch('/notifications', updateNotificationSettings);

router.patch('/password', sensitiveLimiter, updatePassword);
router.patch('/email', sensitiveLimiter, updateEmail);
router.post('/deactivate', sensitiveLimiter, deactivateAccount);
router.delete('/account', sensitiveLimiter, deleteAccount);

export default router;
