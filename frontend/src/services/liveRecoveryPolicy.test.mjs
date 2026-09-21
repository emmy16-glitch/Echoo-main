import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_RECOVERY_DELAYS_MS,
  mediaElementIsPlaying,
  mediaTrackIsLive,
  recoveryDelayMs,
  roomIsConnected,
  shouldRetryRecovery,
} from './liveRecoveryPolicy.js';

test('live recovery uses bounded exponential backoff', () => {
  assert.deepEqual(LIVE_RECOVERY_DELAYS_MS, [0, 1000, 2000, 4000, 8000]);
  assert.equal(recoveryDelayMs(0, () => 0.5), 0);
  assert.equal(recoveryDelayMs(3, () => 0.5), 4000);
  assert.equal(recoveryDelayMs(99, () => 0.5), 8000);
});

test('playback health requires a connected, active media element', () => {
  assert.equal(mediaElementIsPlaying({ isConnected: true, paused: false, ended: false, readyState: 4 }), true);
  assert.equal(mediaElementIsPlaying({ isConnected: false, paused: false, ended: false, readyState: 4 }), false);
  assert.equal(mediaElementIsPlaying({ isConnected: true, paused: true, ended: false, readyState: 4 }), false);
});

test('room, track and retry predicates reject stale state', () => {
  assert.equal(roomIsConnected({ state: 'connected' }), true);
  assert.equal(roomIsConnected({ state: 'reconnecting' }), false);
  assert.equal(mediaTrackIsLive({ kind: 'audio', mediaStreamTrack: { readyState: 'live' } }), true);
  assert.equal(mediaTrackIsLive({ kind: 'audio', mediaStreamTrack: { readyState: 'ended' } }), false);
  assert.equal(shouldRetryRecovery({ attempt: 4, disposed: false, live: true }), true);
  assert.equal(shouldRetryRecovery({ attempt: 5, disposed: false, live: true }), false);
  assert.equal(shouldRetryRecovery({ attempt: 0, disposed: true, live: true }), false);
});
