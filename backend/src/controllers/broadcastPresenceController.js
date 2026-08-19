import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import LiveKitProvider from '../providers/livekit.js';

const clampNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

// Presence is requested by every live-room client. Without a short cache, a
// burst of listeners can turn one LiveKit participant change into dozens of
// identical listParticipants calls and Mongo writes. Keep LiveKit as the source
// of truth while coalescing concurrent reads for a very small window.
const PRESENCE_CACHE_MS = clampNumber(
  process.env.LIVE_PRESENCE_CACHE_MS,
  1500,
  500,
  5000
);
const PRESENCE_DB_SYNC_MS = clampNumber(
  process.env.LIVE_PRESENCE_DB_SYNC_MS,
  5000,
  1000,
  30000
);

const cache = new Map();
const inflight = new Map();
const lastPersistedAt = new Map();

const now = () => Date.now();

const cachedValue = (broadcastId) => {
  const entry = cache.get(String(broadcastId));
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    cache.delete(String(broadcastId));
    return null;
  }
  return entry.value;
};

const remember = (broadcastId, value) => {
  cache.set(String(broadcastId), {
    value,
    expiresAt: now() + PRESENCE_CACHE_MS,
  });
  return value;
};

const parseParticipantMetadata = (participant) => {
  try {
    return participant?.metadata ? JSON.parse(participant.metadata) : {};
  } catch {
    return {};
  }
};

const persistPresenceIfNeeded = ({ broadcast, listenerCount, peakListeners }) => {
  const broadcastId = String(broadcast._id);
  const changed =
    Number(broadcast.listenerCount || 0) !== listenerCount ||
    Number(broadcast.peakListeners || 0) !== peakListeners;

  if (!changed) return;

  const previous = lastPersistedAt.get(broadcastId) || 0;
  if (now() - previous < PRESENCE_DB_SYNC_MS) return;
  lastPersistedAt.set(broadcastId, now());

  // Do not hold the listener HTTP response open on analytics persistence. The
  // authoritative count remains LiveKit; these fields are dashboard snapshots.
  Promise.all([
    Broadcast.updateOne(
      { _id: broadcast._id },
      { $set: { listenerCount, peakListeners } }
    ),
    Station.updateOne(
      { _id: broadcast.station },
      { $set: { listenerCount } }
    ),
  ]).catch((error) => {
    console.warn(
      'Presence snapshot persistence warning:',
      error?.message || error
    );
  });
};

const resolvePresence = async (broadcastId) => {
  const existing = cachedValue(broadcastId);
  if (existing) return existing;

  const key = String(broadcastId);
  if (inflight.has(key)) return inflight.get(key);

  const request = (async () => {
    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      isDeleted: false,
      isPublic: true,
    }).select(
      '_id station status listenerCount peakListeners livekitRoomName'
    );

    if (!broadcast) {
      const error = new Error('Broadcast not found');
      error.code = 'NOT_FOUND';
      error.status = 404;
      throw error;
    }

    if (!['starting', 'live'].includes(broadcast.status)) {
      return remember(key, {
        broadcastId: key,
        listenerCount: 0,
        peakListeners: Number(broadcast.peakListeners || 0),
        creatorConnected: false,
      });
    }

    const participants = await LiveKitProvider.getParticipants(broadcastId);
    let creatorConnected = false;
    let listenerCount = 0;

    for (const participant of participants) {
      const metadata = parseParticipantMetadata(participant);
      if (metadata.role === 'creator') creatorConnected = true;
      else listenerCount += 1;
    }

    const peakListeners = Math.max(
      Number(broadcast.peakListeners || 0),
      listenerCount
    );

    persistPresenceIfNeeded({ broadcast, listenerCount, peakListeners });

    return remember(key, {
      broadcastId: key,
      listenerCount,
      peakListeners,
      creatorConnected,
    });
  })();

  inflight.set(key, request);

  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
};

export async function getBroadcastPresenceCached(req, res, next) {
  try {
    const { broadcastId } = req.params;
    if (!mongoose.isValidObjectId(broadcastId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_BROADCAST_ID',
          message: 'Invalid broadcast ID',
        },
      });
    }

    const data = await resolvePresence(broadcastId);
    return res.status(200).json({
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error?.status === 404 || error?.code === 'NOT_FOUND') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' },
      });
    }
    next(error);
  }
}

export function clearBroadcastPresenceCache(broadcastId) {
  const key = String(broadcastId || '');
  if (!key) return;
  cache.delete(key);
  inflight.delete(key);
  lastPersistedAt.delete(key);
}
