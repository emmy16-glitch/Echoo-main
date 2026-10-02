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
import {
  findCreatorProgramAudio,
} from './broadcastAudioReadiness.js';

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

const updateCreatorMediaState = async (broadcastId, update, io, { preserveLive = false } = {}) => {
  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: broadcastId,
      status: { $in: ['starting', 'live'] },
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

  // Read first so a replacement track published between this read and write
  // makes the programTrackSid predicate fail instead of being erased.
  const current = await Broadcast.findOne({
    _id: broadcastId,
    status: { $in: ['starting', 'live'] },
    isDeleted: false,
    programTrackSid: sid,
  });
  if (!current) return null;

  const disconnectedAt = current.creatorDisconnectedAt || new Date();
  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: broadcastId,
      status: { $in: ['starting', 'live'] },
      isDeleted: false,
      programTrackSid: sid,
    },
    {
      $set: {
        mediaState: 'audio_disconnected',
        creatorDisconnectedAt: disconnectedAt,
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

const creatorProgramSnapshot = async (broadcast, participantSid = '') =>
  findCreatorProgramAudio(
    broadcast._id,
    broadcast.creator,
    participantSid ? { participantSid } : {}
  );

const shouldAcceptProgramPublish = async (broadcast, event) => {
  const eventParticipantSid = String(event?.participant?.sid || '').trim();
  const currentParticipantSid = String(broadcast?.creatorParticipantSid || '').trim();

  if (!currentParticipantSid || !eventParticipantSid || currentParticipantSid === eventParticipantSid) {
    return true;
  }

  // A reconnect can overlap old and new creator transports. On a SID mismatch,
  // trust the currently stored transport while it still has the canonical
  // program track. Only promote the webhook's transport if the stored one no
  // longer carries program audio and the webhook's exact SID does.
  try {
    const [currentProgram, eventProgram] = await Promise.all([
      creatorProgramSnapshot(broadcast, currentParticipantSid),
      creatorProgramSnapshot(broadcast, eventParticipantSid),
    ]);
    if (currentProgram) return false;
    if (!eventProgram) return false;

    const eventTrackSid = String(event?.track?.sid || '').trim();
    return !eventTrackSid || String(eventProgram.trackSid || '').trim() === eventTrackSid;
  } catch (error) {
    // Ambiguous control-plane state must never let an old delayed webhook
    // overwrite a known healthy replacement transport.
    console.warn(
      '[Echoo LiveKit Webhook] could not verify mismatched creator track publish:',
      error?.message || error
    );
    return false;
  }
};

const endExpiredDisconnectedBroadcast = async (broadcastId, io) => {
  pendingDisconnects.delete(String(broadcastId));
  const current = await Broadcast.findOne({
    _id: broadcastId,
    status: 'live',
    isDeleted: false,
  });
  if (!current || !current.creatorDisconnectedAt) return;
  const recoveryLeaseStartedAt = new Date(current.creatorDisconnectedAt);

  // The recovery lease protects the logical show while program audio is gone.
  // Participant presence alone is insufficient: a creator can remain joined
  // forever with no echoo-studio-mix. Reconcile from LiveKit if the track is
  // actually back; otherwise the expired lease is terminal.
  let publisher = null;
  try {
    publisher = await creatorProgramSnapshot(current);
  } catch {
    // A LiveKit control-plane lookup failure is not evidence that audio is
    // absent. Preserve the show and let the periodic sweep retry later.
    return;
  }
  if (publisher) {
    const recovered = await updateCreatorMediaState(
      broadcastId,
      {
        mediaState: 'audio_live',
        creatorDisconnectedAt: null,
        creatorParticipantSid: publisher.participantSid || current.creatorParticipantSid || null,
        programTrackSid: publisher.trackSid || current.programTrackSid || null,
        programTrackName: publisher.trackName || current.programTrackName || 'echoo-studio-mix',
      },
      io
    );
    if (recovered) {
      cancelCreatorDisconnect(broadcastId);
      if (isLiveKitServerRecordingEnabled() && publisher.trackSid) {
        void ensureLiveKitServerRecording({
          broadcastId,
          trackSid: publisher.trackSid,
        }).catch((recordingError) => {
          console.warn(
            '[Echoo Server Recording] recovery reconciliation warning:',
            recordingError?.message || recordingError
          );
        });
      }
    }
    return;
  }

  const broadcast = await Broadcast.findOneAndUpdate(
    {
      _id: current._id,
      status: 'live',
      isDeleted: false,
      // Compare-and-set the exact lease that this timer inspected. If the
      // creator recovered and disconnected again while this async check was
      // running, the new lease has a different timestamp and must survive.
      creatorDisconnectedAt: recoveryLeaseStartedAt,
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
        status: { $in: ['starting', 'live'] },
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
          // A replacement may already have published while the old publisher
          // was still healthy; that earlier publish was intentionally ignored
          // to avoid two transports fighting for authority. Promote it now.
          let replacementProgram = null;
          try {
            replacementProgram = await findCreatorProgramAudio(
              current._id,
              current.creator,
              { excludeParticipantSid: leavingParticipantSid }
            );
          } catch (error) {
            console.warn(
              '[Echoo LiveKit Webhook] replacement program lookup failed:',
              error?.message || error
            );
          }

          if (replacementProgram) {
            cancelCreatorDisconnect(broadcastId);
            const recovered = await updateCreatorMediaState(
              broadcastId,
              {
                mediaState: 'audio_live',
                creatorDisconnectedAt: null,
                creatorParticipantSid:
                  replacementProgram.participantSid || null,
                programTrackSid:
                  replacementProgram.trackSid || current.programTrackSid || null,
                programTrackName:
                  replacementProgram.trackName || 'echoo-studio-mix',
              },
              req.app.get('io')
            );

            if (
              recovered &&
              isLiveKitServerRecordingEnabled() &&
              replacementProgram.trackSid
            ) {
              void ensureLiveKitServerRecording({
                broadcastId,
                trackSid: replacementProgram.trackSid,
              }).catch((recordingError) => {
                console.warn(
                  '[Echoo Server Recording] replacement publisher handoff warning:',
                  recordingError?.message || recordingError
                );
              });
            }
          } else {
            // A joined participant with no canonical program audio is not a
            // recovered broadcast. Start/continue the durable recovery lease.
            const disconnectedAt = current.creatorDisconnectedAt || new Date();
            const updated = await updateCreatorMediaState(
              broadcastId,
              {
                mediaState: 'audio_disconnected',
                creatorDisconnectedAt: disconnectedAt,
                creatorParticipantSid: null,
                programTrackSid: null,
                programTrackName: null,
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
      // Joining is only transport progress. Do NOT cancel an existing recovery
      // lease until the replacement publishes echoo-studio-mix; a participant
      // can reconnect successfully but fail to restore program audio.
      const joinedParticipantSid = String(event?.participant?.sid || '').trim();
      if (joinedParticipantSid) {
        const current = await Broadcast.findOne({
          _id: broadcastId,
          status: { $in: ['starting', 'live'] },
          isDeleted: false,
        }).select('mediaState creatorDisconnectedAt creatorParticipantSid programTrackSid');

        const canClaimTransport = Boolean(
          current &&
          (
            !current.creatorParticipantSid ||
            current.mediaState !== 'audio_live' ||
            current.creatorDisconnectedAt ||
            !current.programTrackSid
          )
        );

        // A second tab/device joining while the canonical program is healthy
        // must not steal authority from the participant that is actually
        // publishing. The joining SID becomes authoritative only during a
        // genuine recovery/startup state; track_published can promote it later
        // after control-plane verification.
        if (canClaimTransport) {
          await Broadcast.updateOne(
            {
              _id: broadcastId,
              status: { $in: ['starting', 'live'] },
              isDeleted: false,
            },
            { $set: { creatorParticipantSid: joinedParticipantSid } }
          );
        }
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
      const current = await Broadcast.findOne({
        _id: broadcastId,
        status: { $in: ['starting', 'live'] },
        isDeleted: false,
      });

      if (current && await shouldAcceptProgramPublish(current, event)) {
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
      } else if (current) {
        console.info('[Echoo LiveKit Webhook] ignored stale creator track_published', {
          broadcastId,
          eventParticipantSid: event?.participant?.sid || null,
          currentParticipantSid: current.creatorParticipantSid || null,
          trackSid: event.track?.sid || null,
        });
      }
    }
    if (broadcastId && isCreator && event.event === 'track_unpublished' && trackName === 'echoo-studio-mix') {
      // Webhook delivery can be reordered around a fast creator recovery.
      // Only clear the program if the unpublished SID is still the canonical
      // one stored on the broadcast; an old SID must not erase a newer track.
      const disconnected = await clearCreatorProgramTrackIfCurrent(
        broadcastId,
        event.track?.sid,
        req.app.get('io')
      );
      if (disconnected?.creatorDisconnectedAt) {
        scheduleCreatorDisconnect(
          broadcastId,
          req.app.get('io'),
          disconnected.creatorDisconnectedAt
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
