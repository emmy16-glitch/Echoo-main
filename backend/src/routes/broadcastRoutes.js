import express from 'express';
import { authenticate } from '../middleware/auth.js';

import {
  createBroadcast,
  getBroadcasts,
  getBroadcastById,
  updateBroadcast,
  deleteBroadcast,

  getUpcomingBroadcasts,
  getLiveBroadcast,

  startBroadcast,
  endBroadcast,
  getLiveKitToken,
  getPlaybackInfo,
} from '../controllers/broadcastController.js';

const router =
  express.Router();


/*
 * ==========================================================
 * PUBLIC / DISCOVERY
 * ==========================================================
 */

router.get(
  '/',
  getBroadcasts
);

router.get(
  '/station/:stationId/upcoming',
  getUpcomingBroadcasts
);

router.get(
  '/station/:stationId/live',
  getLiveBroadcast
);

router.get(
  '/:broadcastId/playback',
  getPlaybackInfo
);


/*
 * ==========================================================
 * AUTHENTICATED BROADCAST MANAGEMENT
 * ==========================================================
 */

router.get(
  '/:broadcastId',
  authenticate,
  getBroadcastById
);

router.post(
  '/',
  authenticate,
  createBroadcast
);

router.patch(
  '/:broadcastId',
  authenticate,
  updateBroadcast
);

router.delete(
  '/:broadcastId',
  authenticate,
  deleteBroadcast
);


/*
 * ==========================================================
 * LIVE AUDIO LIFECYCLE
 * ==========================================================
 */

router.post(
  '/:broadcastId/start',
  authenticate,
  startBroadcast
);

router.post(
  '/:broadcastId/end',
  authenticate,
  endBroadcast
);

router.post(
  '/:broadcastId/livekit-token',
  authenticate,
  getLiveKitToken
);


export default router;
