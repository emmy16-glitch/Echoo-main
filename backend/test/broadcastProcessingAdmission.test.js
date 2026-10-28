import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import BroadcastProcessingJob from '../src/models/BroadcastProcessingJob.js';
import { availableBroadcastJobQuery } from '../src/services/broadcastProcessingAdmission.js';

test('processing query excludes active broadcast without blocking another organization', async () => {
  const mongodb = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongodb.getUri());
    const organizationA = new mongoose.Types.ObjectId();
    const organizationB = new mongoose.Types.ObjectId();
    const now = new Date('2026-10-28T00:00:00Z');
    await BroadcastProcessingJob.create([
      { broadcastId: organizationA, jobType: 'audio_finalization', availableAt: now },
      { broadcastId: organizationA, jobType: 'transcript_completion', availableAt: now },
      { broadcastId: organizationB, jobType: 'audio_finalization', availableAt: now },
    ]);
    const claim = () => BroadcastProcessingJob.findOneAndUpdate(
      availableBroadcastJobQuery(new Set([String(organizationA)]), new Date(now.getTime() + 1)),
      { $set: { status: 'processing' } },
      { sort: { availableAt: 1, createdAt: 1 }, returnDocument: 'after' },
    );
    const other = await claim();
    assert.equal(String(other.broadcastId), String(organizationB));
    assert.equal(other.status, 'processing');
    const none = await claim();
    assert.equal(none, null, 'neither job from organization A can leapfrog its active save');
    const first = await BroadcastProcessingJob.findOneAndUpdate(
      availableBroadcastJobQuery(new Set(), new Date(now.getTime() + 1)),
      { $set: { status: 'processing' } }, { returnDocument: 'after' }
    );
    assert.equal(String(first.broadcastId), String(organizationA));
  } finally {
    await mongoose.disconnect().catch(() => null);
    await mongodb.stop();
  }
});

test('query respects availability and leaves older jobs in FIFO order', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  assert.deepEqual(availableBroadcastJobQuery(new Set(), now), {
    status: 'queued', availableAt: { $lte: now },
  });
  assert.deepEqual(availableBroadcastJobQuery(new Set(['broadcast-A']), now), {
    status: 'queued', availableAt: { $lte: now },
    broadcastId: { $nin: ['broadcast-A'] },
  });
});
