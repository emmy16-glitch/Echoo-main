import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import mongoose from 'mongoose';

// The sweep service is exercised against fake Broadcast documents and fake
// LiveKit provider methods, so no database or LiveKit connection is needed.
// mongoose model resolution is mocked at the module level via a temporary
// replacement of Broadcast on mongoose.model() before the sweep module is
// imported, and the LiveKit provider is intercepted through its test hook.

const originalEnv = { ...process.env };

const TEST_ENV = {
  LIVEKIT_URL: 'wss://test.livekit.cloud',
  LIVEKIT_API_KEY: 'test-api-key',
  LIVEKIT_API_SECRET: 'test-api-secret',
};

test.beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv, TEST_ENV);
});

test.afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

// ---------------- fake Broadcast document ----------------

function makeDoc(fields) {
  const events = new EventEmitter();
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    status: 'starting',
    livekitIngressId: null,
    livekitEgressId: null,
    livekitRoomName: null,
    failureReason: null,
    endedAt: null,
    updatedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour old by default
    saveCalled: 0,
    saveSnapshots: [],
    ...fields,
  };
  doc.save = async () => {
    doc.saveCalled += 1;
    doc.saveSnapshots.push({
      status: doc.status,
      livekitRoomName: doc.livekitRoomName,
      livekitIngressId: doc.livekitIngressId,
      livekitEgressId: doc.livekitEgressId,
    });
    return doc;
  };
  Object.setPrototypeOf(doc, events);
  return doc;
}

// The mock acts as a stand-in for the RoomServiceClient, EgressClient, and
// IngressClient: the provider only ever calls deleteIngress, stopEgress, and
// deleteRoom on it, so recording those is enough to assert ordering and ids.
function makeLivekitProviderMock() {
  const calls = [];
  return {
    calls,
    deleteIngress: async (id) => {
      calls.push({ op: 'stopIngress', id });
    },
    stopEgress: async (id) => {
      calls.push({ op: 'stopEgress', id });
      return null;
    },
    deleteRoom: async (roomName) => {
      calls.push({ op: 'endRoom', roomName });
      return true;
    },
    listParticipants: async () => [],
  };
}

// ---------------- test scaffolding ----------------

// Broadcast.js compiles its mongoose Model once and the sweep module holds
// a reference to that cached export, so the fake must replace the methods on
// the real Model itself rather than the mongoose.models map entry.
let realBroadcast = null;
await (async () => {
  realBroadcast = (await import('../src/models/Broadcast.js')).default;
})();

function installBroadcastMock(docs) {
  const findByIdCalls = [];
  const originalFindMethod = realBroadcast.find.bind(realBroadcast);
  const originalFindByIdMethod = realBroadcast.findById.bind(realBroadcast);
  realBroadcast.find = async (filter) => {
    assert.deepEqual(filter, { status: { $in: ['starting', 'ending', 'live'] } });
    return [...docs];
  };
  realBroadcast.findById = async (id) => {
    findByIdCalls.push(String(id));
    return docs.find((doc) => String(doc._id) === String(id));
  };
  return {
    findByIdCalls,
    restore() {
      realBroadcast.find = originalFindMethod;
      realBroadcast.findById = originalFindByIdMethod;
    },
  };
}

// The mock must stay active while the test actually executes sweep(), so the
// returned `teardown` restores everything only after the caller is done.
async function loadSweepWithMocks(docs, providerMock) {
  const broadcastMock = installBroadcastMock(docs);
  const livekitModule = await import('../src/providers/livekit.js');
  // setClientOverrides expects client factories (functions), mirroring the
  // pattern used by the provider's own test suite.
  const clearClients = livekitModule.setClientOverrides({
    room: () => providerMock,
    egress: () => providerMock,
    ingress: () => providerMock,
  });
  const sweepModule = await import('../src/services/livekitOrphanSweep.js');
  return {
    sweepModule,
    teardown() {
      broadcastMock.restore();
      clearClients();
    },
  };
}

// ---------------- tests ----------------

test('skips the sweep entirely when LiveKit is not configured', { concurrency: 1 }, async () => {
  delete process.env.LIVEKIT_URL;
  process.env.LIVEKIT_API_SECRET = '';
  const sweepModule = await import('../src/services/livekitOrphanSweep.js');
  const result = await sweepModule.sweep();
  assert.deepEqual(result, { swept: 0, failed: 0, errors: [] });
});

test('default stuck threshold is 30 minutes and reads the env var at call time', { concurrency: 1 }, async () => {
  const sweepModule = await import('../src/services/livekitOrphanSweep.js');
  assert.equal(sweepModule.getStuckMinutes(), 30);
  process.env.ORPHAN_SWEEP_STUCK_MINUTES = '10';
  assert.equal(sweepModule.getStuckMinutes(), 10);
  delete process.env.ORPHAN_SWEEP_STUCK_MINUTES;
});

test('orphan sweep interval rejects malformed or unsafe timer values', { concurrency: 1 }, async () => {
  const sweepModule = await import('../src/services/livekitOrphanSweep.js');

  delete process.env.ORPHAN_SWEEP_INTERVAL_MS;
  assert.equal(sweepModule.getOrphanSweepIntervalMs(), 10 * 60 * 1000);

  process.env.ORPHAN_SWEEP_INTERVAL_MS = 'not-a-number';
  assert.equal(sweepModule.getOrphanSweepIntervalMs(), 10 * 60 * 1000);

  process.env.ORPHAN_SWEEP_INTERVAL_MS = '5';
  assert.equal(sweepModule.getOrphanSweepIntervalMs(), 60_000);

  process.env.ORPHAN_SWEEP_INTERVAL_MS = String(8 * 60 * 60 * 1000);
  assert.equal(sweepModule.getOrphanSweepIntervalMs(), 60 * 60 * 1000);

  delete process.env.ORPHAN_SWEEP_INTERVAL_MS;
});

test('broadcasts still transitioning within the threshold are not swept', { concurrency: 1 }, async () => {
  const recent = makeDoc({
    status: 'starting',
    updatedAt: new Date(Date.now() - 5 * 60 * 1000),
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([recent], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(provider.calls.length, 0);
    assert.equal(recent.saveCalled, 0);
    assert.equal(recent.status, 'starting');
  } finally {
    teardown();
  }
});

test('stuck broadcasts are detected by their age against the threshold', { concurrency: 1 }, async () => {
  const sweepModule = await import('../src/services/livekitOrphanSweep.js');
  const stale = makeDoc({
    status: 'ending',
    updatedAt: new Date(Date.now() - 31 * 60 * 1000),
  });
  assert.equal(sweepModule.isStuck(stale), true);
  const recent = makeDoc({
    status: 'starting',
    updatedAt: new Date(Date.now() - 10 * 60 * 1000),
  });
  assert.equal(sweepModule.isStuck(recent), false);
});

test('stale live broadcasts are reaped only while still waiting for the creator program track', { concurrency: 1 }, async () => {
  const staleConnecting = makeDoc({
    status: 'live',
    mediaState: 'creator_connecting',
    startedAt: new Date(Date.now() - 45 * 60 * 1000),
    updatedAt: new Date(),
  });
  const healthyPublished = makeDoc({
    status: 'live',
    mediaState: 'audio_published',
    updatedAt: new Date(Date.now() - 45 * 60 * 1000),
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([staleConnecting, healthyPublished], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 1);
    assert.equal(staleConnecting.status, 'failed');
    assert.match(staleConnecting.failureReason, /never published/);
    assert.equal(healthyPublished.status, 'live');
    assert.equal(healthyPublished.saveCalled, 0);
  } finally {
    teardown();
  }
});

test('stale audio-live state heals to the actual LiveKit creator program track', { concurrency: 1 }, async () => {
  const creator = new mongoose.Types.ObjectId();
  const live = makeDoc({
    status: 'live',
    mediaState: 'audio_live',
    creator,
    creatorDisconnectedAt: null,
    creatorParticipantSid: 'PA_stale',
    programTrackSid: 'TR_stale',
    programTrackName: 'echoo-studio-mix',
  });
  const provider = makeLivekitProviderMock();
  provider.listParticipants = async () => [{
    sid: 'PA_actual',
    identity: String(creator),
    metadata: JSON.stringify({ role: 'creator', userId: String(creator) }),
    tracks: [{
      sid: 'TR_actual',
      name: 'echoo-studio-mix',
      mimeType: 'audio/opus',
      muted: false,
    }],
  }];

  const { sweepModule, teardown } = await loadSweepWithMocks([live], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(live.status, 'live');
    assert.equal(live.mediaState, 'audio_live');
    assert.equal(live.creatorDisconnectedAt, null);
    assert.equal(live.creatorParticipantSid, 'PA_actual');
    assert.equal(live.programTrackSid, 'TR_actual');
    assert.equal(live.saveCalled, 1);
  } finally {
    teardown();
  }
});

test('audio-live row with both loss webhooks missed enters durable recovery instead of becoming immortal', { concurrency: 1 }, async () => {
  const creator = new mongoose.Types.ObjectId();
  const live = makeDoc({
    status: 'live',
    mediaState: 'audio_live',
    creator,
    creatorDisconnectedAt: null,
    creatorParticipantSid: 'PA_gone',
    programTrackSid: 'TR_gone',
    programTrackName: 'echoo-studio-mix',
  });
  const provider = makeLivekitProviderMock();
  let participantReads = 0;
  provider.listParticipants = async () => {
    participantReads += 1;
    return [];
  };

  const { sweepModule, teardown } = await loadSweepWithMocks([live], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(participantReads, 2);
    assert.equal(live.status, 'live');
    assert.equal(live.mediaState, 'audio_disconnected');
    assert.ok(live.creatorDisconnectedAt instanceof Date);
    assert.equal(live.creatorParticipantSid, null);
    assert.equal(live.programTrackSid, null);
    assert.equal(live.programTrackName, null);
    assert.equal(live.saveCalled, 1);
  } finally {
    teardown();
  }
});

test('missed participant-left webhook establishes a durable recovery timestamp instead of ending live', { concurrency: 1 }, async () => {
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS = '24';
  const disconnected = makeDoc({
    status: 'live',
    mediaState: 'audio_disconnected',
    creator: new mongoose.Types.ObjectId(),
    creatorDisconnectedAt: null,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([disconnected], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(disconnected.status, 'live');
    assert.equal(disconnected.saveCalled, 1);
    assert.ok(disconnected.creatorDisconnectedAt instanceof Date);
  } finally {
    teardown();
  }
});

test('seven-hour disconnected live broadcast stays recoverable', { concurrency: 1 }, async () => {
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS = '24';
  const disconnected = makeDoc({
    status: 'live',
    mediaState: 'audio_disconnected',
    creatorDisconnectedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([disconnected], provider);
  try {
    assert.equal(sweepModule.getCreatorRecoveryHours(), 24);
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(disconnected.status, 'live');
    assert.equal(disconnected.saveCalled, 0);
  } finally {
    teardown();
  }
});

test('seven-hour established broadcast is not mistaken for a never-published show while republishing', { concurrency: 1 }, async () => {
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS = '24';
  const recovering = makeDoc({
    status: 'live',
    mediaState: 'creator_connecting',
    creatorDisconnectedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    startedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    updatedAt: new Date(),
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([recovering], provider);
  try {
    assert.equal(sweepModule.isStuck(recovering), false);
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(recovering.status, 'live');
    assert.equal(recovering.failureReason, null);
    assert.equal(recovering.saveCalled, 0);
  } finally {
    teardown();
  }
});

test('expired disconnected live broadcast is reaped only after creator absence is verified', { concurrency: 1 }, async () => {
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS = '1';
  const disconnected = makeDoc({
    status: 'live',
    mediaState: 'audio_disconnected',
    creator: new mongoose.Types.ObjectId(),
    creatorDisconnectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([disconnected], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 1);
    assert.equal(disconnected.status, 'completed');
    assert.match(disconnected.failureReason, /did not restore program audio within 1 hours/);
  } finally {
    teardown();
  }
});

test('creator participant without program audio cannot make an expired recovery immortal', { concurrency: 1 }, async () => {
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS = '1';
  const creator = new mongoose.Types.ObjectId();
  const disconnected = makeDoc({
    status: 'live',
    mediaState: 'audio_disconnected',
    creator,
    creatorDisconnectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  });
  const provider = makeLivekitProviderMock();
  provider.listParticipants = async () => [{
    sid: 'PA_connected_no_audio',
    metadata: JSON.stringify({ role: 'creator', userId: String(creator) }),
    tracks: [],
  }];
  const { sweepModule, teardown } = await loadSweepWithMocks([disconnected], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 1);
    assert.equal(disconnected.status, 'completed');
    assert.match(disconnected.failureReason, /did not restore program audio within 1 hours/);
  } finally {
    teardown();
  }
});

test('expired recovery heals when LiveKit has the replacement creator program track', { concurrency: 1 }, async () => {
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS = '1';
  const creator = new mongoose.Types.ObjectId();
  const disconnected = makeDoc({
    status: 'live',
    mediaState: 'audio_disconnected',
    creator,
    creatorDisconnectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    programTrackSid: null,
    programTrackName: null,
    creatorParticipantSid: null,
  });
  const provider = makeLivekitProviderMock();
  provider.listParticipants = async () => [{
    sid: 'PA_replacement',
    identity: String(creator),
    metadata: JSON.stringify({ role: 'creator', userId: String(creator) }),
    tracks: [{
      sid: 'TR_replacement',
      name: 'echoo-studio-mix',
      mimeType: 'audio/opus',
      muted: false,
    }],
  }];
  const { sweepModule, teardown } = await loadSweepWithMocks([disconnected], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(disconnected.status, 'live');
    assert.equal(disconnected.mediaState, 'audio_live');
    assert.equal(disconnected.creatorDisconnectedAt, null);
    assert.equal(disconnected.creatorParticipantSid, 'PA_replacement');
    assert.equal(disconnected.programTrackSid, 'TR_replacement');
    assert.equal(disconnected.programTrackName, 'echoo-studio-mix');
    assert.equal(disconnected.saveCalled, 1);
  } finally {
    teardown();
  }
});

test('connected creator with missing program track starts a durable recovery lease', { concurrency: 1 }, async () => {
  process.env.LIVEKIT_CREATOR_RECOVERY_TTL_HOURS = '24';
  const creator = new mongoose.Types.ObjectId();
  const disconnected = makeDoc({
    status: 'live',
    mediaState: 'audio_disconnected',
    creator,
    creatorDisconnectedAt: null,
    updatedAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  const provider = makeLivekitProviderMock();
  provider.listParticipants = async () => [{
    sid: 'PA_connected_no_program',
    metadata: JSON.stringify({ role: 'creator', userId: String(creator) }),
    tracks: [],
  }];
  const { sweepModule, teardown } = await loadSweepWithMocks([disconnected], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(disconnected.status, 'live');
    assert.ok(disconnected.creatorDisconnectedAt instanceof Date);
    assert.equal(disconnected.saveCalled, 1);
  } finally {
    teardown();
  }
});

test('stuck starting broadcasts are failed with a reason and endedAt', { concurrency: 1 }, async () => {
  const doc = makeDoc({
    status: 'starting',
    updatedAt: new Date(Date.now() - 45 * 60 * 1000),
    livekitIngressId: 'IN_ingress-1',
    livekitEgressId: null,
    livekitRoomName: null,
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([doc], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 1);
    assert.equal(result.failed, 0);
    assert.equal(doc.status, 'failed');
    assert.match(doc.failureReason, /^Orphan sweep:/);
    assert.ok(doc.endedAt instanceof Date);
    assert.equal(doc.saveCalled, 1);
    assert.deepEqual(doc.saveSnapshots[0], {
      status: 'failed',
      livekitRoomName: null,
      livekitIngressId: null,
      livekitEgressId: null,
    });
    assert.equal(provider.calls[0].op, 'stopIngress');
    assert.equal(provider.calls[0].id, 'IN_ingress-1');
    assert.equal(provider.calls[1].op, 'endRoom');
    assert.match(provider.calls[1].roomName, /^echoo-broadcast-/);
  } finally {
    teardown();
  }
});

test('stuck ending broadcasts are completed with endedAt and cleaned up', { concurrency: 1 }, async () => {
  const doc = makeDoc({
    status: 'ending',
    updatedAt: new Date(Date.now() - 45 * 60 * 1000),
    livekitEgressId: 'EG_egress-1',
    livekitRoomName: null,
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([doc], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 1);
    assert.equal(doc.status, 'completed');
    assert.equal(doc.failureReason, null);
    assert.ok(doc.endedAt instanceof Date);
    assert.equal(doc.saveSnapshots[0].status, 'completed');
    assert.equal(provider.calls.map((c) => c.op).join(','), 'stopEgress,endRoom');
    assert.equal(provider.calls[0].id, 'EG_egress-1');
    // The provider derives the room name from the broadcast id, not the
    // stored livekitRoomName field.
    assert.equal(provider.calls[1].roomName, `echoo-broadcast-${doc._id}`);
  } finally {
    teardown();
  }
});

test('cleanup runs ingress first so the room source stops publishing', { concurrency: 1 }, async () => {
  const doc = makeDoc({
    status: 'starting',
    updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    livekitIngressId: 'IN_a',
    livekitEgressId: 'EG_b',
  });
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([doc], provider);
  try {
    await sweepModule.sweep();
    assert.equal(provider.calls[0].op, 'stopIngress');
    assert.equal(provider.calls[1].op, 'stopEgress');
    assert.equal(provider.calls[2].op, 'endRoom');
  } finally {
    teardown();
  }
});

test('individual LiveKit failures do not block the state transition', { concurrency: 1 }, async () => {
  const doc = makeDoc({
    status: 'starting',
    updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    livekitIngressId: 'IN_fail',
  });
  const provider = {
    calls: [],
    async stopIngress() {
      throw new Error('ingress is gone');
    },
    async stopEgress() {
      return null;
    },
    async deleteRoom() {
      throw new Error('room already deleted');
    },
  };
  const { sweepModule, teardown } = await loadSweepWithMocks([doc], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 1);
    assert.equal(result.failed, 0);
    assert.equal(doc.status, 'failed');
  } finally {
    teardown();
  }
});
test('a broadcast resolved by another process between query and reap is skipped', { concurrency: 1 }, async () => {
  const doc = makeDoc({
    status: 'starting',
    updatedAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  // The controller already moved it to `live`; the re-read returns that state.
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([doc], provider);
  try {
    // Mutate the doc in place before sweep() re-reads it, simulating the
    // other process winning the race.
    doc.status = 'live';
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(provider.calls.length, 0);
    assert.equal(doc.saveCalled, 0);
  } finally {
    teardown();
  }
});

test('state-transition errors mark the sweep as failed but never crash the caller', { concurrency: 1 }, async () => {
  const doc = makeDoc({
    status: 'ending',
    updatedAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  const saveError = new Error('database write failed');
  doc.save = async () => {
    throw saveError;
  };
  const provider = makeLivekitProviderMock();
  const { sweepModule, teardown } = await loadSweepWithMocks([doc], provider);
  try {
    const result = await sweepModule.sweep();
    assert.equal(result.swept, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.errors[0], 'database write failed');
    assert.equal(doc.status, 'ending'); // never partially transitioned — save failed, so no fields were mutated
  } finally {
    teardown();
  }
});

test('startOrphanSweep is non-blocking and survives sweep errors', { concurrency: 1 }, async () => {
  // No LiveKit configured → sweep returns immediately; the hook must resolve
  // without throwing and without crashing process startup.
  delete process.env.LIVEKIT_URL;
  process.env.LIVEKIT_API_SECRET = '';
  const sweepModule = await import('../src/services/livekitOrphanSweep.js');
  await new Promise((resolve) => {
    let settled = false;
    sweepModule.startOrphanSweep();
    setTimeout(() => {
      settled = true;
      resolve();
    }, 50);
    void settled;
  });
  // If we get here, the hook did not throw synchronously or crash the process.
  assert.ok(true);
});
