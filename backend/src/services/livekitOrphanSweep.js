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

import Broadcast from '../models/Broadcast.js';
import LiveKitProvider from '../providers/livekit.js';

const STUCK_STATES = ['starting', 'ending'];
const REASON_PREFIX = 'Orphan sweep: ';

function getStuckMinutes() {
  const raw = Number(process.env.ORPHAN_SWEEP_STUCK_MINUTES || 30);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

function isLiveKitConfigured() {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_SECRET);
}

function isStuck(doc) {
  // Compare against updatedAt, not startedAt/endedAt: those are set by the
  // controller that initiated the transition, and updatedAt is the freshest
  // timestamp the database itself maintains.
  const ageMinutes = (Date.now() - doc.updatedAt.getTime()) / 60000;
  return ageMinutes > getStuckMinutes();
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
  // State fields are only committed once the save succeeds, so a database
  // failure never leaves the document half-transitioned.
  if (doc.status === 'starting') {
    const endedAt = new Date();
    const failureReason = `${REASON_PREFIX}broadcast remained in starting state for more than ${getStuckMinutes()} minutes.`;
    await doc.save();
    doc.status = 'failed';
    doc.failureReason = failureReason;
    doc.endedAt = endedAt;
    return doc;
  }
  if (doc.status === 'ending') {
    const endedAt = new Date();
    await doc.save();
    doc.status = 'completed';
    doc.endedAt = endedAt;
    return doc;
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
    if (!STUCK_STATES.includes(fresh.status)) {
      continue;
    }

    if (!isStuck(fresh)) {
      continue;
    }
    
    try {
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
  sweep,
  startOrphanSweep,
};

export default {
  STUCK_STATES,
  getStuckMinutes,
  isStuck,
  sweep,
  startOrphanSweep,
};
