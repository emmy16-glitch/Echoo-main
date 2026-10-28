import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Audio from '../src/models/Audio.js';
import { recoverBroadcastForReplay } from '../src/services/broadcastRecoveryService.js';
import Broadcast from '../src/models/Broadcast.js';
import BroadcastAudioChunk from '../src/models/BroadcastAudioChunk.js';
import {
  finalizeBroadcastReplay,
  isRealMp3Bytes,
  estimateReplayDurationSeconds,
  isTrustedCompletedServerReplay,
} from '../src/services/broadcastReplayService.js';

// Server replay finalization contract:
// - bounded chunks in -> canonical MP3 out, never a giant client upload
// - real MP3 bytes (audio/mpeg), never renamed WAV
// - idempotent across retries (single Audio per broadcast)
// - gaps stay incomplete without creating anything
// - empty sessions create nothing and keep recovery paths

let memdb = null;

const pcmWavChunk = ({ seconds = 0.5, seed = 0 } = {}) => {
  const sampleRate = 48000;
  const channels = 2;
  const bytesPerSample = 3;
  const frames = Math.floor(sampleRate * seconds);
  const dataBytes = frames * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(24, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < dataBytes; i += 1) {
    buffer[44 + i] = (seed + i * 7) % 256;
  }
  return { buffer, frames };
};

test.before(async () => {
  // Force local-only archiving: never touch real object storage from tests.
  process.env.AUDIO_STORAGE_PROVIDER = 'off';
  delete process.env.AUDIO_S3_BUCKET;
  memdb = await MongoMemoryServer.create();
  await mongoose.connect(memdb.getUri());
});

test.after(async () => {
  await mongoose.disconnect().catch(() => null);
  await memdb?.stop().catch(() => null);
});

const makeBroadcast = async () => {
  const creatorId = new mongoose.Types.ObjectId();
  const stationId = new mongoose.Types.ObjectId();
  const broadcast = await Broadcast.create({
    creator: creatorId,
    station: stationId,
    title: 'Replay QA broadcast',
    startTime: new Date(),
    status: 'live',
  });
  return { broadcast, creatorId };
};

const storeChunks = async (broadcastId, creatorId, count, { skipIndex = -1 } = {}) => {
  const dir = path.join(process.cwd(), 'uploads', 'transcript-chunks', String(broadcastId));
  await fs.mkdir(dir, { recursive: true });
  const stored = [];
  for (let index = 0; index < count; index += 1) {
    if (index === skipIndex) continue;
    const { buffer } = pcmWavChunk({ seed: index });
    const chunkId = `qa-chunk-${broadcastId}-${index}`;
    const filePath = path.join(dir, `${index}-${chunkId}.wav`);
    await fs.writeFile(filePath, buffer, { flag: 'wx' }).catch(() => null);
    const startMs = index * 500;
    stored.push(await BroadcastAudioChunk.create({
      broadcastId,
      creatorId,
      chunkId,
      chunkIndex: index,
      startMs,
      endMs: startMs + 500,
      filePath,
      mimeType: 'audio/wav',
      sizeBytes: buffer.length,
      sampleRate: 48000,
      channels: 2,
      bitDepth: 24,
      status: 'pending',
    }));
  }
  return stored;
};

test('isRealMp3Bytes accepts ID3 and frame-sync, rejects WAV', () => {
  assert.equal(isRealMp3Bytes(Buffer.from([0x49, 0x44, 0x33, 0x04])), true);
  assert.equal(isRealMp3Bytes(Buffer.from([0xff, 0xfb, 0x90, 0x00])), true);
  assert.equal(isRealMp3Bytes(Buffer.from('RIFF....WAVE')), false);
  assert.equal(isRealMp3Bytes(Buffer.alloc(0)), false);
});



test('interrupted or truncated server MP3 is never trusted as a complete replay', () => {
  const oneMinutePcm = 48000 * 2 * 2 * 60;

  assert.equal(isTrustedCompletedServerReplay({
    status: 'failed',
    persistedFileBytes: 1000,
    actualFileBytes: 1000,
    pcmBytes: oneMinutePcm,
    probedDurationSeconds: 60,
  }), false);

  assert.equal(isTrustedCompletedServerReplay({
    status: 'completed',
    persistedFileBytes: 2000,
    actualFileBytes: 1000,
    pcmBytes: oneMinutePcm,
    probedDurationSeconds: 60,
  }), false);

  assert.equal(isTrustedCompletedServerReplay({
    status: 'completed',
    persistedFileBytes: 1000,
    actualFileBytes: 1000,
    pcmBytes: oneMinutePcm,
    probedDurationSeconds: 20,
  }), false);

  assert.equal(isTrustedCompletedServerReplay({
    status: 'completed',
    persistedFileBytes: 1000,
    actualFileBytes: 1000,
    pcmBytes: oneMinutePcm,
    probedDurationSeconds: 59,
  }), true);
});

test('duration fallback uses s16le server PCM rather than encoded MP3 byte size', () => {
  assert.equal(
    estimateReplayDurationSeconds({ serverPcmBytes: 48000 * 2 * 2 }),
    1
  );
  assert.equal(
    estimateReplayDurationSeconds({
      chunks: [{ startMs: 0, endMs: 1500 }, { startMs: 1500, endMs: 3000 }],
      serverPcmBytes: 1,
    }),
    3
  );
  assert.equal(
    estimateReplayDurationSeconds({
      startedAt: '2026-09-25T10:00:00.000Z',
      endedAt: '2026-09-25T10:00:12.500Z',
    }),
    12.5
  );
});

test('finalize assembles chunks into a real MP3 Audio replay', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  await storeChunks(bid, creatorId, 3);

  const result = await finalizeBroadcastReplay({ broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 3, uploadErrors: 0 });
  assert.equal(result.status, 'ready');
  assert.ok(result.audioId);

  const audio = await Audio.findById(result.audioId);
  assert.ok(audio);
  assert.equal(audio.mimeType, 'audio/mpeg');
  assert.ok(String(audio.filename).endsWith('.mp3'));
  assert.match(String(audio.originalName), /^Echoo - /);
  assert.ok(String(audio.originalName).endsWith('.mp3'));
  assert.equal(String(audio.sourceBroadcast), bid);
  assert.ok(audio.fileSize > 1000);
  assert.ok(Number(audio.duration) > 0);
  assert.equal(audio.storage, 'local');

  const localPath = path.join(process.cwd(), 'uploads', 'audio', String(audio.filename));
  const bytes = await fs.readFile(localPath);
  assert.equal(isRealMp3Bytes(bytes.subarray(0, 4)), true);

  // Transcription is not configured in tests: temp chunk files are cleaned.
  const chunkDir = path.join(process.cwd(), 'uploads', 'transcript-chunks', bid);
  assert.equal(await fs.stat(chunkDir).then(() => true).catch(() => false), false);

  await fs.rm(localPath, { force: true }).catch(() => null);
});

test('finalize is idempotent across retries', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  await storeChunks(bid, creatorId, 2);

  const first = await finalizeBroadcastReplay({ broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 2, uploadErrors: 0 });
  const second = await finalizeBroadcastReplay({ broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 2, uploadErrors: 0 });
  assert.equal(first.status, 'ready');
  assert.equal(second.status, 'ready');
  assert.equal(second.audioId, first.audioId);
  assert.equal(second.duplicate, true);
  assert.equal(await Audio.countDocuments({ fileKey: `replay-${bid}` }), 1);

  const audio = await Audio.findById(first.audioId);
  await fs.rm(path.join(process.cwd(), 'uploads', 'audio', String(audio.filename)), { force: true }).catch(() => null);
});

test('gapped chunks stay incomplete without creating audio', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  await storeChunks(bid, creatorId, 3, { skipIndex: 1 });

  const result = await finalizeBroadcastReplay({ broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 3, uploadErrors: 0 });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.audioId, null);
  assert.deepEqual(result.missingChunkIndices, [1]);
  assert.equal(await Audio.countDocuments({ fileKey: `replay-${bid}` }), 0);

  const dir = path.join(process.cwd(), 'uploads', 'transcript-chunks', bid);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => null);
  await BroadcastAudioChunk.deleteMany({ broadcastId: bid });
});

test('empty sessions create nothing', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  const result = await finalizeBroadcastReplay({ broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 0, uploadErrors: 0 });
  assert.equal(result.status, 'empty');
  assert.equal(result.audioId, null);
  assert.equal(await Audio.countDocuments({ fileKey: `replay-${bid}` }), 0);
});

test('normal-looking MP3 is rejected when network outage left an audio coverage gap', () => {
  const base = {
    status: 'completed',
    persistedFileBytes: 10000,
    actualFileBytes: 10000,
    pcmBytes: 48000 * 2 * 2 * 570,
    probedDurationSeconds: 570,
    expectedWallSeconds: 600,
  };
  assert.equal(isTrustedCompletedServerReplay(base), false);
  assert.equal(isTrustedCompletedServerReplay({
    ...base,
    pcmBytes: 48000 * 2 * 2 * 599,
    probedDurationSeconds: 599,
  }), true);
});


test('replay source survives a database-link failure, and a retry relinks the saved audio', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  await storeChunks(bid, creatorId, 2);
  const originalUpdate = Broadcast.updateOne;
  let blocked = false;
  try {
    Broadcast.updateOne = function (filter, update, options) {
      if (String(filter?._id) === bid && update?.$set?.replayStatus === 'ready' && !blocked) {
        blocked = true;
        return Promise.reject(new Error('simulated MongoDB outage when linking replay'));
      }
      return originalUpdate.call(this, filter, update, options);
    };
    await assert.rejects(
      finalizeBroadcastReplay({ broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 2 }),
      /simulated MongoDB outage/,
    );
  } finally {
    Broadcast.updateOne = originalUpdate;
  }
  assert.equal(blocked, true);
  const orphan = await Audio.findOne({ fileKey: 'replay-' + bid });
  assert(orphan, 'already saved audio should remain in the creator library');
  assert((await fs.stat(path.join(process.cwd(), 'uploads', 'audio', orphan.filename))).size > 1000);
  const chunks = await BroadcastAudioChunk.countDocuments({ broadcastId: bid });
  assert.equal(chunks, 2, 'never delete source chunks before linking the replay');

  const recovered = await finalizeBroadcastReplay({
    broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 2,
  });
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.duplicate, true);
  const linked = await Broadcast.findById(bid);
  assert.equal(String(linked.replayAudioId), String(orphan._id));
  assert.equal(linked.replayStatus, 'ready');
  await fs.rm(path.join(process.cwd(), 'uploads', 'audio', orphan.filename), { force: true });
  await fs.rm(path.join(process.cwd(), 'uploads', 'transcript-chunks', bid), { force: true, recursive: true });
  await BroadcastAudioChunk.deleteMany({ broadcastId: bid });
});

test('nine-hour recording duration is not considered complete when the last hour is absent', () => {
  const nineHours = 9 * 3600;
  const eightHours = 8 * 3600;
  const pcmBytes = 48000 * 2 * 2 * eightHours;
  assert.equal(isTrustedCompletedServerReplay({
    status: 'completed', persistedFileBytes: 2048, actualFileBytes: 2048,
    pcmBytes, probedDurationSeconds: eightHours, expectedWallSeconds: nineHours,
  }), false);
  assert.equal(isTrustedCompletedServerReplay({
    status: 'completed', persistedFileBytes: 2048, actualFileBytes: 2048,
    pcmBytes: 48000 * 2 * 2 * nineHours,
    probedDurationSeconds: nineHours, expectedWallSeconds: nineHours,
  }), true);
});


test('a stale unique replay Audio row must not be advertised as a completed recording', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  const stale = await Audio.create({
    title: 'Missing but still linked MP3', description: '', artist: creatorId,
    sourceBroadcast: broadcast._id,
    filename: 'replay-' + bid + '-deleted.mp3',
    originalName: 'Missing replay.mp3',
    fileUrl: '/uploads/audio/replay-' + bid + '-deleted.mp3',
    fileSize: 8192, fileKey: 'replay-' + bid, mimeType: 'audio/mpeg',
    genre: 'Other', visibility: 'private', publicationStatus: 'draft',
  });
  const result = await finalizeBroadcastReplay({
    broadcastId: bid, creatorId: String(creatorId),
  });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.audioId, null);
  assert.equal(result.reason, 'linked-replay-file-unavailable');
  const updated = await Broadcast.findById(bid);
  assert.equal(String(updated.replayAudioId), String(stale._id));
  assert.equal(updated.replayStatus, 'incomplete');
  assert.equal(await Audio.countDocuments({ fileKey: 'replay-' + bid }), 1);
  const retry = await finalizeBroadcastReplay({
    broadcastId: bid, creatorId: String(creatorId),
  });
  assert.equal(retry.status, 'incomplete', 'a second HTTP retry must not turn missing bytes into success');
});

test('idempotent replay lookup cannot bypass creator authorization', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  await Audio.create({
    title: 'Private replay', description: '', artist: creatorId,
    sourceBroadcast: broadcast._id,
    filename: 'replay-' + bid + '-missing.mp3',
    originalName: 'Private replay.mp3',
    fileUrl: '/uploads/audio/replay-' + bid + '-missing.mp3',
    fileSize: 8192, fileKey: 'replay-' + bid, mimeType: 'audio/mpeg',
    genre: 'Other', visibility: 'private', publicationStatus: 'draft',
  });
  await assert.rejects(
    finalizeBroadcastReplay({ broadcastId: bid, creatorId: String(new mongoose.Types.ObjectId()) }),
    error => error?.status === 403 && error?.code === 'REPLAY_FORBIDDEN',
  );
  const untouched = await Broadcast.findById(bid);
  assert.equal(untouched.replayStatus, 'none');
});


test('stale foreign replay link cannot claim another creator\'s saved MP3', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  const foreignCreatorId = new mongoose.Types.ObjectId();
  const filename = 'foreign-replay-' + bid + '.mp3';
  const localPath = path.join(process.cwd(), 'uploads', 'audio', filename);
  const bytes = Buffer.alloc(8192);
  bytes.write('ID3', 0);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, bytes, { flag: 'wx' });

  try {
    const foreign = await Audio.create({
      title: 'Another organization private replay',
      description: '',
      artist: foreignCreatorId,
      sourceBroadcast: new mongoose.Types.ObjectId(),
      filename,
      originalName: 'Another organization.mp3',
      fileUrl: '/uploads/audio/' + filename,
      fileSize: bytes.length,
      fileKey: 'foreign-' + bid,
      mimeType: 'audio/mpeg',
      genre: 'Other',
      visibility: 'private',
      publicationStatus: 'draft',
    });
    await Broadcast.updateOne({ _id: broadcast._id }, {
      $set: { replayAudio: foreign._id, replayAudioId: foreign._id },
    });

    // A plausible MP3 on disk made the old unscoped findById() incorrectly
    // return "ready" and relink a different organization's recording.
    const finalized = await finalizeBroadcastReplay({
      broadcastId: bid, creatorId: String(creatorId),
    });
    assert.equal(finalized.status, 'incomplete');
    assert.equal(finalized.reason, 'linked-replay-record-unavailable');
    assert.equal((await Broadcast.findById(bid)).replayStatus, 'incomplete');

    // The creator recovery endpoint must also refuse the foreign replay ID.
    await Broadcast.updateOne({ _id: broadcast._id }, { $set: { status: 'completed' } });
    const recovered = await recoverBroadcastForReplay({
      broadcastId: bid, userId: String(creatorId),
    });
    assert.equal(recovered.outcome, 'ready');
    assert.equal(recovered.audioId, null);
  } finally {
    await fs.rm(localPath, { force: true });
  }
});

test('same-creator stale replay link cannot substitute another broadcast\'s audio', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  const filename = 'stale-same-creator-' + bid + '.mp3';
  const localPath = path.join(process.cwd(), 'uploads', 'audio', filename);
  const bytes = Buffer.alloc(8192);
  bytes.write('ID3', 0);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, bytes, { flag: 'wx' });

  try {
    const unrelated = await Audio.create({
      title: 'Different broadcast from the same creator',
      description: '', artist: creatorId,
      sourceBroadcast: new mongoose.Types.ObjectId(),
      filename, originalName: 'Unrelated replay.mp3',
      fileUrl: '/uploads/audio/' + filename,
      fileSize: bytes.length, fileKey: 'unrelated-' + bid,
      mimeType: 'audio/mpeg', genre: 'Other',
      visibility: 'private', publicationStatus: 'draft',
    });
    await Broadcast.updateOne({ _id: broadcast._id }, {
      $set: { status: 'completed', replayAudio: unrelated._id, replayAudioId: unrelated._id },
    });

    const finalized = await finalizeBroadcastReplay({
      broadcastId: bid, creatorId: String(creatorId),
    });
    assert.equal(finalized.status, 'incomplete');
    assert.equal(finalized.reason, 'linked-replay-record-unavailable');
    assert.equal(finalized.audioId, null);

    const recovered = await recoverBroadcastForReplay({
      broadcastId: bid, userId: String(creatorId),
    });
    assert.equal(recovered.outcome, 'ready');
    assert.equal(recovered.audioId, null);
    assert.equal(recovered.readyForUpload, true);
    const stored = await Broadcast.findById(bid);
    assert.notEqual(String(stored.replayAudio || ''), String(unrelated._id));
    assert.equal(await Audio.countDocuments({ _id: unrelated._id }), 1,
      'never delete the other broadcast\'s recording');
  } finally {
    await fs.rm(localPath, { force: true });
  }
});

test('linked replay with a missing Audio record stays incomplete instead of ready', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const missingId = new mongoose.Types.ObjectId();
  await Broadcast.updateOne({ _id: broadcast._id }, {
    $set: { replayAudio: missingId, replayAudioId: missingId, replayStatus: 'ready' },
  });
  const result = await finalizeBroadcastReplay({
    broadcastId: String(broadcast._id), creatorId: String(creatorId),
  });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'linked-replay-record-unavailable');
  const stored = await Broadcast.findById(broadcast._id);
  assert.equal(stored.replayStatus, 'incomplete');
});


test('all numbered chunks cannot conceal a missing half-second of captured audio', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  const chunks = await storeChunks(bid, creatorId, 3);
  await BroadcastAudioChunk.updateOne(
    { _id: chunks[1]._id }, { $set: { startMs: 1000, endMs: 1500 } },
  );
  await BroadcastAudioChunk.updateOne(
    { _id: chunks[2]._id }, { $set: { startMs: 1500, endMs: 2000 } },
  );
  const result = await finalizeBroadcastReplay({
    broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 3,
  });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'timeline-gap');
  assert.equal(result.invalidTimelineChunkIndex, 1);
  assert.equal(await Audio.countDocuments({ fileKey: `replay-${bid}` }), 0);
  assert.equal(await BroadcastAudioChunk.countDocuments({ broadcastId: bid }), 3,
    'never delete potentially recoverable WAV chunks on timeline failure');
  await fs.rm(path.join(process.cwd(), 'uploads', 'transcript-chunks', bid), {
    recursive: true, force: true,
  });
  await BroadcastAudioChunk.deleteMany({ broadcastId: bid });
});

test('simultaneous finalization requests share one canonical saved replay', async () => {
  const { broadcast, creatorId } = await makeBroadcast();
  const bid = String(broadcast._id);
  await storeChunks(bid, creatorId, 2);
  const requests = await Promise.all(
    Array.from({ length: 4 }, () => finalizeBroadcastReplay({
      broadcastId: bid, creatorId: String(creatorId), expectedChunkCount: 2,
    })),
  );
  assert(requests.every(result => result.status === 'ready'));
  assert.equal(new Set(requests.map(result => String(result.audioId))).size, 1);
  assert.equal(await Audio.countDocuments({ fileKey: `replay-${bid}` }), 1);
  const audio = await Audio.findById(requests[0].audioId);
  await fs.rm(path.join(process.cwd(), 'uploads', 'audio', String(audio.filename)), { force: true });
});
