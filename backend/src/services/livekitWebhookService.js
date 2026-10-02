import { WebhookReceiver } from 'livekit-server-sdk';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import LiveKitProvider from '../providers/livekit.js';
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
import { getCreatorProgramAudio } from './broadcastAudioReadiness.js';

// LiveKit participant presence is transport state, not broadcast authority.
// Keep a disconnected live broadcast recoverable for a full long-show window
// before terminal cleanup. Rejoining cancels this timer immediately.
const rawCreatorRecoveryHours = Number(
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS || 24
);
const creatorRecoveryHours =
  Number.isFinite(rawCreatorRecoveryHours) && rawCreatorRecoveryHours > 0
    ? Math.max(1, Math.min(48, rawCreatorRecoveryHours))
    : 24;
const CREATOR_RECOVERY_TTL_MS =
  creatorRecoveryHours * 60 * 60 * 1000;
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

const creatorStillPresent = async (broadcast, excludeParticipantSid = '') => {
  const excludedSid = String(excludeParticipantSid || '').trim();
  const participants = await LiveKitProvider.getParticipants(broadcast._id);
  return participants.some((participant) => {
    const metadata = metadataOf(participant.metadata);
    const participantSid = String(participant?.sid || '').trim();
    return (
      metadata.role === 'creator' &&
      String(metadata.userId) === String(broadcast.creator) &&
      (!excludedSid || participantSid !== excludedSid)
    );
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
        creatorDisconnectedAt: new Date(),
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

const endExpiredDisconnectedBroadcast = async (broadcastId, io) => {
  pendingDisconnects.delete(String(broadcastId));
  const current = await Broadcast.findOne({
    _id: broadcastId,
    status: 'live',
    isDeleted: false,
  });
  if (!current) return;

  // Program audio, not mere participant presence, is broadcast authority.
  // A connected creator can still be permanently silent after losing the
  // canonical studio-mix track. Conversely, if a track_published webhook was
  // missed, heal the database from LiveKit ground truth instead of ending.
  let programAudio;
  try {
    programAudio = await getCreatorProgramAudio(current._id, current.creator);
  } catch {
    // A LiveKit control-plane failure is not proof that program audio is gone.
    return;
  }
  if (programAudio) {
    await updateCreatorMediaState(current._id, {
      mediaState: 'audio_live',
      creatorDisconnectedAt: null,
      creatorParticipantSid: programAudio.participantSid || current.creatorParticipantSid || null,
      programTrackSid: programAudio.trackSid || current.programTrackSid || null,
      programTrackName: programAudio.trackName || 'echoo-studio-mix',
    }, io);
    if (isLiveKitServerRecordingEnabled() && programAudio.trackSid) {
      void ensureLiveKitServerRecording({
        broadcastId: String(current._id),
        trackSid: programAudio.trackSid,
      }).catch(() => null);
    }
    return;
  }

  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: current._id,
      status: 'live',
      isDeleted: false,
      creatorDisconnectedAt: { $ne: null },
    },
    {
      $set: {
        status: 'ending',
        failureReason: 'Creator did not reconnect before the long-session recovery lease expired',
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
    console.warn('[Echoo Server Recording] disconnect cleanup warning:', error?.message || error);
  });
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
  broadcast.creatorDisconnectedAt = null;
  broadcast.creatorParticipantSid = null;
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

const scheduleCreatorDisconnect = (broadcastId, io, disconnectedAt = new Date()) => {
  const key = String(broadcastId || '');
  if (!key) return;

  // A delayed/duplicate webhook must never shorten a newer recovery lease.
  // Anchor the process-local timer to the durable database timestamp and
  // replace any stale timer left by an earlier transport session.
  const existing = pendingDisconnects.get(key);
  if (existing) clearTimeout(existing);

  const disconnectedAtMs = new Date(disconnectedAt).getTime();
  const elapsedMs = Number.isFinite(disconnectedAtMs)
    ? Math.max(0, Date.now() - disconnectedAtMs)
    : 0;
  const remainingMs = Math.max(0, CREATOR_RECOVERY_TTL_MS - elapsedMs);

  const timer = setTimeout(() => {
    void endExpiredDisconnectedBroadcast(key, io).catch((error) => {
      console.warn('LiveKit creator recovery-expiry cleanup warning:', error?.message || error);
    });
  }, remainingMs);
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
      const current = await Broadcast.findOne({
        _id: broadcastId,
        status: { $in: ['starting', 'live', 'ending'] },
        isDeleted: false,
      });

      if (current) {
        const leavingParticipantSid = String(event?.participant?.sid || '').trim();
        const currentParticipantSid = String(current.creatorParticipantSid || '').trim();
        const isKnownStaleLeave = Boolean(
          leavingParticipantSid &&
          currentParticipantSid &&
          leavingParticipantSid !== currentParticipantSid
        );

        // LiveKit can deliver participant_joined/track_published for a
        // replacement creator before participant_left for the old session.
        // A SID mismatch proves this leave belongs to an obsolete transport;
        // do not start/cancel timers or mutate the healthy replacement.
        if (!isKnownStaleLeave) {
          // participant_left itself is authoritative for this concrete SID.
          // LiveKit control-plane listing can briefly retain that same SID,
          // so only a different creator participant counts as a replacement.
          const replacementPresent = await creatorStillPresent(
            current,
            leavingParticipantSid
          ).catch(() => true);
          if (replacementPresent) {
            cancelCreatorDisconnect(broadcastId);
          } else {
            const disconnectedAt = current.creatorDisconnectedAt || new Date();
            const updated = await updateCreatorMediaState(
              broadcastId,
              {
                mediaState: 'audio_disconnected',
                creatorDisconnectedAt: disconnectedAt,
                creatorParticipantSid: null,
              },
              req.app.get('io')
            );
            if (updated) {
              scheduleCreatorDisconnect(
                broadcastId,
                req.app.get('io'),
                updated.creatorDisconnectedAt || disconnectedAt
              );
            }
          }
        }
      }
    }
    if (broadcastId && isCreator && event.event === 'participant_joined') {
      cancelCreatorDisconnect(broadcastId);

      // Persist the concrete replacement transport even when preserveLive
      // intentionally refuses to downgrade an already audio_live broadcast
      // to creator_connecting.
      const joinedParticipantSid = String(event?.participant?.sid || '').trim();
      if (joinedParticipantSid) {
        await Broadcast.updateOne(
          {
            _id: broadcastId,
            status: { $in: ['starting', 'live', 'ending'] },
            isDeleted: false,
          },
          { $set: { creatorParticipantSid: joinedParticipantSid } }
        );
      }

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
        creatorDisconnectedAt: null,
        ...(event?.participant?.sid
          ? { creatorParticipantSid: String(event.participant.sid) }
          : {}),
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
      // Only clear the program if the unpublished SID is still the canonical
      // one stored on the broadcast; an old SID must not erase a newer track.
      const updated = await clearCreatorProgramTrackIfCurrent(
        broadcastId,
        event.track?.sid,
        req.app.get('io')
      );
      if (updated?.creatorDisconnectedAt) {
        scheduleCreatorDisconnect(
          broadcastId,
          req.app.get('io'),
          updated.creatorDisconnectedAt
        );
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
