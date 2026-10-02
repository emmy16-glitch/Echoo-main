import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CREATOR_HARD_RECONNECT_DEADLINE_MS,
  LISTENER_HARD_RECONNECT_DEADLINE_MS,
  LIVE_RECOVERY_DELAYS_MS,
  LIVEKIT_RECONNECT_DELAYS_MS,
  hardReconnectDue,
  mediaElementIsPlaying,
  mediaTrackIsLive,
  normalizeConnectionQuality,
  playoutDelayForConnectionQuality,
  recoveryDelayMs,
  roomCanCarryMedia,
  roomIsConnected,
  shouldRetryRecovery,
  transportSampleAdvanced,
} from './liveRecoveryPolicy.js';
import { liveKitPublishOptionsFor } from './realtimeAudioQuality.js';

test('live recovery uses bounded exponential backoff', () => {
  assert.deepEqual(LIVE_RECOVERY_DELAYS_MS, [0, 1000, 2000, 4000, 8000]);
  assert.equal(recoveryDelayMs(0, () => 0.5), 0);
  assert.equal(recoveryDelayMs(3, () => 0.5), 4000);
  assert.equal(recoveryDelayMs(99, () => 0.5), 8000);
});

test('LiveKit gets a bounded fast reconnect schedule before Echoo replaces the room', () => {
  assert.deepEqual(LIVEKIT_RECONNECT_DELAYS_MS, [0, 500, 1000, 2000, 4000, 8000, 12000]);
  assert.equal(CREATOR_HARD_RECONNECT_DEADLINE_MS, 30000);
  assert.equal(LISTENER_HARD_RECONNECT_DEADLINE_MS, 30000);
});

test('playback health requires a connected, active media element', () => {
  assert.equal(mediaElementIsPlaying({ isConnected: true, paused: false, ended: false, readyState: 4 }), true);
  assert.equal(mediaElementIsPlaying({ isConnected: false, paused: false, ended: false, readyState: 4 }), false);
  assert.equal(mediaElementIsPlaying({ isConnected: true, paused: true, ended: false, readyState: 4 }), false);
});

test('room, track and retry predicates reject stale state', () => {
  assert.equal(roomIsConnected({ state: 'connected' }), true);
  assert.equal(roomIsConnected({ state: 'reconnecting' }), false);
  assert.equal(roomIsConnected({ state: 'signalReconnecting' }), false);
  assert.equal(roomCanCarryMedia({ state: 'connected' }), true);
  assert.equal(roomCanCarryMedia({ state: 'signalReconnecting' }), true);
  assert.equal(roomCanCarryMedia({ state: 'reconnecting' }), false);
  assert.equal(mediaTrackIsLive({ kind: 'audio', mediaStreamTrack: { readyState: 'live' } }), true);
  assert.equal(mediaTrackIsLive({ kind: 'audio', mediaStreamTrack: { readyState: 'ended' } }), false);
  assert.equal(shouldRetryRecovery({ attempt: 4, disposed: false, live: true }), true);
  assert.equal(shouldRetryRecovery({ attempt: 5, disposed: false, live: true }), false);
  assert.equal(shouldRetryRecovery({ attempt: 0, disposed: true, live: true }), false);
});

test('hard reconnect escalation is deadline and connectivity aware', () => {
  const startedAt = 1_000;
  assert.equal(hardReconnectDue({
    startedAt,
    now: startedAt + 29_999,
    deadlineMs: 30_000,
  }), false);
  assert.equal(hardReconnectDue({
    startedAt,
    now: startedAt + 30_000,
    deadlineMs: 30_000,
  }), true);
  assert.equal(hardReconnectDue({
    startedAt,
    now: startedAt + 60_000,
    deadlineMs: 30_000,
    online: false,
  }), false);
});

test('connection quality normalization is deterministic', () => {
  assert.equal(normalizeConnectionQuality('Excellent'), 'excellent');
  assert.equal(normalizeConnectionQuality('poor'), 'poor');
  assert.equal(normalizeConnectionQuality('LOST'), 'lost');
  assert.equal(normalizeConnectionQuality(''), 'unknown');
});

test('weaker connections receive a larger playout buffer', () => {
  const excellent = playoutDelayForConnectionQuality('excellent');
  const good = playoutDelayForConnectionQuality('good');
  const poor = playoutDelayForConnectionQuality('poor');
  const lost = playoutDelayForConnectionQuality('lost');

  assert.ok(excellent < good);
  assert.ok(good < poor);
  assert.ok(poor < lost);
  assert.ok(lost <= 0.75);
});

test('transport progress requires RTP counters to advance', () => {
  assert.equal(transportSampleAdvanced(null, { bytes: 10, packets: 1 }), true);
  assert.equal(
    transportSampleAdvanced({ bytes: 10, packets: 1 }, { bytes: 10, packets: 1 }),
    false,
  );
  assert.equal(
    transportSampleAdvanced({ bytes: 10, packets: 1 }, { bytes: 11, packets: 1 }),
    true,
  );
  assert.equal(
    transportSampleAdvanced({ bytes: 10, packets: 1 }, { bytes: 10, packets: 2 }),
    true,
  );
});

test('realtime broadcast audio keeps RED packet-loss protection enabled', () => {
  const options = liveKitPublishOptionsFor('broadcast_high');
  assert.equal(options.red, true);
  assert.equal(options.dtx, false);
  assert.equal(options.forceStereo, true);
  assert.equal(options.audioPreset.maxBitrate, 128000);
});
