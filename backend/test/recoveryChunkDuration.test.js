import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryChunkDurationMatches } from '../src/services/recoveryChunkDuration.js';

const perSecond = 48000 * 2 * 3;

test('accept legitimate rounded 10-second and final fractional PCM chunks', () => {
  assert.equal(recoveryChunkDurationMatches({ pcmBytes: perSecond * 10, startMs: 10000, endMs: 20000 }), true);
  assert.equal(recoveryChunkDurationMatches({ pcmBytes: perSecond / 2, startMs: 20000, endMs: 20500 }), true);
  assert.equal(recoveryChunkDurationMatches({ pcmBytes: perSecond, startMs: 0, endMs: 1001 }), true);
});

test('reject truncated, forged, or misaligned chunk durations', () => {
  assert.equal(recoveryChunkDurationMatches({ pcmBytes: perSecond, startMs: 0, endMs: 10000 }), false);
  assert.equal(recoveryChunkDurationMatches({ pcmBytes: perSecond * 10, startMs: 0, endMs: 8000 }), false);
  assert.equal(recoveryChunkDurationMatches({ pcmBytes: perSecond + 1, startMs: 0, endMs: 1000 }), false);
  assert.equal(recoveryChunkDurationMatches({ pcmBytes: 0, startMs: 0, endMs: 1000 }), false);
});
