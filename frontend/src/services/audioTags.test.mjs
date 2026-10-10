import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeAudioTags } from './audioTags.js';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('audio tags normalize array and comma/newline input without duplicates', () => {
  assert.deepEqual(normalizeAudioTags([' gm ', '#Gospel', 'gm', '', null]), ['gm', 'Gospel']);
  assert.deepEqual(normalizeAudioTags('gm, gospel\nprayer'), ['gm', 'gospel', 'prayer']);
  assert.deepEqual(normalizeAudioTags(null), []);
});

test('audio tag normalization follows backend per-tag and count limits', () => {
  const values = Array.from({ length: 22 }, (_, index) => `tag-${index}-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
  const normalized = normalizeAudioTags(values);
  assert.equal(normalized.length, 20);
  assert.ok(normalized.every((tag) => tag.length <= 30));
});

test('Creator and Listener recording views render saved tags from normalized audio data', () => {
  const audioService = read('./audioService.js');
  const listenerService = read('./listenerService.js');
  const creatorLibrary = read('../Components/CreatorStudio/CreatorContentWorkspace.jsx');
  const creatorDetails = read('../Components/CreatorStudio/CreatorAudioDetailModal.jsx');
  const listenerDiscover = read('../Components/ListenerV2/ListenerV2.jsx');
  const listenerDetails = read('../Components/ListenerAudioDetail/ListenerAudioDetail.jsx');

  assert.match(audioService, /tags: normalizeAudioTags\(track\.tags\)/);
  assert.match(listenerService, /tags: normalizeAudioTags\(source\.tags/);
  assert.match(creatorLibrary, /className="eca-tags"/);
  assert.match(creatorDetails, /className="creator-audio-saved-tags"/);
  assert.match(listenerDiscover, /className="listener-v2-recording-tags"/);
  assert.match(listenerDetails, /className="replay-tags"/);
});

test('web auth cards remain centered over the studio photo with a translucent navy surface', () => {
  const auth = read('../Components/Register/auth-reference.css');
  const approved = read('../Components/Register/auth-approved-studio.css');
  assert.match(auth, /\.echoo-auth-reference:not\(\.is-profile\):not\(\.is-auth-status\) \.ear-auth-card \{[\s\S]*?justify-self: center/);
  assert.match(auth, /backdrop-filter: blur\(12px\)/);
  assert.match(approved, /--ear-auth-card: rgba\(13, 32, 60, \.64\)/);
  assert.match(approved, /background: var\(--ear-auth-card\)/);
  assert.match(approved, /--ear-auth-line: rgba\(173, 197, 231, \.2\)/);
  assert.match(approved, /@media \(max-height: 620px\)/);
  assert.match(approved, /border: 1px solid rgba\(173, 197, 231, \.13\)/);
  assert.match(approved, /box-shadow: 0 0 0 2px rgba\(72, 137, 255, \.24\)/);
});
