import express from 'express';
import mongoose from 'mongoose';
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
import advancedPlayerRoutes from './advancedPlayerRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import transcriptRoutes from './transcriptRoutes.js';
import savedMomentRoutes from './savedMomentRoutes.js';
import LiveKitProvider from '../providers/livekit.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';
import { getTranscriptionGatewayDiagnostics } from '../services/transcriptionGateway.js';

const router = express.Router();

// Liveness says the Node process can answer requests. It deliberately does not
// depend on MongoDB or LiveKit so an orchestrator can distinguish a live process
// from a process that is ready to serve product traffic.
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'echoo-api',
    timestamp: new Date().toISOString(),
  });
});

// Readiness currently requires MongoDB because every authenticated/product flow
// depends on it. LiveKit has its own health endpoint and a temporary LiveKit
// outage must not make ordinary non-live Echoo API traffic unhealthy.
router.get('/health/ready', (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  return res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ok' : 'error',
    service: 'echoo-api',
    ready: databaseReady,
    dependencies: {
      mongodb: databaseReady ? 'connected' : 'unavailable',
    },
    timestamp: new Date().toISOString(),
  });
});

router.get('/health/livekit', async (req, res) => {
  try {
    const health = await LiveKitProvider.checkHealth();

    return res.status(200).json({
      status: 'ok',
      service: 'livekit',
      reachable: true,
      cloud: Boolean(health.cloud),
      publicUrl: health.publicUrl,
      mediaMode: String(process.env.MEDIA_RELAY_MODE || 'livekit-only'),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(error?.status || 503).json({
      status: 'error',
      service: 'livekit',
      reachable: false,
      error: {
        code: error?.code || 'LIVEKIT_UNAVAILABLE',
        message: error?.message || 'LiveKit is unavailable',
      },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/health/transcription', (req, res) => {
  const diagnostics = getTranscriptionGatewayDiagnostics();
  return res.status(200).json({
    status: diagnostics.configured ? 'ok' : 'disabled',
    service: 'transcription-gateway',
    configured: diagnostics.configured,
    activeSessions: diagnostics.activeSessions,
    limits: {
      maxBufferBytes: diagnostics.maxBufferBytes,
      maxBufferFrames: diagnostics.maxBufferFrames,
      maxRetries: diagnostics.maxRetries,
    },
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
// Audio uploads can be multi-gigabyte local-disk writes, so throttle the upload
// entrypoint separately without rate-limiting media Range requests used for
// normal playback.
router.use('/audio/upload', uploadLimiter);
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
router.use('/player', advancedPlayerRoutes);
router.use('/notifications', notificationRoutes);
router.use('/transcripts', transcriptRoutes);
router.use('/saved-moments', savedMomentRoutes);

export default router;
