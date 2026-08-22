import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  audioAccessFilter,
  isAudioAccessibleToUser,
} from '../src/services/audioAccess.js';
import Audio from '../src/models/Audio.js';

test('audio visibility permits public media and private owner media only', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();

  assert.equal(
    isAudioAccessibleToUser({ artist: ownerId, isPublic: true, isDeleted: false }, otherId),
    true
  );
  assert.equal(
    isAudioAccessibleToUser({ artist: ownerId, isPublic: false, isDeleted: false }, ownerId),
    true
  );
  assert.equal(
    isAudioAccessibleToUser({ artist: ownerId, isPublic: false, isDeleted: false }, otherId),
    false
  );
  assert.equal(
    isAudioAccessibleToUser({ artist: ownerId, isPublic: true, isDeleted: true }, ownerId),
    false
  );
  assert.equal(isAudioAccessibleToUser(null, ownerId), false);
});

test('audio access query always excludes deleted media and scopes private owner access', () => {
  const userId = new mongoose.Types.ObjectId();
  const filter = audioAccessFilter(userId);

  assert.equal(filter.isDeleted, false);
  assert.deepEqual(filter.$or[0], { isPublic: true });
  assert.deepEqual(filter.$or[1], { artist: userId });

  const publicOnly = audioAccessFilter();
  assert.deepEqual(publicOnly.$or, [{ isPublic: true }]);
});

test('Audio play/like counter methods use atomic database updates', async () => {
  const audio = new Audio({
    title: 'Atomic counter test',
    artist: new mongoose.Types.ObjectId(),
    filename: 'counter-test.wav',
    originalName: 'counter-test.wav',
    fileSize: 100,
    fileUrl: '/uploads/audio/counter-test.wav',
    fileKey: `counter-${new mongoose.Types.ObjectId()}`,
    mimeType: 'audio/wav',
    playCount: 4,
    likeCount: 2,
  });

  const original = Audio.findOneAndUpdate;
  const calls = [];
  Audio.findOneAndUpdate = async (filter, update, options) => {
    calls.push({ filter, update, options });
    return { playCount: 5, likeCount: 3 };
  };

  try {
    await audio.incrementPlays();
    await audio.incrementLikes();

    assert.deepEqual(calls[0].update, { $inc: { playCount: 1 } });
    assert.deepEqual(calls[1].update, { $inc: { likeCount: 1 } });
    assert.equal(calls[0].options.returnDocument, 'after');
    assert.equal(audio.playCount, 5);
    assert.equal(audio.likeCount, 3);
  } finally {
    Audio.findOneAndUpdate = original;
  }
});
