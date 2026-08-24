import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

import { app } from '../src/app.js';
import Audio from '../src/models/Audio.js';
import { createAudioStreamToken } from '../src/services/audioStreamAccess.js';

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

test('signed audio stream serves exact HTTP ranges while raw storage stays blocked', async () => {
  const audioId = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId();
  const filename = `echoo-range-test-${Date.now()}.mp3`;
  const audioDirectory = path.join(process.cwd(), 'uploads', 'audio');
  const absolutePath = path.join(audioDirectory, filename);
  const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
  const originalFindOne = Audio.findOne;
  let server = null;

  await fs.promises.mkdir(audioDirectory, { recursive: true });
  await fs.promises.writeFile(absolutePath, bytes);

  Audio.findOne = () => ({
    select: async () => ({
      _id: new mongoose.Types.ObjectId(audioId),
      artist: ownerId,
      isPublic: true,
      visibility: 'public',
      publicationStatus: 'published',
      isDeleted: false,
      filename,
      fileKey: filename,
      mimeType: 'audio/mpeg',
      originalName: 'range-test.mp3',
      duration: 60,
      fileSize: bytes.length,
    }),
  });

  try {
    server = await new Promise((resolve, reject) => {
      const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
      candidate.once('error', reject);
    });

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const { token } = createAudioStreamToken({
      audioId,
      access: 'public',
      duration: 60,
    });
    const streamUrl = `${baseUrl}/api/audio/${audioId}/stream?token=${encodeURIComponent(token)}`;

    const ranged = await fetch(streamUrl, {
      headers: { Range: 'bytes=10-19' },
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get('accept-ranges'), 'bytes');
    assert.equal(ranged.headers.get('content-range'), `bytes 10-19/${bytes.length}`);
    assert.equal(ranged.headers.get('content-length'), '10');
    assert.equal(ranged.headers.get('content-type'), 'audio/mpeg');
    assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), 'abcdefghij');

    const suffix = await fetch(streamUrl, {
      headers: { Range: 'bytes=-4' },
    });
    assert.equal(suffix.status, 206);
    assert.equal(Buffer.from(await suffix.arrayBuffer()).toString(), 'wxyz');

    const invalid = await fetch(streamUrl, {
      headers: { Range: `bytes=${bytes.length}-` },
    });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), `bytes */${bytes.length}`);

    const head = await fetch(streamUrl, {
      method: 'HEAD',
      headers: { Range: 'bytes=0-9' },
    });
    assert.equal(head.status, 206);
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(head.headers.get('content-range'), `bytes 0-9/${bytes.length}`);

    const rawStorage = await fetch(`${baseUrl}/uploads/audio/${filename}`);
    assert.equal(rawStorage.status, 404);
    const rawBody = await rawStorage.json();
    assert.equal(rawBody?.error?.code, 'DIRECT_AUDIO_STORAGE_BLOCKED');
  } finally {
    Audio.findOne = originalFindOne;
    if (server) await closeServer(server);
    await fs.promises.unlink(absolutePath).catch(() => {});
  }
});
