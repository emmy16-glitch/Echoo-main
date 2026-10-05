'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  findEchooDeepLink,
  isPathInside,
  normalizeExternalWebUrl,
  parseEchooDeepLink,
} = require('../src/main/security');

test('external browser handoff accepts web URLs only', () => {
  assert.equal(normalizeExternalWebUrl('https://echoo.digi02.org/listen'), 'https://echoo.digi02.org/listen');
  assert.equal(normalizeExternalWebUrl('http://127.0.0.1:5273/test'), 'http://127.0.0.1:5273/test');
  assert.equal(normalizeExternalWebUrl('javascript:alert(1)'), null);
  assert.equal(normalizeExternalWebUrl('file:///C:/Windows/System32/cmd.exe'), null);
  assert.equal(normalizeExternalWebUrl('https://user:password@example.com'), null);
});

test('deep links map to allowlisted Echoo routes', () => {
  assert.equal(parseEchooDeepLink('echoo://listen/live/abc123'), '/listen/live/abc123');
  assert.equal(parseEchooDeepLink('echoo:///creator-studio/recordings'), '/creator-studio/recordings');
  assert.equal(parseEchooDeepLink('echoo://open?path=%2Flisten%2Flibrary'), '/listen/library');
  assert.equal(parseEchooDeepLink('echoo://settings'), null);
  assert.equal(parseEchooDeepLink('echoo://listen/../creator-studio'), null);
  assert.equal(parseEchooDeepLink('https://echoo.digi02.org/listen'), null);
});

test('command-line deep link discovery ignores unrelated arguments', () => {
  assert.equal(findEchooDeepLink(['Echoo.exe', '--hidden', 'echoo://listen/live/room']), '/listen/live/room');
  assert.equal(findEchooDeepLink(['Echoo.exe', '--hidden']), null);
});

test('filesystem containment blocks sibling-prefix and traversal targets', () => {
  const root = path.resolve('C:/Users/example/Desktop/Echoo Recordings');
  assert.equal(isPathInside(root, path.join(root, '2026', 'show.mp3')), true);
  assert.equal(isPathInside(root, `${root}-old/show.mp3`), false);
  assert.equal(isPathInside(root, path.resolve(root, '..', 'private.txt')), false);
});

