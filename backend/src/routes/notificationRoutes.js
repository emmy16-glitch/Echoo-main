import express from 'express';
import {
  authenticate,
} from '../middleware/auth.js';

import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '../controllers/notificationController.js';

const router =
  express.Router();


// All notification routes require login.
router.use(authenticate);


router.get(
  '/',
  getNotifications
);


router.patch(
  '/read-all',
  markAllAsRead
);


router.patch(
  '/:notificationId/read',
  markAsRead
);


router.delete(
  '/:notificationId',
  deleteNotification
);


export default router;
