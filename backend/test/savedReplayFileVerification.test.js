import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { savedReplayFileAvailable } from '../src/services/savedReplayFileVerification.js';

const withAudioDir = async (run) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-replay-verification-'));
  const dir = path.join(root, 'uploads', 'audio');
  await fs.mkdir(dir, { recursive: true });
  try { await run({ root, dir }); } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

test('a same-sized corrupted MP3 must never count as a saved replay', async () => {
  await withAudioDir(async ({ root, dir }) => {
    const filename = 'replay-507f1f77bcf86cd799439012.mp3';
    await fs.writeFile(path.join(dir, filename), Buffer.alloc(8192, 0));
    const audio = { filename, fileSize: 8192, mimeType: 'audio/mpeg', storage: 'local' };
    assert.equal(await savedReplayFileAvailable(audio, { root }), false);
    const bytes = Buffer.alloc(8192, 0);
    bytes.write('ID3', 0);
    await fs.writeFile(path.join(dir, filename), bytes);
    assert.equal(await savedReplayFileAvailable(audio, { root }), true);
    audio.fileSize = 4096;
    assert.equal(await savedReplayFileAvailable(audio, { root }), false);
  });
});

test('invalid, missing, or symlink replay is not reported as durable', async () => {
  await withAudioDir(async ({ root, dir }) => {
    assert.equal(await savedReplayFileAvailable({ filename: '../replay.mp3' }, { root }), false);
    assert.equal(await savedReplayFileAvailable({ filename: 'missing.mp3' }, { root }), false);
    const realName = 'real.mp3', fakeName = 'symlink.mp3';
    const payload = Buffer.alloc(8192);
    payload.write('ID3', 0);
    await fs.writeFile(path.join(dir, realName), payload);
    await fs.symlink(path.join(dir, realName), path.join(dir, fakeName));
    assert.equal(await savedReplayFileAvailable({ filename: fakeName }, { root }), false);
    assert.equal(await savedReplayFileAvailable({ filename: realName, isDeleted: true }, { root }), false);
  });
});

test('WAV fallback must have RIFF/RF64 and WAVE signatures', async () => {
  await withAudioDir(async ({ root, dir }) => {
    const filename = 'replay-507f1f77bcf86cd799439012.wav';
    const wav = Buffer.alloc(8192);
    wav.write('RF64', 0);
    wav.write('WAVE', 8);
    await fs.writeFile(path.join(dir, filename), wav);
    const audio = { filename, fileSize: wav.length, mimeType: 'audio/wav' };
    assert.equal(await savedReplayFileAvailable(audio, { root }), true);
    wav.write('BORK', 8);
    await fs.writeFile(path.join(dir, filename), wav);
    assert.equal(await savedReplayFileAvailable(audio, { root }), false);
  });
});

test('registered cloud archive is tracked separately from local bytes', async () => {
  assert.equal(await savedReplayFileAvailable({
    filename: 'replay-507f1f77bcf86cd799439012.mp3',
    storage: 'cloud', cloudKey: 'private/recording.mp3',
  }), true);
  assert.equal(await savedReplayFileAvailable({
    storage: 'cloud', cloudKey: '', filename: 'absent.mp3',
  }), false);
});
