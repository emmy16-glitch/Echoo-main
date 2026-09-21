import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAudioTrimRange } from './audioTrimService.js';

test('client trim validation accepts a bounded range', () => {
  assert.deepEqual(
    validateAudioTrimRange({ startSeconds: '1.5', endSeconds: '8', duration: 10 }),
    { startSeconds: 1.5, endSeconds: 8 }
  );
});

test('client trim validation rejects reversed and out-of-bounds ranges', () => {
  assert.throws(() => validateAudioTrimRange({ startSeconds: 5, endSeconds: 2, duration: 10 }));
  assert.throws(() => validateAudioTrimRange({ startSeconds: 0, endSeconds: 11, duration: 10 }));
});
