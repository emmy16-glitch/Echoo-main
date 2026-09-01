import { WebhookReceiver } from 'livekit-server-sdk';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import LiveKitProvider from '../providers/livekit.js';
import { stopBroadcastOutputs } from './broadcastOutputService.js';
import { clearBroadcastPresenceCache } from '../controllers/broadcastPresenceController.js';
import { releaseCreatorBroadcastLease } from './creatorBroadcastLease.js';
import { flushBroadcastTranscription } from './transcriptionGateway.js';

const CREATOR_DISCONNECT_GRACE_MS = Math.max(
  5000,
  Math.min(120000, Number(process.env.LIVEKIT_CREATOR_DISCONNECT_GRACE_MS) || 20000)
);
const pendingDisconnects = new Map();
let receiver = null;

const getReceiver = () => {
  if (!receiver) {
    receiver = new WebhookReceiver(
      String(process.env.LIVEKIT_API_KEY || '').trim(),
      String(process.env.LIVEKIT_API_SECRET || '').trim()
    );
  }
  return receiver;
};

const metadataOf = (value) => {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
};

const broadcastIdOf = (event) => {
  const participantMetadata = metadataOf(event?.participant?.metadata);
  const roomMetadata = metadataOf(event?.room?.metadata);
  if (participantMetadata.broadcastId) return String(participantMetadata.broadcastId);
  if (roomMetadata.broadcastId) return String(roomMetadata.broadcastId);
  const roomName = String(event?.room?.name || '');
  return roomName.startsWith('echoo-broadcast-')
    ? roomName.slice('echoo-broadcast-'.length)
    : '';
};

const emitStatus = (io, broadcast) => {
  if (!io || !broadcast) return;
  const payload = {
    broadcastId: String(broadcast._id),
    status: broadcast.status,
    startedAt: broadcast.startedAt || null,
    endedAt: broadcast.endedAt || null,
    listenerCount: Number(broadcast.listenerCount) || 0,
    peakListeners: Number(broadcast.peakListeners) || 0,
    mediaState: broadcast.mediaState || 'waiting_for_creator',
    transcriptState: broadcast.transcriptState || 'disabled',
    programTrackSid: broadcast.programTrackSid || null,
    programTrackName: broadcast.programTrackName || null,
  };
  io.to(`broadcast:${broadcast._id}`).emit('broadcast:status', payload);
  if (broadcast.status === 'live') io.to(`broadcast:${broadcast._id}`).emit('broadcast_started', payload);
  if (['completed', 'cancelled', 'failed'].includes(broadcast.status)) {
    io.to(`broadcast:${broadcast._id}`).emit('broadcast_ended', payload);
  }
  if (broadcast.isPublic) io.emit('catalog:changed', { entity: 'broadcast', action: 'status', ...payload });
};

const creatorStillPresent = async (broadcast) => {
  const participants = await LiveKitProvider.getParticipants(broadcast._id);
  return participants.some((participant) => {
    const metadata = metadataOf(participant.metadata);
    return metadata.role === 'creator' && String(metadata.userId) === String(broadcast.creator);
  });
};

const updateCreatorMediaState = async (broadcastId, update, io, { preserveLive = false } = {}) => {
  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: broadcastId,
      status: { $in: ['starting', 'live', 'ending'] },
      isDeleted: false,
      ...(preserveLive ? { mediaState: { $ne: 'audio_live' } } : {}),
    },
    { $set: update },
    { returnDocument: 'after' }
  );
  if (!broadcast) return null;
  clearBroadcastPresenceCache(broadcastId);
  emitStatus(io, broadcast);
  return broadcast;
};

const endDisconnectedBroadcast = async (broadcastId, io) => {
  pendingDisconnects.delete(String(broadcastId));
  const current = await Broadcast.findOne({
    _id: broadcastId,
    status: 'live',
    isDeleted: false,
  });
  // A LiveKit control-plane lookup failure is not evidence that the creator
  // disappeared. Keep the broadcast live and let a later webhook/operator
  // action retry rather than ending a healthy show on an infrastructure blip.
  if (!current || await creatorStillPresent(current).catch(() => true)) return;

  const broadcast = await Broadcast.findOneAndUpdate(
    { _id: current._id, status: 'live', isDeleted: false },
    { $set: { status: 'ending', failureReason: 'Creator disconnected from LiveKit' } },
    { returnDocument: 'after' }
  );
  if (!broadcast) return;

  clearBroadcastPresenceCache(broadcast._id);
  emitStatus(io, broadcast);
  await flushBroadcastTranscription(broadcast._id).catch(() => null);
  if (broadcast.livekitIngressId) {
    await LiveKitProvider.stopIngress(broadcast.livekitIngressId).catch(() => null);
  }
  if (broadcast.livekitEgressId) {
    await LiveKitProvider.stopEgress(broadcast.livekitEgressId).catch(() => null);
  }
  await stopBroadcastOutputs(String(broadcast._id), { incomplete: true }).catch((error) => {
    console.warn('[Echoo Outputs] LiveKit-disconnect cleanup warning:', error?.message || error);
  });
  await LiveKitProvider.endRoom(broadcast._id).catch(() => null);

  broadcast.status = 'completed';
  broadcast.endedAt = new Date();
  broadcast.listenerCount = 0;
  broadcast.livekitRoomName = null;
  broadcast.livekitIngressId = null;
  broadcast.livekitEgressId = null;
  broadcast.mediaState = 'audio_disconnected';
  broadcast.transcriptState = 'completed';
  broadcast.programTrackSid = null;
  broadcast.programTrackName = null;
  await broadcast.save();
  await Station.updateOne(
    { _id: broadcast.station },
    { $set: { isLive: false, listenerCount: 0 } }
  ).catch(() => null);
  await releaseCreatorBroadcastLease(broadcast.creator, broadcast._id).catch(() => null);
  clearBroadcastPresenceCache(broadcast._id);
  emitStatus(io, broadcast);
};

const scheduleCreatorDisconnect = (broadcastId, io) => {
  const key = String(broadcastId || '');
  if (!key || pendingDisconnects.has(key)) return;
  const timer = setTimeout(() => {
    void endDisconnectedBroadcast(key, io).catch((error) => {
      console.warn('LiveKit creator disconnect cleanup warning:', error?.message || error);
    });
  }, CREATOR_DISCONNECT_GRACE_MS);
  timer.unref?.();
  pendingDisconnects.set(key, timer);
};

const cancelCreatorDisconnect = (broadcastId) => {
  const key = String(broadcastId || '');
  const timer = pendingDisconnects.get(key);
  if (timer) clearTimeout(timer);
  pendingDisconnects.delete(key);
};

export async function handleLiveKitWebhook(req, res) {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const event = await getReceiver().receive(rawBody, req.headers.authorization);
    const metadata = metadataOf(event?.participant?.metadata);
    const broadcastId = broadcastIdOf(event);
    const isCreator = metadata.role === 'creator';

    if (broadcastId && isCreator && event.event === 'participant_left') {
      await updateCreatorMediaState(broadcastId, { mediaState: 'audio_disconnected' }, req.app.get('io'));
      scheduleCreatorDisconnect(broadcastId, req.app.get('io'));
    }
    if (broadcastId && isCreator && event.event === 'participant_joined') {
      cancelCreatorDisconnect(broadcastId);
      await updateCreatorMediaState(
        broadcastId,
        { mediaState: 'creator_connecting' },
        req.app.get('io'),
        { preserveLive: true }
      );
    }
    const trackName = String(event?.track?.name || '').trim().toLowerCase();
    if (broadcastId && isCreator && event.event === 'track_published' && trackName === 'echoo-studio-mix') {
      await updateCreatorMediaState(broadcastId, {
        mediaState: 'audio_live',
        programTrackSid: event.track?.sid || null,
        programTrackName: event.track?.name || 'echoo-studio-mix',
      }, req.app.get('io'));
      console.info('[Echoo LiveKit Webhook] creator program track published', {
        broadcastId,
        trackSid: event.track?.sid || null,
        trackName: event.track?.name || null,
      });
    }
    if (broadcastId && isCreator && event.event === 'track_unpublished' && trackName === 'echoo-studio-mix') {
      await updateCreatorMediaState(broadcastId, {
        mediaState: 'audio_disconnected',
        programTrackSid: null,
        programTrackName: null,
      }, req.app.get('io'));
    }
    return res.status(204).end();
  } catch (error) {
    console.warn('Rejected LiveKit webhook:', error?.message || error);
    return res.status(401).json({
      error: { code: 'INVALID_LIVEKIT_WEBHOOK', message: 'Invalid LiveKit webhook' },
    });
  }
}

export function clearLiveKitWebhookTimers() {
  for (const timer of pendingDisconnects.values()) clearTimeout(timer);
  pendingDisconnects.clear();
}

export default { handleLiveKitWebhook, clearLiveKitWebhookTimers };
