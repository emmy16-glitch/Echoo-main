import assert from 'node:assert/strict';
import test from 'node:test';

import { requestedPlaybackTime } from './listenerPlaybackRoute.js';

test('packaged HashRouter query timestamps resolve from router search state', () => {
  assert.equal(requestedPlaybackTime('?t=125.5'), 125.5);
  assert.equal(requestedPlaybackTime('?source=share&t=0'), 0);
});

test('invalid, empty, and negative timestamps never start playback', () => {
  assert.equal(requestedPlaybackTime(''), null);
  assert.equal(requestedPlaybackTime('?t='), null);
  assert.equal(requestedPlaybackTime('?t=-1'), null);
  assert.equal(requestedPlaybackTime('?t=not-a-number'), null);
  assert.equal(requestedPlaybackTime('?t=Infinity'), null);
});
