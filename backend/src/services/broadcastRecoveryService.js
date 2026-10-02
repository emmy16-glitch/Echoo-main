import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import LiveKitProvider from '../providers/livekit.js';
import { stopBroadcastOutputs } from './broadcastOutputService.js';
import { enqueueBroadcastProcessing } from './broadcastProcessingService.js';
import { releaseCreatorBroadcastLease } from './creatorBroadcastLease.js';
import { stopLiveKitServerRecording } from './livekitServerRecording.js';
import {
  creatorParticipantIsPresent,
  getCreatorProgramAudio,
} from './broadcastAudioReadiness.js';

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
const creatorRecoveryTtlMs = () => {
  const raw = Number(process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS || 24);
  const hours = Number.isFinite(raw) && raw > 0
    ? Math.max(1, Math.min(48, raw))
    : 24;
  return hours * 60 * 60 * 1000;
};

const recoveryError = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

// Ground truth for "actually still live": the creator's canonical post-master
// program track. Guest/co-host tracks must not wedge OPFS recovery after the
// creator program has ended. An intentional pause is the exception: while
// paused, creator participant presence keeps the logical show alive even if the
// program track is muted. Provider outages remain conservative.
const liveRoomHasCreatorAuthority = async (broadcast) => {
  try {
    const active = broadcast.mediaState === 'audio_paused'
      ? await creatorParticipantIsPresent(broadcast._id, broadcast.creator)
      : Boolean(await getCreatorProgramAudio(broadcast._id, broadcast.creator));
    return { active, unknown: false };
  } catch {
    return { active: false, unknown: true };
  }
};

const recoveryLeaseAgeMs = (broadcast) => {
  const timestamp = new Date(broadcast?.creatorDisconnectedAt || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0
    ? Math.max(0, Date.now() - timestamp)
    : null;
};

const beginLiveRecoveryLease = async (broadcast) => {
  const expectedTrackSid = broadcast.programTrackSid ?? null;
  const expectedMediaState = broadcast.mediaState;
  return Broadcast.findOneAndUpdate(
    {
      _id: broadcast._id,
      status: 'live',
      isDeleted: false,
      creatorDisconnectedAt: null,
      mediaState: expectedMediaState,
      programTrackSid: expectedTrackSid,
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
};

const claimExpiredLiveRecovery = async (broadcast) =>
  Broadcast.findOneAndUpdate(
    {
      _id: broadcast._id,
      status: 'live',
      isDeleted: false,
      creatorDisconnectedAt: broadcast.creatorDisconnectedAt,
    },
    { $set: { status: 'ending' } },
    { returnDocument: 'after' }
  );

const finalizeInterruptedBroadcast = async (broadcast) => {
  const now = new Date();

  // Recovery owns the same shutdown order as normal End Broadcast: stop the
  // LiveKit server recorder first so FFmpeg can flush a complete MP3 before
  // the room is removed. If that recorder has already failed, browser OPFS
  // recovery remains authoritative.
  await stopLiveKitServerRecording(String(broadcast._id)).catch((error) => {
    console.warn('[Echoo Recovery] server recorder cleanup warning:', error?.message || error);
  });

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
  broadcast.creatorDisconnectedAt = null;
  broadcast.creatorParticipantSid = null;
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

  if (broadcast.status === 'live') {
    const room = await liveRoomHasCreatorAuthority(broadcast);
    if (room.active) {
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'This broadcast is still live in another session. End it there first; your local recording stays safe on this device.'
      );
    }
    if (room.unknown) {
      // A provider/control-plane outage is never evidence that a live show has
      // ended. Preserve both the logical broadcast and the recovered master.
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'Echoo could not confirm this broadcast ended. Your local recording stays safe; retry shortly.'
      );
    }

    let leaseAgeMs = recoveryLeaseAgeMs(broadcast);
    if (leaseAgeMs === null) {
      // Missing unpublish/participant-left webhooks must not let recovery end a
      // fresh logical show. Establish the same durable lease used by the live
      // reconnect path, with an atomic track/state guard so a concurrent
      // republish wins instead.
      const leased = await beginLiveRecoveryLease(broadcast);
      if (!leased) {
        throw recoveryError(
          409,
          'BROADCAST_STILL_LIVE',
          'This broadcast changed while Echoo was checking recovery. Your local recording stays safe; retry shortly.'
        );
      }
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'This broadcast is recovering its live audio. Your local recording stays safe while Echoo reconnects.'
      );
    }

    if (leaseAgeMs < creatorRecoveryTtlMs()) {
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'This broadcast is still inside its live recovery window. Your local recording stays safe while Echoo reconnects.'
      );
    }

    // Claim only this exact expired disconnect generation. A concurrent
    // track_published webhook clears/changes creatorDisconnectedAt and causes
    // this atomic claim to fail instead of tearing down a recovered show.
    const claimed = await claimExpiredLiveRecovery(broadcast);
    if (!claimed) {
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'This broadcast recovered while Echoo was checking the saved recording. Your local recording remains safe.'
      );
    }
    const finalized = await finalizeInterruptedBroadcast(claimed);
    return { outcome: 'finalized', broadcast: finalized, audioId: null, readyForUpload: true };
  }

  if (broadcast.status === 'starting') {
    const room = await liveRoomHasCreatorAuthority(broadcast);
    if (room.active) {
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'This broadcast is still starting in another session. Your local recording stays safe on this device.'
      );
    }
    if (room.unknown) {
      // Match the live/orphan policy: a provider outage cannot prove startup
      // died, so never use it as authority to finalize a recovered master.
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'Echoo could not confirm this broadcast startup ended. Your local recording stays safe; retry shortly.'
      );
    }

    const updatedAt = new Date(broadcast.updatedAt || 0).getTime();
    const stale = Date.now() - updatedAt > STALE_ORPHAN_MS;
    if (!stale) {
      throw recoveryError(
        409,
        'BROADCAST_STILL_LIVE',
        'This broadcast is still inside its startup recovery window. Your local recording stays safe while Echoo prepares the live session.'
      );
    }

    const finalized = await finalizeInterruptedBroadcast(broadcast);
    return { outcome: 'finalized', broadcast: finalized, audioId: null, readyForUpload: true };
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
