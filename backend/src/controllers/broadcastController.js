import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import User from '../models/User.js';
import LiveKitProvider from '../providers/livekit.js';
import OvenMediaProvider from '../providers/ovenmedia.js';

function broadcastPopulate(query) {
  return query
    .populate(
      'station',
      'name slug coverArt category isLive listenerCount followerCount'
    )
    .populate(
      'creator',
      'username displayName avatar'
    )
    .populate('replayAudio', 'title duration coverArt isPublic isDeleted');
}

function isValidId(value) {
  return mongoose.isValidObjectId(value);
}

function invalidId(res) {
  return res.status(400).json({
    error: {
      code: 'INVALID_BROADCAST_ID',
      message: 'Invalid broadcast ID',
    },
  });
}

function mediaRelayMode() {
  return String(
    process.env.MEDIA_RELAY_MODE || 'livekit-only'
  ).toLowerCase();
}

function publicLiveKitUrl() {
  return LiveKitProvider.getPublicUrl();
}

const AUDIO_SOURCE_TYPES = new Set([
  'microphone', 'guest_microphone', 'music', 'screen_share', 'system_audio',
]);

const clamp = (value, minimum, maximum, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
};

const sanitizeAudioConfiguration = (value = {}) => ({
  audioMode: value.audioMode === 'raw' ? 'raw' : 'enhanced',
  noiseReduction: clamp(value.noiseReduction, 0, 1, 0.45),
  echoRemoval: value.echoRemoval !== false,
  voiceWarmth: clamp(value.voiceWarmth, 0, 1, 0.35),
  voiceClarity: clamp(value.voiceClarity, 0, 1, 0.45),
  deEsser: clamp(value.deEsser, 0, 1, 0.3),
  volumeBalance: clamp(value.volumeBalance, 0, 1, 0.45),
  protectLoudSounds: value.protectLoudSounds !== false,
  masterVolume: clamp(value.masterVolume, 0, 1.5, 1),
});

const sanitizeAudioSources = (sources) => (Array.isArray(sources) ? sources : [])
  .filter((source) => AUDIO_SOURCE_TYPES.has(source?.type))
  .slice(0, 8)
  .map((source) => ({
    type: source.type,
    status: ['active', 'inactive', 'muted'].includes(source.status) ? source.status : 'inactive',
    label: String(source.label || '').trim().slice(0, 80),
    gain: clamp(source.gain, 0, 1.5, 1),
  }));

function emitStatus(req, broadcast) {
  const io = req.app.get('io');
  if (!io) return;

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

  io.to(`broadcast:${broadcast.id || broadcast._id}`).emit('broadcast:status', payload);
  if (broadcast.status === 'live') io.to(`broadcast:${broadcast.id || broadcast._id}`).emit('broadcast_started', payload);
  if (['completed', 'cancelled', 'failed'].includes(broadcast.status)) {
    io.to(`broadcast:${broadcast.id || broadcast._id}`).emit('broadcast_ended', payload);
  }

  if (broadcast.isPublic !== false) {
    io.emit('catalog:changed', {
      entity: 'broadcast',
      action: 'status',
      ...payload,
    });
  }
}

async function findOwnedBroadcast(broadcastId, userId) {
  if (!isValidId(broadcastId)) return null;

  return Broadcast.findOne({
    _id: broadcastId,
    creator: userId,
    isDeleted: false,
  });
}

export async function createBroadcast(req, res, next) {
  try {
    const userId = req.userId;
    const {
      title,
      description = '',
      stationId,
      station: stationFromBody,
      startTime,
      endTime,
      type = 'live',
      isRecurring = false,
      recurrencePattern,
      recurrenceDays = [],
      coverArt = null,
      tags = [],
      isPublic = true,
      notes = '',
      captionSettings = {},
      audioConfiguration = {},
      audioSources = [],
    } = req.body;

    const resolvedStationId = stationId || stationFromBody;

    if (!title || !resolvedStationId || !startTime || !endTime) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'title, stationId, startTime and endTime are required',
        },
      });
    }

    if (!mongoose.isValidObjectId(resolvedStationId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_STATION_ID',
          message: 'Invalid station ID',
        },
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE',
          message: 'startTime and endTime must be valid dates',
        },
      });
    }

    if (end <= start) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'endTime must be after startTime',
        },
      });
    }

    const station = await Station.findOne({
      _id: resolvedStationId,
      isDeleted: false,
    });

    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' },
      });
    }

    if (String(station.owner) !== String(userId)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not own this station',
        },
      });
    }

    const broadcast = new Broadcast({
      title: String(title).trim(),
      description,
      station: station._id,
      creator: userId,
      startTime: start,
      endTime: end,
      status: 'scheduled',
      type,
      isRecurring,
      recurrencePattern,
      recurrenceDays: Array.isArray(recurrenceDays) ? recurrenceDays : [],
      coverArt,
      tags: Array.isArray(tags) ? tags : [],
      isPublic: isPublic !== false,
      visibility: isPublic !== false ? 'public' : 'private',
      assetVisibility: { audio: 'private', transcript: 'private' },
      notes,
      captionSettings: {
        showToListeners: false,
        language: ['en', 'yo', 'pcm', 'ha'].includes(captionSettings.language)
          ? captionSettings.language
          : 'en',
        autoPublishCorrections: captionSettings.autoPublishCorrections !== false,
        delayMs: Math.max(0, Math.min(10000, Number(captionSettings.delayMs) || 0)),
      },
      audioConfiguration: sanitizeAudioConfiguration(audioConfiguration),
      audioSources: sanitizeAudioSources(audioSources),
    });

    await broadcast.save();

    const populated = await broadcastPopulate(
      Broadcast.findById(broadcast._id)
    );

    return res.status(201).json({
      data: populated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getBroadcasts(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      stationId,
      status,
      startDate,
      endDate,
      search,
      type,
      isRecurring,
    } = req.query;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const filter = {
      isDeleted: false,
      isPublic: true,
    };

    if (stationId) filter.station = stationId;
    if (status) filter.status = status;
    if (type) filter.type = type;

    if (isRecurring === 'true' || isRecurring === 'false') {
      filter.isRecurring = isRecurring === 'true';
    }

    if (startDate || endDate) {
      filter.startTime = {};
      if (startDate) filter.startTime.$gte = new Date(startDate);
      if (endDate) filter.startTime.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (safePage - 1) * safeLimit;

    const broadcasts = await broadcastPopulate(
      Broadcast.find(filter)
        .sort({ startTime: 1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
    );

    const total = await Broadcast.countDocuments(filter);

    return res.status(200).json({
      data: broadcasts,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getCreatorBroadcasts(req, res, next) {
  try {
    const broadcasts = await broadcastPopulate(
      Broadcast.find({
        creator: req.userId,
        isDeleted: false,
      }).sort({ startTime: 1, createdAt: -1 })
    );

    return res.status(200).json({
      data: broadcasts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getBroadcastById(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await broadcastPopulate(
      Broadcast.findOne({
        _id: broadcastId,
        isDeleted: false,
      })
    );

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    const ownerId = broadcast.creator?._id || broadcast.creator;
    if (!broadcast.isPublic && String(ownerId) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'This broadcast is private' },
      });
    }

    return res.status(200).json({
      data: broadcast,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateBroadcast(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await findOwnedBroadcast(broadcastId, req.userId);

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    const allowed = [
      'title',
      'description',
      'startTime',
      'endTime',
      'type',
      'isRecurring',
      'recurrencePattern',
      'recurrenceDays',
      'coverArt',
      'tags',
      'isPublic',
      'notes',
    ];

    const protectedWhileRunning = new Set([
      'startTime',
      'endTime',
      'type',
      'isRecurring',
      'recurrencePattern',
      'recurrenceDays',
    ]);

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;

      if (
        ['starting', 'live', 'ending'].includes(broadcast.status) &&
        protectedWhileRunning.has(field)
      ) {
        return res.status(409).json({
          error: {
            code: 'BROADCAST_RUNNING',
            message: `Cannot change ${field} while the broadcast is running`,
          },
        });
      }

      broadcast[field] = req.body[field];
    }

    if (req.body.captionSettings && typeof req.body.captionSettings === 'object') {
      const nextCaptionSettings = req.body.captionSettings;
      broadcast.captionSettings = {
        ...broadcast.captionSettings?.toObject?.(),
        showToListeners: false,
        language: ['en', 'yo', 'pcm', 'ha'].includes(nextCaptionSettings.language)
          ? nextCaptionSettings.language
          : broadcast.captionSettings?.language || 'en',
        autoPublishCorrections: nextCaptionSettings.autoPublishCorrections !== false,
        delayMs: Math.max(0, Math.min(10000, Number(nextCaptionSettings.delayMs) || 0)),
      };
    }

    if (req.body.audioConfiguration && typeof req.body.audioConfiguration === 'object') {
      broadcast.audioConfiguration = sanitizeAudioConfiguration(req.body.audioConfiguration);
    }
    if (req.body.audioSources !== undefined) {
      broadcast.audioSources = sanitizeAudioSources(req.body.audioSources);
    }

    if (
      broadcast.startTime &&
      broadcast.endTime &&
      new Date(broadcast.endTime) <= new Date(broadcast.startTime)
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DATE_RANGE',
          message: 'endTime must be after startTime',
        },
      });
    }

    await broadcast.save();

    const populated = await broadcastPopulate(
      Broadcast.findById(broadcast._id)
    );

    return res.status(200).json({
      data: populated,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteBroadcast(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await findOwnedBroadcast(broadcastId, req.userId);

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (['starting', 'live', 'ending'].includes(broadcast.status)) {
      return res.status(409).json({
        error: {
          code: 'BROADCAST_RUNNING',
          message: 'End or cancel the broadcast before deleting it',
        },
      });
    }

    broadcast.isDeleted = true;
    await broadcast.save();

    return res.status(200).json({
      data: { message: 'Broadcast deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
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

    if (broadcast.status === 'live' || broadcast.status === 'ending') {
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

    if (broadcast.livekitEgressId) {
      await LiveKitProvider.stopEgress(broadcast.livekitEgressId).catch(() => null);
    }

    if (broadcast.livekitRoomName) {
      await LiveKitProvider.endRoom(broadcastId).catch(() => null);
    }

    broadcast.status = 'cancelled';
    broadcast.endedAt = new Date();
    broadcast.listenerCount = 0;
    await broadcast.save();

    await Station.findByIdAndUpdate(broadcast.station, {
      isLive: false,
      listenerCount: 0,
    });

    emitStatus(req, broadcast);

    return res.status(200).json({
      data: broadcast,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getUpcomingBroadcasts(req, res, next) {
  try {
    const { stationId } = req.params;

    const broadcasts = await broadcastPopulate(
      Broadcast.find({
        station: stationId,
        status: 'scheduled',
        startTime: { $gte: new Date() },
        isDeleted: false,
        isPublic: true,
      })
        .sort({ startTime: 1 })
        .limit(100)
    );

    return res.status(200).json({
      data: broadcasts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getLiveBroadcast(req, res, next) {
  try {
    const { stationId } = req.params;

    const broadcast = await broadcastPopulate(
      Broadcast.findOne({
        station: stationId,
        status: 'live',
        isDeleted: false,
        isPublic: true,
      }).sort({ startedAt: -1, startTime: -1 })
    );

    return res.status(200).json({
      data: broadcast || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function startBroadcast(req, res, next) {
  let broadcast = null;

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

    if (!['scheduled', 'draft', 'failed'].includes(broadcast.status)) {
      return res.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: `Cannot start a broadcast with status ${broadcast.status}`,
        },
      });
    }

    broadcast.status = 'starting';
    broadcast.failureReason = null;
    broadcast.startedAt = null;
    broadcast.endedAt = null;
    broadcast.listenerCount = 0;
    broadcast.livekitEgressId = null;
    broadcast.livekitRoomName = null;
    await broadcast.save();

    const room = await LiveKitProvider.createRoom(broadcastId);
    const user = await User.findById(req.userId);
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
      broadcast.livekitEgressId = egress.egressId;
      playbackUrls = OvenMediaProvider.getPlaybackUrls(broadcastId);
    }

    broadcast.livekitRoomName = room.name;
    await broadcast.save();

    emitStatus(req, broadcast);

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
      message: 'Broadcast room is ready. Publish audio, then confirm live.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Start broadcast error:', error);

    if (broadcast) {
      broadcast.status = 'failed';
      broadcast.failureReason = error.message || 'Unknown error during start';
      await broadcast.save().catch(() => null);
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
      return res.status(200).json({
        data: broadcast,
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

    const participants = await LiveKitProvider.getParticipants(broadcastId);
    const creatorPresent = participants.some(
      (participant) => String(participant.identity) === String(req.userId)
    );

    if (!creatorPresent) {
      return res.status(409).json({
        error: {
          code: 'CREATOR_NOT_CONNECTED',
          message: 'Creator has not connected to the LiveKit room yet',
        },
      });
    }

    broadcast.status = 'live';
    broadcast.startedAt = new Date();
    broadcast.failureReason = null;
    await broadcast.save();

    await Station.findByIdAndUpdate(broadcast.station, {
      isLive: true,
      listenerCount: 0,
    });

    emitStatus(req, broadcast);

    return res.status(200).json({
      data: broadcast,
      message: 'Broadcast is live',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
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

    const user = await User.findById(req.userId);
    const token = await LiveKitProvider.generateCreatorToken(
      broadcastId,
      req.userId,
      user?.displayName || user?.username || 'Echoo Creator'
    );

    return res.status(200).json({
      data: {
        token,
        roomName: broadcast.livekitRoomName || LiveKitProvider.getRoomName(broadcastId),
        livekitUrl: publicLiveKitUrl(),
        broadcastId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getListenerLiveKitToken(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      isDeleted: false,
    }).select('_id status isPublic livekitRoomName');

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (broadcast.status !== 'live') {
      return res.status(409).json({
        error: {
          code: 'BROADCAST_NOT_LIVE',
          message: 'This broadcast is not live',
        },
      });
    }

    if (!broadcast.isPublic) {
      return res.status(403).json({
        error: { code: 'BROADCAST_PRIVATE', message: 'This broadcast is private' },
      });
    }

    if (!broadcast.livekitRoomName) {
      return res.status(409).json({
        error: {
          code: 'LIVEKIT_ROOM_UNAVAILABLE',
          message: 'The live audio room is not ready',
        },
      });
    }

    const token = await LiveKitProvider.generateListenerToken(
      broadcastId,
      req.userId,
      req.user?.displayName || req.user?.username || 'Echoo Listener'
    );

    return res.status(200).json({
      data: {
        token,
        roomName: broadcast.livekitRoomName,
        livekitUrl: publicLiveKitUrl(),
        broadcastId: String(broadcast._id),
        mediaMode: 'livekit-direct',
        role: 'listener',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getBroadcastPresence(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      isDeleted: false,
      isPublic: true,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (!['starting', 'live'].includes(broadcast.status)) {
      return res.status(200).json({
        data: {
          broadcastId,
          listenerCount: 0,
          peakListeners: Number(broadcast.peakListeners || 0),
          creatorConnected: false,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const participants = await LiveKitProvider.getParticipants(broadcastId);

    let creatorConnected = false;
    let listenerCount = 0;

    for (const participant of participants) {
      let metadata = {};
      try {
        metadata = participant.metadata ? JSON.parse(participant.metadata) : {};
      } catch {
        metadata = {};
      }

      if (metadata.role === 'creator') {
        creatorConnected = true;
      } else if (metadata.role !== 'prerecorded-ingest') {
        // Prerecorded broadcasts publish program audio through a LiveKit
        // URL-input ingress participant; it is not a human listener and must
        // not inflate the displayed listener count.
        listenerCount += 1;
      }
    }

    const peakListeners = Math.max(
      Number(broadcast.peakListeners || 0),
      listenerCount
    );

    if (
      Number(broadcast.listenerCount || 0) !== listenerCount ||
      Number(broadcast.peakListeners || 0) !== peakListeners
    ) {
      broadcast.listenerCount = listenerCount;
      broadcast.peakListeners = peakListeners;
      await broadcast.save();

      await Station.findByIdAndUpdate(broadcast.station, {
        listenerCount,
      });
    }

    return res.status(200).json({
      data: {
        broadcastId,
        listenerCount,
        peakListeners,
        creatorConnected,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlaybackInfo(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!isValidId(broadcastId)) return invalidId(res);

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      isDeleted: false,
      isPublic: true,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }

    if (broadcast.status !== 'live') {
      return res.status(409).json({
        error: { code: 'NOT_LIVE', message: 'Broadcast is not live' },
      });
    }

    const liveKitOnly = mediaRelayMode() === 'livekit-only';
    const playbackUrls = liveKitOnly
      ? null
      : OvenMediaProvider.getPlaybackUrls(broadcastId);

    return res.status(200).json({
      data: {
        broadcastId,
        status: broadcast.status,
        mediaMode: liveKitOnly ? 'livekit-direct' : 'livekit-ome',
        playbackUrls,
        startedAt: broadcast.startedAt,
        title: broadcast.title,
        station: broadcast.station,
      },
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

    if (!['starting', 'live'].includes(broadcast.status)) {
      return res.status(409).json({
        error: {
          code: 'NOT_LIVE',
          message: 'Broadcast is not currently running',
        },
      });
    }

    const wasLive = broadcast.status === 'live';
    broadcast.status = 'ending';
    await broadcast.save();

    if (broadcast.livekitEgressId) {
      await LiveKitProvider.stopEgress(broadcast.livekitEgressId).catch(() => null);
    }

    // Prerecorded broadcasts publish through a LiveKit URL-input ingress that
    // must be torn down alongside the room, otherwise the input keeps pulling
    // the signed audio stream until its own timeout.
    if (broadcast.livekitIngressId) {
      await LiveKitProvider.stopIngress(broadcast.livekitIngressId).catch(() => null);
      broadcast.livekitIngressId = null;
    }

    await LiveKitProvider.endRoom(broadcastId).catch(() => null);

    await Station.findByIdAndUpdate(broadcast.station, {
      isLive: false,
      listenerCount: 0,
    });

    broadcast.status = wasLive ? 'completed' : 'cancelled';
    broadcast.endedAt = new Date();
    broadcast.listenerCount = 0;
    await broadcast.save();

    emitStatus(req, broadcast);

    return res.status(200).json({
      data: {
        broadcast,
        message: wasLive
          ? 'Broadcast ended successfully'
          : 'Broadcast startup cancelled',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('End broadcast error:', error);
    next(error);
  }
}
