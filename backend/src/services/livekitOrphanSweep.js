// best-effort reaper for broadcasts that got stuck mid-transition.
//
// A broadcast should never stay in `starting` or `ending` for long: both are
// transitory states between `scheduled`/`live` and a terminal state. When the
// process that was driving the transition crashes (deploy, OOM kill, pod
// reschedule, unhandled rejection), the row stays stuck while any LiveKit
// resources it provisioned — a room, an ingress endpoint, or an egress
// recording pipeline — keep running and keep costing money.
//
// This module finds such stuck rows after boot, tears down anything LiveKit
// still holds for them, and moves them to a terminal state. All LiveKit calls
// are best-effort: a transient provider failure must never crash the app
// startup path or leave the database in an inconsistent state.

import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import LiveKitProvider from '../providers/livekit.js';
import { clearBroadcastPresenceCache } from '../controllers/broadcastPresenceController.js';
import { releaseCreatorBroadcastLease } from './creatorBroadcastLease.js';
import { flushBroadcastTranscription } from './transcriptionGateway.js';

const STUCK_STATES = ['starting', 'ending', 'live'];
const REASON_PREFIX = 'Orphan sweep: ';

function getStuckMinutes() {
  const raw = Number(process.env.ORPHAN_SWEEP_STUCK_MINUTES || 30);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

function isLiveKitConfigured() {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_SECRET);
}

function isStuck(doc) {
  // Transitional rows use updatedAt because it is the freshest timestamp the
  // database maintains while start/end controllers are still working.
  // A live row that never published audio is the exception: unrelated
  // migrations or metadata edits can refresh updatedAt, while startedAt is the
  // authoritative beginning of that abandoned connection attempt.
  const referenceTime = doc.status === 'live' && doc.mediaState === 'creator_connecting'
    ? doc.startedAt || doc.startTime || doc.updatedAt
    : doc.updatedAt;
  const ageMinutes = (Date.now() - referenceTime.getTime()) / 60000;
  return ageMinutes > getStuckMinutes();
}

function isRecoverableState(doc) {
  return STUCK_STATES.includes(doc.status)
    && (doc.status !== 'live' || doc.mediaState === 'creator_connecting');
}

async function reapLiveKitResources(doc) {
  if (!isLiveKitConfigured()) return;

  // Ingress first: a running ingress keeps publishing into the room, so the
  // room and egress are only fully cleaned once the source is gone.
  if (doc.livekitIngressId) {
    try {
      await LiveKitProvider.stopIngress(doc.livekitIngressId);
    } catch (error) {
      console.warn(
        `[orphan-sweep] ingress stop failed for ${doc.livekitIngressId}:`,
        error?.message || error
      );
    }
  }

  if (doc.livekitEgressId) {
    try {
      await LiveKitProvider.stopEgress(doc.livekitEgressId);
    } catch (error) {
      console.warn(
        `[orphan-sweep] egress stop failed for ${doc.livekitEgressId}:`,
        error?.message || error
      );
    }
  }

  if (doc.livekitRoomName || doc._id) {
    try {
      await LiveKitProvider.endRoom(doc._id);
    } catch (error) {
      console.warn(
        `[orphan-sweep] room end failed for broadcast ${doc._id}:`,
        error?.message || error
      );
    }
  }
}

async function resolveStuckBroadcast(doc) {
  const previous = {
    status: doc.status,
    failureReason: doc.failureReason,
    endedAt: doc.endedAt,
    listenerCount: doc.listenerCount,
    livekitRoomName: doc.livekitRoomName,
    livekitIngressId: doc.livekitIngressId,
    livekitEgressId: doc.livekitEgressId,
  };
  const wasStarting = doc.status === 'starting';
  const wasUnpublishedLive = doc.status === 'live' && doc.mediaState === 'creator_connecting';
  if (!wasStarting && !wasUnpublishedLive && doc.status !== 'ending') return doc;

  doc.status = wasStarting || wasUnpublishedLive ? 'failed' : 'completed';
  doc.failureReason = wasStarting || wasUnpublishedLive
    ? `${REASON_PREFIX}broadcast never published the creator program track within ${getStuckMinutes()} minutes.`
    : doc.failureReason;
  doc.endedAt = doc.endedAt || new Date();
  doc.listenerCount = 0;
  doc.livekitRoomName = null;
  doc.livekitIngressId = null;
  doc.livekitEgressId = null;

  try {
    await doc.save();
  } catch (error) {
    Object.assign(doc, previous);
    throw error;
  }

  clearBroadcastPresenceCache(doc._id);
  if (doc.station) {
    await Station.updateOne(
      { _id: doc.station },
      { $set: { isLive: false, listenerCount: 0 } }
    ).catch(() => null);
  }
  if (doc.creator) {
    await releaseCreatorBroadcastLease(doc.creator, doc._id).catch(() => null);
  }
  return doc;
}

// Exported for tests: finds stuck rows and reaps them without touching the
// database until everything for a single broadcast has been processed.
async function sweep() {
  const results = { swept: 0, failed: 0, errors: [] };
  if (!isLiveKitConfigured()) return results;

  const stuck = await Broadcast.find({ status: { $in: STUCK_STATES } });
  const stuckIds = new Set(stuck.map((doc) => String(doc._id)));

  for (const doc of stuck) {
    // Re-read in case another process already resolved it between the query
    // and now; a concurrent sweep must never double-fail a live broadcast.
    const fresh = await Broadcast.findById(doc._id);
    if (!fresh || !stuckIds.has(String(fresh._id))) {
      continue;
    }
    if (!isRecoverableState(fresh)) {
      continue;
    }

    if (!isStuck(fresh)) {
      continue;
    }
    
    try {
      if (mongoose.connection.readyState === 1) {
        await flushBroadcastTranscription(fresh._id).catch((error) => {
          console.warn(
            `[orphan-sweep] transcript flush failed for ${fresh._id}:`,
            error?.message || error
          );
        });
      }
      await reapLiveKitResources(fresh);
      await resolveStuckBroadcast(fresh);
      results.swept += 1;
      console.log(
        `[orphan-sweep] resolved stuck broadcast ${fresh._id} (${fresh.status})`
      );
    } catch (error) {
      results.failed += 1;
      results.errors.push(String(error?.message || error));
      console.error(
        `[orphan-sweep] failed to resolve broadcast ${fresh._id}:`,
        error?.message || error
      );
    }
  }

  return results;
}

// Non-blocking startup hook. The sweep runs once after boot; it must never
// reject in a way that affects process startup or the express app.
function startOrphanSweep() {
  // Startup smoke tests and degraded boot paths may expose a connection-like
  // object without a real database handle. Do not queue a buffered query in
  // that state; the next healthy process boot will perform the sweep.
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return;

  sweep()
    .then((results) => {
      if (results.swept > 0) {
        console.log(
          `[orphan-sweep] finished: ${results.swept} resolved, ${results.failed} failed`
        );
      }
    })
    .catch((error) => {
      // Guard against anything not caught inside sweep().
      console.error('[orphan-sweep] unexpected error:', error?.message || error);
    });
}

export {
  STUCK_STATES,
  getStuckMinutes,
  isStuck,
  isRecoverableState,
  sweep,
  startOrphanSweep,
};

export default {
  STUCK_STATES,
  getStuckMinutes,
  isStuck,
  isRecoverableState,
  sweep,
  startOrphanSweep,
};
