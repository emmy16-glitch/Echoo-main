import assert from 'node:assert/strict';
import test from 'node:test';
import {
  curatedHelpSuggestions,
  getCuratedHelpWelcome,
  resolveCuratedHelpResponse,
} from './curatedHelp.js';

test('listener support returns playback guidance without user-state access', () => {
  const result = resolveCuratedHelpResponse('Why can I not hear sound or pause?', 'listener');
  assert.equal(result.topic, 'Playback');
  assert.match(result.answer, /persistent player/);
  assert.match(result.answer, /does not access account, room, chat, or playback data/);
});

test('creator copilot offers a local broadcast checklist', () => {
  const result = resolveCuratedHelpResponse('Give me a checklist before I go live', 'creator');
  assert.equal(result.topic, 'Broadcast checklist');
  assert.match(result.answer, /microphone input/);
  assert.match(result.answer, /not a generative AI service/);
});

test('creator fallback stays deterministic and refuses private-data access', () => {
  const first = resolveCuratedHelpResponse('How is the weather on Mars?', 'creator');
  const second = resolveCuratedHelpResponse('How is the weather on Mars?', 'creator');
  assert.deepEqual(first, second);
  assert.match(first.answer, /cannot access your private room, chat, audience, or account data/);
});

test('each authenticated context has a bounded local welcome and three suggestions', () => {
  assert.match(getCuratedHelpWelcome('listener').answer, /not a generative AI service/);
  assert.equal(curatedHelpSuggestions.listener.length, 3);
  assert.equal(curatedHelpSuggestions.creator.length, 3);
});
