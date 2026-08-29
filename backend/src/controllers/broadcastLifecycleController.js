import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import User from '../models/User.js';
import LiveKitProvider from '../providers/livekit.js';
import OvenMediaProvider from '../providers/ovenmedia.js';
import { clearBroadcastPresenceCache } from './broadcastPresenceController.js';
import { waitForCreatorProgramAudio } from '../services/broadcastAudioReadiness.js';
import {
  flushBroadcastTranscription,
  isTranscriptionConfigured,
} from '../services/transcriptionGateway.js';
import { enqueueBroadcastProcessing } from '../services/broadcastProcessingService.js';
import {
  acquireCreatorBroadcastLease,
  refreshCreatorBroadcastLease,
  releaseCreatorBroadcastLease,
} from '../services/creatorBroadcastLease.js';

const ACTIVE_STATUSES = new Set(['starting', 'live', 'ending']);

const isValidId = (value) => mongoose.isValidObjectId(value);

const invalidId = (res) =>
  res.status(400).json({
    error: {
      code: 'INVALID_BROADCAST_ID',
      message: 'Invalid broadcast ID',
    },
  });

const mediaRelayMode = () =>
  String(process.env.MEDIA_RELAY_MODE || 'livekit-only').toLowerCase();

const stationIdOf = (broadcast) =>
  broadcast?.station?._id || broadcast?.station || null;

const publicLiveKitUrl = () => LiveKitProvider.getPublicUrl();

const emitStatus = (req, broadcast) => {
  const io = req.app.get('io');
  if (!io || !broadcast) return;

  const payload = {
    broadcastId: String(broadcast.id || broadcast._id),
    status: broadcast.status,
    startedAt: broadcast.startedAt || null,
    endedAt: broadcast.endedAt || null,
    listenerCount: Number(broadcast.listenerCount || 0),
    peakListeners: Number(broadcast.peakListeners || 0),
    mediaState: broadcast.mediaState || 'waiting_for_creator',
    transcriptState: broadcast.transcriptState || 'disabled',
    programTrackSid: broadcast.programTrackSid || null,
    programTrackName: broadcast.programTrackName || null,
  };

  io.to(`broadcast:${broadcast.id || broadcast._id}`).emit(
    'broadcast:status',
    payload
  );
  if (broadcast.status === 'live') {
    io.to(`broadcast:${broadcast.id || broadcast._id}`).emit('broadcast_started', payload);
  }
  if (['completed', 'cancelled', 'failed'].includes(broadcast.status)) {
    io.to(`broadcast:${broadcast.id || broadcast._id}`).emit('broadcast_ended', payload);
  }
  io.to(`broadcast:${broadcast.id || broadcast._id}`).emit('listener_count_updated', payload);
  io.to(`broadcast:${broadcast.id || broadcast._id}`).emit('peak_listener_updated', payload);

  // Public discovery screens do not join every broadcast room. Notify all
  // authenticated clients that a public catalog item changed; clients then
  // re-fetch through their normal permission-filtered API path.
  if (broadcast.isPublic !== false) {
    io.emit('catalog:changed', {
      entity: 'broadcast',
      action: 'status',
      ...payload,
    });
  }
};

const findOwnedBroadcast = (broadcastId, userId) =>
  Broadcast.findOne({
    _id: broadcastId,
    creator: userId,
    isDeleted: false,
  });

const updateStationBestEffort = async (stationId, update, context) => {
  if (!stationId) return;
  try {
    await Station.findByIdAndUpdate(stationId, update);
  } catch (error) {
    console.warn(
      `Broadcast station sync warning (${context}):`,
      error?.message || error
    );
  }
};

const releaseLeaseBestEffort = async (creatorId, broadcastId) => {
  try {
    await releaseCreatorBroadcastLease(creatorId, broadcastId);
  } catch (error) {
    console.warn(
      'Creator broadcast lease cleanup warning:',
      error?.message || error
    );
  }
};

const stopLiveResourcesBestEffort = async ({ broadcastId, egressId, ingressId }) => {
  if (ingressId) {
    try {
      await LiveKitProvider.stopIngress(ingressId);
    } catch (error) {
      console.warn(
        `LiveKit ingress cleanup warning for ${broadcastId}:`,
        error?.message || error
      );
    }
  }

  if (egressId) {
    try {
      await LiveKitProvider.stopEgress(egressId);
    } catch (error) {
      console.warn(
        `LiveKit egress cleanup warning for ${broadcastId}:`,
        error?.message || error
      );
    }
  }

  try {
    await LiveKitProvider.endRoom(broadcastId);
  } catch (error) {
    // endRoom currently handles its own cleanup failures, but keep this guard
    // so a provider implementation change cannot break lifecycle finalization.
    console.warn(
      `LiveKit room cleanup warning for ${broadcastId}:`,
      error?.message || error
    );
  }
};

const conflictResponse = (res, error) =>
  res.status(error?.status || 409).json({
    error: {
      code: error?.code || 'CREATOR_ALREADY_LIVE',
      message:
        error?.message ||
        'You already have an active live broadcast. End it before starting another.',
      ...(error?.activeBroadcastId
        ? { activeBroadcastId: error.activeBroadcastId }
        : {}),
    },
  });

export async function startBroadcast(req, res, next) {
  let broadcast = null;
  let leaseAcquired = false;
  let roomPrepared = false;
  let egressId = null;

  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).populate('station', 'name');

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (broadcast.status === 'live') {
      return res.status(409).json({
        error: { code: 'ALREADY_LIVE', message: 'Broadcast is already live' },
      });
    }

    if (broadcast.status === 'starting') {
      return res.status(409).json({
        error: {
          code: 'START_ALREADY_IN_PROGRESS',
          message: 'This broadcast is already preparing its live room. Resume the existing start instead.',
        },
      });
    }

    if (!['scheduled', 'draft', 'failed'].includes(broadcast.status)) {
      return res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: `Cannot start a broadcast with status ${broadcast.status}`,
        },
      });
    }

    try {
      await acquireCreatorBroadcastLease(req.userId, broadcastId);
      leaseAcquired = true;
    } catch (leaseError) {
      if (leaseError?.code === 'CREATOR_ALREADY_LIVE') {
        return conflictResponse(res, leaseError);
      }
      throw leaseError;
    }

    broadcast.status = 'starting';
    broadcast.failureReason = null;
    broadcast.startedAt = null;
    broadcast.endedAt = null;
    broadcast.listenerCount = 0;
    broadcast.listenerSeconds = 0;
    broadcast.lastPresenceSampleAt = new Date();
    broadcast.livekitEgressId = null;
    broadcast.livekitRoomName = null;
    broadcast.mediaState = 'creator_connecting';
    broadcast.transcriptState = 'disabled';
    broadcast.programTrackSid = null;
    broadcast.programTrackName = null;
    await broadcast.save();

    clearBroadcastPresenceCache(broadcastId);
    emitStatus(req, broadcast);
    console.info('[Echoo Broadcast] creator start accepted', {
      broadcastId: String(broadcast._id),
      creatorId: String(req.userId),
      status: broadcast.status,
      mediaState: broadcast.mediaState,
    });

    const room = await LiveKitProvider.createRoom(broadcastId);
    roomPrepared = true;

    // Persist the room immediately. If token generation or an optional relay
    // later fails, cleanup can still recover the exact prepared resource.
    broadcast.livekitRoomName = room.name;
    await broadcast.save();

    const user = await User.findById(req.userId).select('displayName username');
    const token = await LiveKitProvider.generateCreatorToken(
      broadcastId,
      req.userId,
      user?.displayName || user?.username || 'Echoo Creator'
    );

    const relayMode = mediaRelayMode();
    const liveKitOnly = relayMode === 'livekit-only';
    let ingestUrl = null;
    let playbackUrls = null;

    if (!liveKitOnly) {
      ingestUrl = OvenMediaProvider.getIngestUrl(broadcastId, 'rtmp');
      const egress = await LiveKitProvider.startEgress(
        broadcastId,
        broadcast.title,
        ingestUrl
      );
      egressId = egress?.egressId || null;
      broadcast.livekitEgressId = egressId;
      await broadcast.save();
      playbackUrls = OvenMediaProvider.getPlaybackUrls(broadcastId);
    }

    return res.status(200).json({
      data: {
        broadcast,
        token,
        roomName: room.name,
        livekitUrl: publicLiveKitUrl(),
        ingestUrl,
        playbackUrls,
        mediaMode: liveKitOnly ? 'livekit-direct' : 'livekit-ome',
        relayAvailable: !liveKitOnly,
      },
      message: 'Broadcast room is ready. Publish the studio mix, then confirm live.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Start broadcast error:', error);

    if (roomPrepared || broadcast?.livekitRoomName) {
      await stopLiveResourcesBestEffort({
        broadcastId: req.params.broadcastId,
        egressId: egressId || broadcast?.livekitEgressId,
        ingressId: broadcast?.livekitIngressId,
      });
    }

    if (broadcast && ACTIVE_STATUSES.has(broadcast.status)) {
      broadcast.status = 'failed';
      broadcast.failureReason = String(
        error?.message || 'Unknown error during start'
      ).slice(0, 1000);
      broadcast.listenerCount = 0;
      broadcast.livekitRoomName = null;
      broadcast.livekitEgressId = null;
      broadcast.livekitIngressId = null;
      broadcast.mediaState = 'audio_disconnected';
      broadcast.transcriptState = 'failed';
      broadcast.programTrackSid = null;
      broadcast.programTrackName = null;
      await broadcast.save().catch((saveError) => {
        console.error(
          'Could not persist failed broadcast state:',
          saveError?.message || saveError
        );
      });
      clearBroadcastPresenceCache(broadcast._id);
      emitStatus(req, broadcast);
    }

    if (leaseAcquired && broadcast) {
      await releaseLeaseBestEffort(req.userId, broadcast._id);
    }

    next(error);
  }
}

export async function confirmBroadcastLive(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await findOwnedBroadcast(broadcastId, req.userId);
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (broadcast.status === 'live') {
      await refreshCreatorBroadcastLease(req.userId, broadcastId).catch(() => null);
      return res.status(200).json({
        data: broadcast,
        message: 'Broadcast is already live',
        timestamp: new Date().toISOString(),
      });
    }

    if (broadcast.status !== 'starting') {
      return res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: 'Broadcast must be starting before it can be confirmed live',
        },
      });
    }

    if (!broadcast.livekitRoomName) {
      return res.status(409).json({
        error: {
          code: 'LIVEKIT_ROOM_UNAVAILABLE',
          message: 'LiveKit room is not ready',
        },
      });
    }

    try {
      await refreshCreatorBroadcastLease(req.userId, broadcastId);
    } catch (leaseError) {
      if (leaseError?.code === 'CREATOR_ALREADY_LIVE') {
        return conflictResponse(res, leaseError);
      }
      throw leaseError;
    }

    // Ownership/state checks happen before this remote LiveKit lookup. This
    // prevents another authenticated account from using confirm-live to make
    // repeated participant-list requests for a broadcast it does not own.
    const publisher = await waitForCreatorProgramAudio(broadcastId, req.userId);

    broadcast.status = 'live';
    broadcast.startedAt = broadcast.startedAt || new Date();
    broadcast.failureReason = null;
    broadcast.mediaState = 'audio_live';
    broadcast.programTrackSid = publisher.trackSid || null;
    broadcast.programTrackName = publisher.trackName || 'echoo-studio-mix';
    await broadcast.save();

    console.info('[Echoo Broadcast] live state confirmed', {
      broadcastId: String(broadcast._id),
      creatorId: String(req.userId),
      status: broadcast.status,
      mediaState: broadcast.mediaState,
      trackSid: broadcast.programTrackSid,
      trackName: broadcast.programTrackName,
    });

    clearBroadcastPresenceCache(broadcastId);
    await updateStationBestEffort(
      stationIdOf(broadcast),
      { isLive: true, listenerCount: 0 },
      'confirm-live'
    );
    emitStatus(req, broadcast);

    return res.status(200).json({
      data: broadcast,
      publisher,
      message: 'Broadcast is live',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.status && error?.code) {
      return res.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
}

export async function getLiveKitToken(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await findOwnedBroadcast(broadcastId, req.userId);
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (!['starting', 'live'].includes(broadcast.status)) {
      return res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: 'Broadcast must be starting or live',
        },
      });
    }

    try {
      await refreshCreatorBroadcastLease(req.userId, broadcastId);
    } catch (leaseError) {
      if (leaseError?.code === 'CREATOR_ALREADY_LIVE') {
        return conflictResponse(res, leaseError);
      }
      throw leaseError;
    }

    let roomName = broadcast.livekitRoomName;
    if (!roomName) {
      const room = await LiveKitProvider.createRoom(broadcastId);
      roomName = room.name;
      broadcast.livekitRoomName = roomName;
      await broadcast.save();
      clearBroadcastPresenceCache(broadcastId);
    }

    const user = await User.findById(req.userId).select('displayName username');
    const token = await LiveKitProvider.generateCreatorToken(
      broadcastId,
      req.userId,
      user?.displayName || user?.username || 'Echoo Creator'
    );

    return res.status(200).json({
      data: {
        token,
        roomName,
        livekitUrl: publicLiveKitUrl(),
        broadcastId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

async function setBroadcastPauseState(req, res, next, paused) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await findOwnedBroadcast(broadcastId, req.userId);
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }
    if (broadcast.status !== 'live') {
      return res.status(409).json({
        error: { code: 'NOT_LIVE', message: 'Only a live broadcast can be paused or resumed' },
      });
    }

    broadcast.mediaState = paused ? 'audio_paused' : 'audio_live';
    await broadcast.save();
    clearBroadcastPresenceCache(broadcastId);
    emitStatus(req, broadcast);

    console.info(`[Echoo Broadcast] ${paused ? 'paused' : 'resumed'}`, {
      broadcastId: String(broadcast._id),
      creatorId: String(req.userId),
      mediaState: broadcast.mediaState,
    });

    return res.status(200).json({
      data: broadcast,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export function pauseBroadcast(req, res, next) {
  return setBroadcastPauseState(req, res, next, true);
}

export function resumeBroadcast(req, res, next) {
  return setBroadcastPauseState(req, res, next, false);
}

export async function cancelBroadcast(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await findOwnedBroadcast(broadcastId, req.userId);
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (broadcast.status === 'cancelled') {
      await releaseLeaseBestEffort(req.userId, broadcastId);
      return res.status(200).json({
        data: broadcast,
        message: 'Broadcast is already cancelled',
        timestamp: new Date().toISOString(),
      });
    }

    if (['live', 'ending'].includes(broadcast.status)) {
      return res.status(409).json({
        error: {
          code: 'BROADCAST_LIVE',
          message: 'Use End Broadcast for a live broadcast',
        },
      });
    }

    if (broadcast.status === 'completed') {
      return res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: 'A completed broadcast cannot be cancelled',
        },
      });
    }

    if (broadcast.livekitRoomName || broadcast.livekitEgressId || broadcast.livekitIngressId) {
      await flushBroadcastTranscription(broadcastId).catch(() => null);
      await stopLiveResourcesBestEffort({
        broadcastId,
        egressId: broadcast.livekitEgressId,
        ingressId: broadcast.livekitIngressId,
      });
    }

    broadcast.status = 'cancelled';
    broadcast.endedAt = new Date();
    broadcast.listenerCount = 0;
    broadcast.livekitRoomName = null;
    broadcast.livekitEgressId = null;
    broadcast.livekitIngressId = null;
    broadcast.mediaState = 'audio_disconnected';
    broadcast.transcriptState = 'completed';
    broadcast.programTrackSid = null;
    broadcast.programTrackName = null;
    await broadcast.save();

    clearBroadcastPresenceCache(broadcastId);
    await updateStationBestEffort(
      stationIdOf(broadcast),
      { isLive: false, listenerCount: 0 },
      'cancel'
    );
    await releaseLeaseBestEffort(req.userId, broadcastId);
    emitStatus(req, broadcast);

    return res.status(200).json({
      data: broadcast,
      message: 'Broadcast cancelled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function endBroadcast(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await findOwnedBroadcast(broadcastId, req.userId);
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (['completed', 'cancelled'].includes(broadcast.status)) {
      await releaseLeaseBestEffort(req.userId, broadcastId);
      return res.status(200).json({
        data: {
          broadcast,
          message:
            broadcast.status === 'completed'
              ? 'Broadcast already ended successfully'
              : 'Broadcast startup already cancelled',
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (!['starting', 'live', 'ending'].includes(broadcast.status)) {
      return res.status(409).json({
        error: {
          code: 'NOT_LIVE',
          message: 'Broadcast is not currently running',
        },
      });
    }

    const wasLive =
      broadcast.status === 'live' ||
      (broadcast.status === 'ending' && Boolean(broadcast.startedAt));

    if (broadcast.status !== 'ending') {
      broadcast.status = 'ending';
      await broadcast.save();
      clearBroadcastPresenceCache(broadcastId);
      emitStatus(req, broadcast);
    }

    await stopLiveResourcesBestEffort({
      broadcastId,
      egressId: broadcast.livekitEgressId,
      ingressId: broadcast.livekitIngressId,
    });

    // Finalize the authoritative broadcast document before updating the Station
    // snapshot. A transient Station write failure must never leave a successfully
    // ended broadcast stuck forever in `ending`.
    broadcast.status = wasLive ? 'completed' : 'cancelled';
    broadcast.endedAt = broadcast.endedAt || new Date();
    // Scheduled broadcasts are intentionally open-ended. Record their actual
    // end only when the creator ends the live session, preserving older
    // records that already supplied a planned end time.
    broadcast.endTime = broadcast.endTime || broadcast.endedAt;
    broadcast.listenerCount = 0;
    broadcast.livekitRoomName = null;
    broadcast.livekitEgressId = null;
    broadcast.livekitIngressId = null;
    broadcast.mediaState = 'audio_disconnected';
    // Live ends immediately. The durable processing worker owns transcript,
    // replay, highlight, and chapter completion from this point forward.
    broadcast.transcriptState = isTranscriptionConfigured() ? 'reconnecting' : 'disabled';
    broadcast.processingStartedAt = new Date();
    broadcast.assetStatus.audio = 'processing';
    broadcast.assetStatus.transcript = isTranscriptionConfigured() ? 'processing' : 'disabled';
    broadcast.assetStatus.highlights = isTranscriptionConfigured() ? 'pending' : 'failed';
    broadcast.assetStatus.chapters = isTranscriptionConfigured() ? 'pending' : 'failed';
    broadcast.programTrackSid = null;
    broadcast.programTrackName = null;
    await broadcast.save();

    console.info('[Echoo Broadcast] stopped', {
      broadcastId: String(broadcast._id),
      creatorId: String(req.userId),
      status: broadcast.status,
      mediaState: broadcast.mediaState,
    });

    clearBroadcastPresenceCache(broadcastId);
    await updateStationBestEffort(
      stationIdOf(broadcast),
      { isLive: false, listenerCount: 0 },
      'end'
    );
    await releaseLeaseBestEffort(req.userId, broadcastId);
    emitStatus(req, broadcast);

    await enqueueBroadcastProcessing(broadcast._id, {
      transcriptionEnabled: isTranscriptionConfigured(),
    }).catch((error) => {
      console.error('[Echoo Processing] enqueue failed:', {
        broadcastId: String(broadcast._id),
        message: error?.message || error,
      });
    });

    return res.status(200).json({
      data: {
        broadcast,
        message: wasLive
          ? 'Broadcast ended. Recording and transcript processing will continue in the background.'
          : 'Broadcast startup cancelled',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('End broadcast error:', error);
    next(error);
  }
}
