import { WebhookReceiver } from 'livekit-server-sdk';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import LiveKitProvider from '../providers/livekit.js';
import { waitForCreatorProgramAudio } from './broadcastAudioReadiness.js';
import { stopBroadcastOutputs } from './broadcastOutputService.js';
import { clearBroadcastPresenceCache } from '../controllers/broadcastPresenceController.js';
import { releaseCreatorBroadcastLease } from './creatorBroadcastLease.js';
import {
  flushBroadcastTranscription,
  isTranscriptionConfigured,
} from './transcriptionGateway.js';
import {
  ensureLiveKitServerRecording,
  isLiveKitServerRecordingEnabled,
  stopLiveKitServerRecording,
} from './livekitServerRecording.js';
import {
  creatorRecoveryExpired,
  getCreatorDisconnectGraceMs,
  getCreatorRecoveryMaxMs,
} from './liveBroadcastRecoveryPolicy.js';

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
    mediaDisconnectedAt: broadcast.mediaDisconnectedAt || null,
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

const clearCreatorProgramTrackIfCurrent = async (broadcastId, trackSid, io) => {
  const sid = String(trackSid || '').trim();
  if (!sid) return null;
  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: broadcastId,
      status: { $in: ['starting', 'live', 'ending'] },
      isDeleted: false,
      programTrackSid: sid,
    },
    {
      $set: {
        mediaState: 'audio_disconnected',
        mediaDisconnectedAt: new Date(),
        programTrackSid: null,
        programTrackName: null,
      },
    },
    { returnDocument: 'after' }
  );
  if (!broadcast) return null;
  clearBroadcastPresenceCache(broadcastId);
  emitStatus(io, broadcast);
  return broadcast;
};

const reconcileCreatorProgram = async (broadcast, io) => {
  try {
    const publisher = await waitForCreatorProgramAudio(
      broadcast._id,
      broadcast.creator,
      { maxAttempts: 1, initialDelayMs: 0, delayStepMs: 0 }
    );

    const recovered = await updateCreatorMediaState(
      broadcast._id,
      {
        mediaState: 'audio_live',
        mediaDisconnectedAt: null,
        programTrackSid: publisher.trackSid || null,
        programTrackName: publisher.trackName || 'echoo-studio-mix',
      },
      io
    );

    if (
      recovered &&
      isLiveKitServerRecordingEnabled() &&
      publisher.trackSid
    ) {
      void ensureLiveKitServerRecording({
        broadcastId: String(broadcast._id),
        trackSid: publisher.trackSid,
      }).catch((recordingError) => {
        console.warn(
          '[Echoo Server Recording] recovery reconciliation warning:',
          recordingError?.message || recordingError
        );
      });
    }
    return true;
  } catch (error) {
    if (error?.code === 'CREATOR_AUDIO_NOT_PUBLISHED') return false;
    // A LiveKit control-plane failure is not proof that the creator is gone.
    // Preserve the logical broadcast and retry the reconciliation later.
    return null;
  }
};

const endDisconnectedBroadcast = async (broadcastId, io) => {
  const key = String(broadcastId || '');
  pendingDisconnects.delete(key);

  const current = await Broadcast.findOne({
    _id: broadcastId,
    status: 'live',
    isDeleted: false,
  });
  if (!current) return;

  const programRecovered = await reconcileCreatorProgram(current, io);
  if (programRecovered === true) return;

  let disconnectedAt = current.mediaDisconnectedAt || null;
  if (!disconnectedAt) {
    disconnectedAt = new Date();
    const marked = await updateCreatorMediaState(
      current._id,
      {
        mediaState: 'audio_disconnected',
        mediaDisconnectedAt: disconnectedAt,
      },
      io
    );
    if (!marked) return;
  }

  const maxRecoveryMs = getCreatorRecoveryMaxMs();
  if (
    programRecovered === null ||
    !creatorRecoveryExpired({ disconnectedAt, maxMs: maxRecoveryMs })
  ) {
    const elapsed = Math.max(0, Date.now() - new Date(disconnectedAt).getTime());
    const remaining = Math.max(5_000, maxRecoveryMs - elapsed);
    // Reconcile at least once a minute. This recovers even when a LiveKit
    // track_published webhook is delayed/lost, without coupling the logical
    // show lifetime to one participant or one WebSocket.
    scheduleCreatorDisconnect(
      key,
      io,
      Math.min(60_000, remaining)
    );
    return;
  }

  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: current._id,
      status: 'live',
      isDeleted: false,
      mediaDisconnectedAt: disconnectedAt,
    },
    {
      $set: {
        status: 'ending',
        failureReason: 'Creator media recovery window expired',
      },
    },
    { returnDocument: 'after' }
  );
  if (!broadcast) return;

  clearBroadcastPresenceCache(broadcast._id);
  emitStatus(io, broadcast);
  if (isTranscriptionConfigured()) {
    await flushBroadcastTranscription(broadcast._id).catch(() => null);
  }
  if (broadcast.livekitIngressId) {
    await LiveKitProvider.stopIngress(broadcast.livekitIngressId).catch(() => null);
  }
  await stopLiveKitServerRecording(String(broadcast._id)).catch((error) => {
    console.warn('[Echoo Server Recording] expired-recovery cleanup warning:', error?.message || error);
  });
  if (broadcast.livekitEgressId) {
    await LiveKitProvider.stopEgress(broadcast.livekitEgressId).catch(() => null);
  }
  await stopBroadcastOutputs(String(broadcast._id), { incomplete: true }).catch((error) => {
    console.warn('[Echoo Outputs] expired-recovery cleanup warning:', error?.message || error);
  });
  await LiveKitProvider.endRoom(broadcast._id).catch(() => null);

  broadcast.status = 'completed';
  broadcast.endedAt = new Date();
  broadcast.listenerCount = 0;
  broadcast.livekitRoomName = null;
  broadcast.livekitIngressId = null;
  broadcast.livekitEgressId = null;
  broadcast.mediaState = 'audio_disconnected';
  broadcast.transcriptState = isTranscriptionConfigured() ? 'completed' : 'disabled';
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

const scheduleCreatorDisconnect = (
  broadcastId,
  io,
  delayMs = getCreatorDisconnectGraceMs()
) => {
  const key = String(broadcastId || '');
  if (!key || pendingDisconnects.has(key)) return;
  const delay = Math.max(
    5_000,
    Math.min(getCreatorRecoveryMaxMs(), Number(delayMs) || getCreatorDisconnectGraceMs())
  );
  const timer = setTimeout(() => {
    void endDisconnectedBroadcast(key, io).catch((error) => {
      console.warn('LiveKit creator recovery reconciliation warning:', error?.message || error);
    });
  }, delay);
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
      // Participant identity is transport state, not broadcast authority.
      // Mark a real absence but keep the logical show recoverable.
      scheduleCreatorDisconnect(broadcastId, req.app.get('io'));
      const current = await Broadcast.findOne({
        _id: broadcastId,
        status: { $in: ['starting', 'live', 'ending'] },
        isDeleted: false,
      });
      const replacementPresent = current
        ? await creatorStillPresent(current).catch(() => true)
        : true;
      if (!replacementPresent) {
        await updateCreatorMediaState(
          broadcastId,
          {
            mediaState: 'audio_disconnected',
            mediaDisconnectedAt: current?.mediaDisconnectedAt || new Date(),
          },
          req.app.get('io')
        );
      }
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
      cancelCreatorDisconnect(broadcastId);
      await updateCreatorMediaState(broadcastId, {
        mediaState: 'audio_live',
        mediaDisconnectedAt: null,
        programTrackSid: event.track?.sid || null,
        programTrackName: event.track?.name || 'echoo-studio-mix',
      }, req.app.get('io'));

      if (isLiveKitServerRecordingEnabled() && event.track?.sid) {
        void ensureLiveKitServerRecording({
          broadcastId,
          trackSid: event.track.sid,
        }).catch((recordingError) => {
          console.warn(
            '[Echoo Server Recording] track republish recorder warning:',
            recordingError?.message || recordingError
          );
        });
      }

      console.info('[Echoo LiveKit Webhook] creator program track published', {
        broadcastId,
        trackSid: event.track?.sid || null,
        trackName: event.track?.name || null,
      });
    }
    if (broadcastId && isCreator && event.event === 'track_unpublished' && trackName === 'echoo-studio-mix') {
      // Webhook delivery can be reordered around a fast creator recovery.
      // Only clear the program if the unpublished SID is still canonical.
      const cleared = await clearCreatorProgramTrackIfCurrent(
        broadcastId,
        event.track?.sid,
        req.app.get('io')
      );
      if (cleared) {
        scheduleCreatorDisconnect(broadcastId, req.app.get('io'));
      }
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
