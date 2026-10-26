import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Broadcast from '../src/models/Broadcast.js';
import Audio from '../src/models/Audio.js';
import BroadcastProcessingJob from '../src/models/BroadcastProcessingJob.js';
import { getBroadcastRecordingProgress } from '../src/controllers/broadcastRecordingProgressController.js';

const makeResponse = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  status(code) { this.statusCode = code; return this; },
  set(key, value) { this.headers[key] = value; return this; },
  json(payload) { this.body = payload; return this; },
});

test('recording progress is owner-scoped and never exposes private archive paths', async () => {
  const original = Broadcast.findOne;
  const originalJob = BroadcastProcessingJob.findOne;
  BroadcastProcessingJob.findOne = () => ({ select: () => ({ lean: async () => null }) });
  const originalReplayDir = process.env.REPLAY_ARCHIVE_DIR;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-progress-'));
  process.env.REPLAY_ARCHIVE_DIR = temp;
  const attemptId = `${Date.now()}-abcdef12`;
  const recording = {
    _id: '507f1f77bcf86cd799439091',
    status: 'live',
    replayStatus: 'none',
    startedAt: new Date('2026-10-26T08:00:00Z'),
    serverRecording: {
      status: 'active',
      startedAt: new Date('2026-10-26T08:00:00Z'),
      segments: {
        status: 'recording', completedSegments: 3, segmentBytes: 30000000,
        segmentSeconds: 600, attemptId, updatedAt: new Date('2026-10-26T08:31:00Z'),
        privatePath: '/secret/private/recorder-file.mp3',
      },
    },
  };
  let query;
  Broadcast.findOne = (filter) => {
    query = filter;
    return { select: async () => recording };
  };
  try {
    const storageDir = path.join(temp, 'segments', recording._id, attemptId);
    await fs.mkdir(storageDir, { recursive: true });
    for (let i = 0; i < 3; i += 1) {
      await fs.writeFile(path.join(storageDir, `part-${String(i).padStart(6, '0')}.mp3`), Buffer.alloc(8192, 1));
    }
    const response = makeResponse();
    await getBroadcastRecordingProgress({
      params: { broadcastId: String(recording._id) },
      userId: '507f1f77bcf86cd799439011',
    }, response, (error) => { throw error; });
    assert.equal(String(query.creator), '507f1f77bcf86cd799439011');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.completedSegments, 3);
    assert.equal(response.body.data.protectedSeconds, 1800);
    assert.equal(response.body.data.fullReplaySaved, false);
    assert.doesNotMatch(JSON.stringify(response.body), /secret\/private|recorder-file/);
    // Simulate an ephemeral disk losing one segment while MongoDB persists.
    await fs.rm(path.join(storageDir, 'part-000002.mp3'));
    const missing = makeResponse();
    await getBroadcastRecordingProgress({
      params: { broadcastId: String(recording._id) },
      userId: '507f1f77bcf86cd799439011',
    }, missing, (error) => { throw error; });
    assert.equal(missing.body.data.segmentStatus, 'degraded');
    assert.equal(missing.body.data.completedSegments, 2);
    assert.match(missing.body.data.error, /missing from storage/);
  } finally {
    Broadcast.findOne = original;
    BroadcastProcessingJob.findOne = originalJob;
    if (originalReplayDir === undefined) delete process.env.REPLAY_ARCHIVE_DIR;
    else process.env.REPLAY_ARCHIVE_DIR = originalReplayDir;
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('a creator cannot discover other accounts recordings through progress API', async () => {
  const original = Broadcast.findOne;
  Broadcast.findOne = () => ({ select: async () => null });
  try {
    const response = makeResponse();
    await getBroadcastRecordingProgress({
      params: { broadcastId: '507f1f77bcf86cd799439092' },
      userId: '507f1f77bcf86cd799439011',
    }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 404);
    assert.equal(response.body.error.code, 'BROADCAST_NOT_FOUND');
  } finally {
    Broadcast.findOne = original;
  }
});


test('recording progress refuses to claim 100% saved when the actual audio file vanished', async () => {
  const original = Broadcast.findOne;
  const originalAudio = Audio.findById;
  const originalJob = BroadcastProcessingJob.findOne;
  BroadcastProcessingJob.findOne = () => ({ select: () => ({ lean: async () => null }) });
  const id = '507f1f77bcf86cd799439099';
  Broadcast.findOne = () => ({ select: async () => ({
    _id: id, status: 'completed', replayStatus: 'ready',
    replayAudioId: '507f1f77bcf86cd799439077',
    startedAt: new Date('2026-10-26T08:00:00Z'), endedAt: new Date('2026-10-26T08:01:00Z'),
    serverRecording: { segments: { status: 'idle', completedSegments: 0 } },
  }) });
  Audio.findById = () => ({ select: async () => ({
    filename: 'file-that-does-not-exist.mp3', fileSize: 20480,
    storage: 'local', cloudKey: null, isDeleted: false,
  }) });
  try {
    const response = makeResponse();
    await getBroadcastRecordingProgress({ params: { broadcastId: id }, userId: id }, response,
      error => { throw error; });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.fullReplaySaved, false);
    assert.equal(response.body.data.replayFileUnavailable, true);
  } finally {
    Broadcast.findOne = original;
    Audio.findById = originalAudio;
    BroadcastProcessingJob.findOne = originalJob;
  }
});

test('recording recovery returns durable job state without claiming 100% before save', async () => {
  const previous = Broadcast.findOne;
  const previousJob = BroadcastProcessingJob.findOne;
  const id = '507f1f77bcf86cd799439088';
  Broadcast.findOne = () => ({ select: async () => ({
    _id: id, status: 'completed', replayStatus: 'incomplete',
    serverRecording: { segments: { completedSegments: 0, status: 'degraded' } },
  }) });
  BroadcastProcessingJob.findOne = () => ({ select: () => ({ lean: async () => ({
    status: 'failed', attempts: 4, maxAttempts: 60, progress: 90,
    error: 'Server incomplete; local recovery needed',
  }) }) });
  try {
    const response = makeResponse();
    await getBroadcastRecordingProgress({params:{broadcastId:id},userId:id},response,error=>{throw error;});
    assert.equal(response.body.data.finalization.status,'failed');
    assert.equal(response.body.data.finalization.percent,90);
    assert.equal(response.body.data.fullReplaySaved,false);
  } finally {
    Broadcast.findOne=previous;
    BroadcastProcessingJob.findOne=previousJob;
  }
});

test('creator retry is authenticated and limited to completed broadcasts', async () => {
  const routes=await fs.readFile(new URL('../src/routes/broadcastRoutes.js',import.meta.url),'utf8');
  const source=await fs.readFile(new URL('../src/controllers/broadcastRecordingProgressController.js',import.meta.url),'utf8');
  assert.match(routes,/recording-progress\/retry', authenticate, requireCreator, retryBroadcastRecordingFinalization/);
  assert.match(source,/BROADCAST_STILL_ACTIVE/);
  assert.match(source,/retryRecordingFinalization\(broadcast\._id, \{ repairMissing \}\)/);
});
