import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';

import Audio from '../src/models/Audio.js';
import Playlist from '../src/models/Playlist.js';
import {
  boundedSearchText,
  escapeRegexLiteral,
  literalSearchPattern,
} from '../src/utils/queryText.js';

const source = (relativePath) =>
  fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('Audio comment counters exist and use atomic updates', async () => {
  const audio = new Audio({
    title: 'Comment counter test',
    artist: new mongoose.Types.ObjectId(),
    filename: 'comment-counter.wav',
    originalName: 'comment-counter.wav',
    fileSize: 100,
    fileUrl: '/uploads/audio/comment-counter.wav',
    fileKey: `comment-counter-${new mongoose.Types.ObjectId()}`,
    mimeType: 'audio/wav',
    commentCount: 2,
  });

  const original = Audio.findOneAndUpdate;
  const calls = [];
  Audio.findOneAndUpdate = async (filter, update, options) => {
    calls.push({ filter, update, options });
    return { commentCount: update.$inc.commentCount > 0 ? 3 : 2 };
  };

  try {
    await audio.incrementComments();
    await audio.decrementComments();

    assert.deepEqual(calls[0].update, { $inc: { commentCount: 1 } });
    assert.deepEqual(calls[1].update, { $inc: { commentCount: -1 } });
    assert.deepEqual(calls[1].filter.commentCount, { $gt: 0 });
    assert.equal(calls[0].options.returnDocument, 'after');
  } finally {
    Audio.findOneAndUpdate = original;
  }
});

test('Playlist reorder rejects duplicate IDs and preserves an exact permutation', async () => {
  const owner = new mongoose.Types.ObjectId();
  const first = new mongoose.Types.ObjectId();
  const second = new mongoose.Types.ObjectId();
  const playlist = new Playlist({
    name: 'Order audit',
    owner,
    tracks: [
      { trackId: first, addedBy: owner },
      { trackId: second, addedBy: owner },
    ],
  });

  playlist.save = async () => playlist;

  await assert.rejects(
    () => playlist.reorderTracks([first, first]),
    (error) => error?.code === 'INVALID_PLAYLIST_ORDER'
  );

  await playlist.reorderTracks([second, first]);
  assert.equal(String(playlist.tracks[0].trackId), String(second));
  assert.equal(String(playlist.tracks[1].trackId), String(first));
  assert.equal(playlist.trackCount, 2);
});

test('public regex search text is bounded and interpreted literally', () => {
  assert.equal(escapeRegexLiteral('echoo.*(live)?'), 'echoo\\.\\*\\(live\\)\\?');
  assert.equal(literalSearchPattern('  a+b  '), 'a\\+b');
  assert.equal(boundedSearchText('  Echoo  '), 'Echoo');

  assert.throws(
    () => boundedSearchText('x'.repeat(121), { maxLength: 120 }),
    (error) => error?.code === 'SEARCH_TOO_LONG' && error?.status === 400
  );
});

test('private broadcast chat is guarded on every HTTP access path', async () => {
  const chat = await source('src/controllers/chatController.js');
  assert.match(chat, /requireBroadcastAccess/);
  assert.match(chat, /!broadcast\.isPublic\s*&&\s*!isOwner/);
  assert.match(chat, /BROADCAST_PRIVATE/);
  assert.match(chat, /loadMessageWithAccess/);
});

test('logout invalidates previously-issued refresh tokens', async () => {
  const auth = await source('src/controllers/authController.js');
  assert.match(auth, /refreshTokenVersion:\s*1/);
  assert.match(auth, /\$inc:\s*\{\s*refreshTokenVersion:\s*1\s*\}/);
});

test('soft-deleted download metadata is revivable and progress is bounded', async () => {
  const downloads = await source('src/controllers/downloadsController.js');
  assert.match(downloads, /download\s*&&\s*!download\.isDeleted/);
  assert.match(downloads, /download\.isDeleted\s*=\s*false/);
  assert.match(downloads, /value\s*<\s*0\s*\|\|\s*value\s*>\s*100/);
  assert.match(downloads, /track\.isDeleted':\s*false/);
  assert.match(downloads, /track\.isPublic':\s*true/);
});

test('station upload failures clean new disk files and station search is literal', async () => {
  const routes = await source('src/routes/stationRoutes.js');
  assert.match(routes, /cleanupFailedStationUpload/);
  assert.match(routes, /res\.statusCode\s*<\s*400/);
  assert.match(routes, /escapeRegexLiteral/);
  assert.match(routes, /boundedSearchText/);
});
