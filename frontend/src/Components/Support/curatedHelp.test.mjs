import assert from 'node:assert/strict';
import test from 'node:test';
import {
  curatedHelpSuggestions,
  getCuratedHelpWelcome,
  humanSupportEmailDraft,
  resolveCuratedHelpResponse,
} from './curatedHelp.js';

test('listener support returns playback guidance without user-state access', () => {
  const result = resolveCuratedHelpResponse('Why can I not hear sound or pause?', 'listener');
  assert.equal(result.topic, 'Playback');
  assert.match(result.answer, /persistent player/);
  assert.match(result.answer, /does not access account, room, chat, or playback data/);
});

test('listener connection troubleshooting remains bounded to local guidance', () => {
  const result = resolveCuratedHelpResponse('The player keeps reconnecting and loading', 'listener');
  assert.equal(result.topic, 'Connection troubleshooting');
  assert.match(result.answer, /cannot inspect the room’s live connection state/);
});

test('creator copilot offers a local broadcast checklist', () => {
  const result = resolveCuratedHelpResponse('Give me a checklist before I go live', 'creator');
  assert.equal(result.topic, 'Broadcast checklist');
  assert.match(result.answer, /microphone input/);
  assert.match(result.answer, /not a generative AI service/);
});

test('creator microphone-permission help does not claim control of the device', () => {
  const result = resolveCuratedHelpResponse('My browser permission for microphone is blocked', 'creator');
  assert.equal(result.topic, 'Microphone permissions');
  assert.match(result.answer, /site-permission controls/);
  assert.match(result.answer, /cannot see device permissions/);
});

test('creator fallback stays deterministic and refuses private-data access', () => {
  const first = resolveCuratedHelpResponse('How is the weather on Mars?', 'creator');
  const second = resolveCuratedHelpResponse('How is the weather on Mars?', 'creator');
  assert.deepEqual(first, second);
  assert.match(first.answer, /cannot access your private room, chat, audience, or account data/);
});

test('human-support draft has no recipient or prefilled user content', () => {
  assert.equal(humanSupportEmailDraft, 'mailto:?subject=Echoo%20human%20support%20request');
  assert.ok(!humanSupportEmailDraft.includes('body='));
});

test('each authenticated context has a bounded local welcome and four suggestions', () => {
  assert.match(getCuratedHelpWelcome('listener').answer, /not a generative AI service/);
  assert.equal(curatedHelpSuggestions.listener.length, 4);
  assert.equal(curatedHelpSuggestions.creator.length, 4);
});
