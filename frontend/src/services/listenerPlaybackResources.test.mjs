import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../Components/ListenerV2/ListenerV2.jsx', import.meta.url),
  'utf8'
);

test('offline Listener blob URLs are released after replacement or unmount', () => {
  assert.match(source, /const source = String\(currentTrack\?\.fileUrl \|\| ''\)/);
  assert.match(source, /if \(!source\.startsWith\('blob:'\)\) return undefined/);
  assert.match(source, /return \(\) => URL\.revokeObjectURL\(source\)/);
});

test('superseded asynchronous playback requests release unused blobs', () => {
  assert.match(source, /requestId !== playbackRequestRef\.current/);
  assert.match(source, /supersededUrl\.startsWith\('blob:'\)/);
  assert.match(source, /URL\.revokeObjectURL\(supersededUrl\)/);
});
