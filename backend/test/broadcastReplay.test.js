import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

import Audio from '../src/models/Audio.js';
import Broadcast from '../src/models/Broadcast.js';
import BroadcastAudioChunk from '../src/models/BroadcastAudioChunk.js';
import {
  finalizeBroadcastReplay,
  isRealMp3Bytes,
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
