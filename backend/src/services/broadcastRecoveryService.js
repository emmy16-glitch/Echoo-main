import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import LiveKitProvider from '../providers/livekit.js';
import { stopBroadcastOutputs } from './broadcastOutputService.js';
import { enqueueBroadcastProcessing } from './broadcastProcessingService.js';
import { releaseCreatorBroadcastLease } from './creatorBroadcastLease.js';

// ---------------------------------------------------------------------------
// Recording-recovery reconciliation.
//
// A recovered OPFS master must never become unsaveable merely because the
// browser or network died during End Broadcast finalization. This helper
// inspects the broadcast lifecycle and, only when it can prove the session
// is no longer legitimately live, safely completes finalization so exactly
// one replay can be linked. It never creates broadcasts, never duplicates
// replays, and never touches transcription (paused product-wide).
// ---------------------------------------------------------------------------

const STALE_ORPHAN_MS = 30 * 60 * 1000;
const RECENT_ACTIVITY_MS = 5 * 60 * 1000;

const recoveryError = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const hasPublishedTracks = (participant) => {
  const tracks = participant?.tracks;
  if (Array.isArray(tracks)) return tracks.length > 0;
  if (participant?.permission?.canPublish === false) return false;
  return false;
};

// Ground truth for "actually still live": someone publishing in the LiveKit
// room. An empty or missing room means no session survived; a provider outage
// is treated conservatively (only states that already requested an end, or
// demonstrably stale sessions, may finalize).
const liveRoomHasPublisher = async (broadcastId) => {
  try {
    const participants = await LiveKitProvider.getParticipants(broadcastId);
    if (!Array.isArray(participants) || !participants.length) {
      return { active: false, unknown: false };
    }
    return { active: participants.some(hasPublishedTracks), unknown: false };
  } catch {
    return { active: false, unknown: true };
  }
};

const finalizeInterruptedBroadcast = async (broadcast) => {
  const now = new Date();
  await stopBroadcastOutputs(String(broadcast._id), { incomplete: true }).catch((error) => {
    console.warn('[Echoo Recovery] output cleanup warning:', error?.message || error);
  });
  try {
    await LiveKitProvider.endRoom(String(broadcast._id));
  } catch (error) {
    console.warn('[Echoo Recovery] LiveKit room cleanup warning:', error?.message || error);
  }
  await releaseCreatorBroadcastLease(String(broadcast.creator), String(broadcast._id)).catch(() => null);

  broadcast.status = 'completed';
  broadcast.endedAt = broadcast.endedAt || now;
  broadcast.endTime = broadcast.endTime || broadcast.endedAt;
  // A broadcast stuck in `starting` may never have recorded startedAt. The
  // recovered recording proves capture happened; preserve the invariant
  // startedAt <= endedAt without fabricating a longer history.
  broadcast.startedAt = broadcast.startedAt || broadcast.endedAt;
  broadcast.listenerCount = 0;
  broadcast.livekitRoomName = null;
  broadcast.livekitEgressId = null;
  broadcast.livekitIngressId = null;
  broadcast.mediaState = 'audio_disconnected';
  broadcast.transcriptState = 'disabled';
  broadcast.processingStartedAt = now;
  broadcast.assetStatus.audio = 'processing';
  broadcast.assetStatus.transcript = 'disabled';
  broadcast.assetStatus.highlights = 'failed';
  broadcast.assetStatus.chapters = 'failed';
  broadcast.programTrackSid = null;
  broadcast.programTrackName = null;
  await broadcast.save();

  await enqueueBroadcastProcessing(broadcast._id, { transcriptionEnabled: false }).catch((error) => {
    console.error('[Echoo Recovery] processing enqueue failed:', {
      broadcastId: String(broadcast._id),
      message: error?.message || error,
    });
  });
  return broadcast;
};

export async function recoverBroadcastForReplay({ broadcastId, userId }) {
  if (!mongoose.isValidObjectId(broadcastId)) {
    throw recoveryError(400, 'INVALID_BROADCAST_ID', 'Invalid broadcast ID');
  }
  const broadcast = await Broadcast.findOne({ _id: broadcastId, isDeleted: false });
  if (!broadcast) {
    throw recoveryError(
      404,
      'BROADCAST_NOT_FOUND',
      'This broadcast could not be found. Your local recording is preserved on this device.'
    );
  }
  if (String(broadcast.creator) !== String(userId)) {
    throw recoveryError(
      403,
      'RECOVERY_FORBIDDEN',
      'Only the creator who made this broadcast can recover its recording.'
    );
  }

  // Idempotency: exactly one replay per broadcast. If the link or the Audio
  // record already exists (e.g. a lost response after a committed upload),
  // return it as success — never a user-visible failure, never a duplicate.
  const existingAudio = await Audio.findOne({
    $or: [
      { sourceBroadcast: broadcast._id, artist: userId, isDeleted: false },
      ...(broadcast.replayAudio ? [{ _id: broadcast.replayAudio, isDeleted: false }] : []),
    ],
  });
  if (existingAudio) {
    if (!broadcast.replayAudio || String(broadcast.replayAudio) !== String(existingAudio._id)) {
      broadcast.replayAudio = existingAudio._id;
      broadcast.recordingUrl = String(existingAudio._id);
      broadcast.assetStatus.audio = 'ready';
      await broadcast.save().catch(() => null);
    }
    return { outcome: 'already_has_replay', broadcast, audioId: String(existingAudio._id), readyForUpload: true };
  }
  // Stale link pointing at a deleted/missing Audio must not wedge recovery.
  if (broadcast.replayAudio) {
    broadcast.replayAudio = null;
    broadcast.recordingUrl = null;
  }

  if (broadcast.status === 'completed') {
    await broadcast.save().catch(() => null);
    return { outcome: 'ready', broadcast, audioId: null, readyForUpload: true };
  }

  if (broadcast.status === 'ending') {
    // End was requested but finalization never landed. Safe to complete.
    const finalized = await finalizeInterruptedBroadcast(broadcast);
    return { outcome: 'finalized', broadcast: finalized, audioId: null, readyForUpload: true };
  }

  if (broadcast.status === 'live' || broadcast.status === 'starting') {
    const room = await liveRoomHasPublisher(broadcast._id);
    if (room.active) {
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'This broadcast is still live in another session. End it there first; your local recording stays safe on this device.'
      );
    }
    const updatedAt = new Date(broadcast.updatedAt || 0).getTime();
    const stale = Date.now() - updatedAt > STALE_ORPHAN_MS;
    const recent = Date.now() - updatedAt < RECENT_ACTIVITY_MS;
    if (room.unknown && recent && !stale) {
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'Echoo could not confirm this broadcast ended. Your local recording stays safe; retry shortly.'
      );
    }
    if (!room.unknown || stale) {
      const finalized = await finalizeInterruptedBroadcast(broadcast);
      return { outcome: 'finalized', broadcast: finalized, audioId: null, readyForUpload: true };
    }
    throw recoveryError(
      409,
      'BROADCAST_STILL_LIVE',
      'This broadcast is still live in another session. End it there first; your local recording stays safe on this device.'
    );
  }

  // failed / cancelled / scheduled / draft: only reconcile sessions that
  // actually went live (startedAt present). Anything else cannot own a live
  // recording, so preserve the file and refuse rather than fabricate history.
  if (broadcast.startedAt) {
    const finalized = await finalizeInterruptedBroadcast(broadcast);
    return { outcome: 'finalized', broadcast: finalized, audioId: null, readyForUpload: true };
  }
  throw recoveryError(
    409,
    'BROADCAST_NOT_RECOVERABLE',
    'This broadcast never went live, so the recording cannot be linked to it. Your local file is preserved — download it from this dialog.'
  );
}

export default { recoverBroadcastForReplay };
