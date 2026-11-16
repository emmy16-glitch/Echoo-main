import test from 'node:test';
import assert from 'node:assert/strict';
import { resetListenerReceiverSamples, requestListenerPlaybackSession } from './listenerBackgroundPlayback.js';

test('background return discards old receiver stalls and starts a new observation window', () => {
  const entries = [{ receiverSample: { bytes: 100 }, receiverLastProgressAt: 10, receiverStallSamples: 8 },
    { receiverSample: { bytes: 200 }, receiverLastProgressAt: 20, receiverStallSamples: 3 }];
  resetListenerReceiverSamples(entries.values(), 90000);
  for (const entry of entries) {
    assert.equal(entry.receiverSample, null);
    assert.equal(entry.receiverLastProgressAt, 90000);
    assert.equal(entry.receiverStallSamples, 0);
  }
});
test('supported browsers are explicitly configured for listener playback', () => {
  const browser = { audioSession: { type: 'ambient' } };
  requestListenerPlaybackSession(browser);
  assert.equal(browser.audioSession.type, 'playback');
});
test('unsupported and restricted Audio Session APIs do not break listening', () => {
  assert.doesNotThrow(() => requestListenerPlaybackSession({}));
  assert.doesNotThrow(() => requestListenerPlaybackSession({ audioSession: Object.freeze({ type: 'ambient' }) }));
});
