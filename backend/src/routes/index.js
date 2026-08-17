import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import audioRoutes from './audioRoutes.js';
import playlistRoutes from './playlistRoutes.js';
import commentRoutes from './commentRoutes.js';
import onboardingRoutes from './onboardingRoutes.js';
import studioRoutes from './studioRoutes.js';
import listenerRoutes from './listenerRoutes.js';
import playerRoutes from './playerRoutes.js';
import followRoutes from './followRoutes.js';
import searchRoutes from './searchRoutes.js';
import libraryRoutes from './libraryRoutes.js';
import stationRoutes from './stationRoutes.js';
import broadcastRoutes from './broadcastRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import chatRoutes from './chatRoutes.js';
import contentRoutes from './contentRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import profileRoutes from './profileRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import historyRoutes from './historyRoutes.js';
import downloadsRoutes from './downloadsRoutes.js';
import liveStudioRoutes from './liveStudioRoutes.js';
import advancedPlayerRoutes from './advancedPlayerRoutes.js';
import notificationRoutes from './notificationRoutes.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'echoo-api',
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/audio', audioRoutes);
router.use('/playlists', playlistRoutes);
router.use('/comments', commentRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/studio', studioRoutes);
router.use('/listener', listenerRoutes);
router.use('/player', playerRoutes);
router.use('/follows', followRoutes);
router.use('/search', searchRoutes);
router.use('/library', libraryRoutes);
router.use('/stations', stationRoutes);
router.use('/broadcasts', broadcastRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/chat', chatRoutes);
router.use('/content', contentRoutes);
router.use('/settings', settingsRoutes);
router.use('/profile', profileRoutes);
router.use('/uploads', uploadRoutes);
router.use('/history', historyRoutes);
router.use('/downloads', downloadsRoutes);
router.use('/live-studio', liveStudioRoutes);
router.use('/player', advancedPlayerRoutes);
router.use('/notifications', notificationRoutes);

export default router;
