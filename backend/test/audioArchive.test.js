import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  archiveRecordingAudio,
  createCloudDownloadUrl,
  isCloudArchiveEnabled,
  transcodeToOpus,
  uploadToObjectStorage,
} from '../src/services/audioArchiveService.js';

// Local-server recording archive contract:
// - recordings stay on this server (uploads/audio), never cloud
// - transcode produces a dramatically smaller Opus file
// - failures keep the original file and never throw

const withEnv = (patch, fn) => async () => {
  const saved = {};
  for (const key of Object.keys(patch)) {
    saved[key] = process.env[key];
    if (patch[key] === undefined) delete process.env[key];
    else process.env[key] = patch[key];
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(patch)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
};

const makeWorkDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'echoo-archive-test-'));

const fakeAudioDoc = (filename = 'master.wav') => {
  const state = { saved: 0 };
  return {
    _id: 'audio-test-id',
    filename,
    fileKey: filename,
    fileSize: 1024,
    mimeType: 'audio/wav',
    storage: 'local',
    cloudUrl: null,
    cloudKey: null,
    state,
    async save() {
      state.saved += 1;
    },
  };
};

const ffmpegAvailable = () => {
  try {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-version'], { timeout: 8000 });
    return result.status === 0;
  } catch {
    return false;
  }
};

// 10 seconds of stereo silence as WAV — stands in for an uploaded master.
const writeSilentWav = (filePath, seconds = 10) => {
  const sampleRate = 48000;
  const channels = 2;
  const frames = sampleRate * seconds;
  const dataBytes = frames * channels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  fs.writeFileSync(filePath, buffer);
  return buffer.length;
};

test('cloud archive is disabled — recordings stay on this server', async () => {
  assert.equal(isCloudArchiveEnabled(), false);
});

test('missing audio or path fails closed without throwing', async () => {
  assert.equal(await archiveRecordingAudio({ audio: null, localPath: null }), 'failed');
  assert.equal(await archiveRecordingAudio({ audio: fakeAudioDoc(), localPath: null }), 'failed');
});

test('removed cloud helpers fail loudly instead of silently', async () => {
  await assert.rejects(() => uploadToObjectStorage(), /removed/);
  await assert.rejects(() => createCloudDownloadUrl('x.opus'), /removed/);
});

test('opus transcode shrinks a WAV master by an order of magnitude', async () => {
  if (!ffmpegAvailable()) {
    console.log('  (skipped: ffmpeg not on PATH)');
    return;
  }
  const dir = makeWorkDir();
  const source = path.join(dir, 'master.wav');
  const dest = path.join(dir, 'master.opus');
  const sourceBytes = writeSilentWav(source, 30);
  await transcodeToOpus(source, dest);
  const destBytes = fs.statSync(dest).size;
  assert.ok(destBytes > 0, 'transcode must produce output');
  assert.ok(
    destBytes < sourceBytes / 10,
    `expected >=10x shrink, got ${(sourceBytes / destBytes).toFixed(1)}x`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('archive compresses the master on server disk and repoints the record', withEnv(
  { AUDIO_KEEP_LOCAL_AFTER_ARCHIVE: undefined },
  async () => {
    if (!ffmpegAvailable()) {
      console.log('  (skipped: ffmpeg not on PATH)');
      return;
    }
    const dir = makeWorkDir();
    const localPath = path.join(dir, 'master.wav');
    writeSilentWav(localPath, 5);
    const audio = fakeAudioDoc('master.wav');
    const result = await archiveRecordingAudio({ audio, localPath });
    assert.equal(result, 'local');
    assert.equal(audio.state.saved, 1);
    assert.equal(audio.storage, 'local');
    assert.ok(audio.filename.endsWith('.opus'), 'record must point at the Opus file');
    assert.equal(audio.fileKey, audio.filename);
    assert.equal(audio.mimeType, 'audio/ogg; codecs=opus');
    assert.equal(fs.existsSync(path.join(dir, audio.filename)), true);
    assert.equal(fs.existsSync(localPath), false, 'original WAV is deleted by default');
    fs.rmSync(dir, { recursive: true, force: true });
  }
));

test('archive keeps the original when AUDIO_KEEP_LOCAL_AFTER_ARCHIVE=true', withEnv(
  { AUDIO_KEEP_LOCAL_AFTER_ARCHIVE: 'true' },
  async () => {
    if (!ffmpegAvailable()) {
      console.log('  (skipped: ffmpeg not on PATH)');
      return;
    }
    const dir = makeWorkDir();
    const localPath = path.join(dir, 'master.wav');
    writeSilentWav(localPath, 5);
    const audio = fakeAudioDoc('master.wav');
    const result = await archiveRecordingAudio({ audio, localPath });
    assert.equal(result, 'local');
    assert.equal(fs.existsSync(localPath), true, 'original WAV is kept');
    assert.equal(fs.existsSync(path.join(dir, audio.filename)), true);
    fs.rmSync(dir, { recursive: true, force: true });
  }
));
