import test from 'node:test';
import assert from 'node:assert/strict';
import { getCreatorCopilotState } from './creatorCopilotState.js';

test('a zero-station creator receives truthful first-station guidance', () => {
  const state = getCreatorCopilotState({ ownedStationCount: 0, audioCount: 0 });
  assert.equal(state.hasStation, false);
  assert.match(state.title, /almost ready/i);
  assert.ok(state.suggestions.includes('Create my first station'));
});

test('an established creator never receives first-station guidance', () => {
  const state = getCreatorCopilotState({ ownedStationCount: 2, audioCount: 1 });
  assert.equal(state.hasStation, true);
  assert.doesNotMatch(state.title, /first station/i);
  assert.ok(!state.suggestions.includes('Create my first station'));
  assert.ok(state.suggestions.includes('Manage recent audio'));
});

test('a live creator receives live-session guidance', () => {
  const state = getCreatorCopilotState({ ownedStationCount: 1, isLive: true });
  assert.match(state.title, /live right now/i);
  assert.ok(state.suggestions.includes('Check my live connection'));
});
