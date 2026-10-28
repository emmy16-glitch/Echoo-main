import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRecoveryChunkTimeline } from '../src/services/recoveryChunkTimeline.js';

const clips = (...bounds) => bounds.map(([startMs, endMs], chunkIndex) => ({ chunkIndex, startMs, endMs }));

test('contiguous ordered recovery chunks are complete, including fractional final chunk', () => {
  assert.deepEqual(
    inspectRecoveryChunkTimeline(clips([0, 10000], [10000, 20000], [20000, 20480])),
    { valid: true, durationMs: 20480 }
  );
  assert.equal(inspectRecoveryChunkTimeline(clips([0, 10000], [10000.008, 15000])).valid, true);
});

test('numbered chunks with an audio gap must remain incomplete', () => {
  assert.deepEqual(
    inspectRecoveryChunkTimeline(clips([0, 10000], [12000, 22000])),
    { valid: false, reason: 'timeline-gap', chunkIndex: 1 }
  );
  assert.equal(inspectRecoveryChunkTimeline(clips([3000, 13000])).reason, 'timeline-gap');
});

test('numbered chunks with duplicated audio or invalid positions must remain incomplete', () => {
  assert.equal(inspectRecoveryChunkTimeline(clips([0, 10000], [9000, 19000])).reason, 'timeline-overlap');
  assert.equal(inspectRecoveryChunkTimeline([{ chunkIndex: 0, startMs: 0, endMs: 10000 }, { chunkIndex: 3, startMs: 10000, endMs: 20000 }]).reason, 'invalid-chunk-timing');
  assert.equal(inspectRecoveryChunkTimeline(clips([0, 0])).valid, false);
  assert.equal(inspectRecoveryChunkTimeline([]).valid, false);
});
