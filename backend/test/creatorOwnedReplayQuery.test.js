import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { creatorOwnedReplayQuery } from '../src/services/creatorOwnedReplayQuery.js';

const matchesQuery = (row, query) => Object.entries(query).every(([key, value]) => (
  key === '$or'
    ? value.some((condition) => matchesQuery(row, condition))
    : String(row[key]) === String(value)
));

test('a stale linked replay ID cannot resolve another creator\'s recording', () => {
  const query = creatorOwnedReplayQuery('creator-a', {
    $or: [{ sourceBroadcast: 'broadcast-a' }, { _id: 'foreign-replay' }],
  });
  assert.equal(query.artist, 'creator-a');
  assert.equal(query.isDeleted, false);
  assert.equal(matchesQuery({
    _id: 'foreign-replay', sourceBroadcast: 'broadcast-b',
    artist: 'creator-b', isDeleted: false,
  }, query), false);
  assert.equal(matchesQuery({
    _id: 'foreign-replay', sourceBroadcast: 'broadcast-b',
    artist: 'creator-a', isDeleted: false,
  }, query), true);
  assert.equal(matchesQuery({
    _id: 'foreign-replay', sourceBroadcast: 'broadcast-b',
    artist: 'creator-a', isDeleted: true,
  }, query), false);
});

test('caller-supplied conditions cannot override replay ownership or deletion rules', () => {
  const query = creatorOwnedReplayQuery('creator-a', {
    _id: 'replay-id', artist: 'creator-b', isDeleted: true,
  });
  assert.deepEqual(query, { _id: 'replay-id', artist: 'creator-a', isDeleted: false });
});

test('both post-broadcast recovery and replay finalization use owner-scoped lookups', async () => {
  const recovery = await readFile(
    new URL('../src/services/broadcastRecoveryService.js', import.meta.url), 'utf8'
  );
  const replay = await readFile(
    new URL('../src/services/broadcastReplayService.js', import.meta.url), 'utf8'
  );
  assert.match(recovery, /Audio\.findOne\(creatorOwnedReplayQuery\(userId, \{/);
  assert.match(replay, /Audio\.findOne\(creatorOwnedReplayQuery\(broadcastCreatorId, \{ fileKey \}\)\)/);
  assert.match(replay, /Audio\.findOne\(creatorOwnedReplayQuery\(broadcastCreatorId, \{ _id: linkedId \}\)\)/);
  const idempotency = replay.slice(replay.indexOf('const already ='), replay.indexOf('if (existing)'));
  assert.doesNotMatch(idempotency, /Audio\.findById\(linkedId\)/);
});
