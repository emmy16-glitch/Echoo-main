import test from 'node:test';
import assert from 'node:assert/strict';
import Broadcast from '../src/models/Broadcast.js';
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
        segmentSeconds: 600, updatedAt: new Date('2026-10-26T08:31:00Z'),
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
  } finally {
    Broadcast.findOne = original;
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
