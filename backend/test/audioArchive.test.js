import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  archiveDestinationLabel,
  archiveRecordingAudio,
  createCloudDownloadUrl,
  isCloudArchiveEnabled,
  transcodeToMp3,
  transcodeToOpus,
} from '../src/services/audioArchiveService.js';

// Recording archive contract:
// - server copy is ALWAYS MP3 automatically (local disk or S3 cloud)
// - disabled/misconfigured S3 -> local MP3 normalise, never throw
// - cloud failures keep the local file and never fail the upload

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

const fakeAudioDoc = () => {
  const state = { saved: 0 };
  return {
    _id: 'audio-test-id',
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

test('local server mode normalises the WAV master to MP3 automatically', withEnv(
  { AUDIO_STORAGE_PROVIDER: undefined },
  async () => {
    assert.equal(isCloudArchiveEnabled(), false);
    if (!ffmpegAvailable()) {
      console.log('  (skipped: ffmpeg not on PATH)');
      return;
    }
    const dir = makeWorkDir();
    const localPath = path.join(dir, 'master.wav');
    writeSilentWav(localPath, 5);
    const audio = { ...fakeAudioDoc(), filename: 'master.wav', mimeType: 'audio/wav', storage: 'local' };
    const result = await archiveRecordingAudio({ audio, localPath });
    assert.equal(result, 'local-mp3');
    assert.equal(audio.state.saved, 1);
    assert.equal(audio.filename.endsWith('.mp3'), true);
    assert.equal(audio.mimeType, 'audio/mpeg');
    assert.equal(fs.existsSync(path.join(dir, audio.filename)), true);
    assert.equal(fs.existsSync(localPath), localPath.endsWith('.mp3') ? true : false);
    fs.rmSync(dir, { recursive: true, force: true });
  }
));

test('already-MP3 server copy is left alone', withEnv(
  { AUDIO_STORAGE_PROVIDER: undefined },
  async () => {
    const dir = makeWorkDir();
    const localPath = path.join(dir, 'master.mp3');
    fs.writeFileSync(localPath, Buffer.alloc(1024));
    const audio = { ...fakeAudioDoc(), filename: 'master.mp3', mimeType: 'audio/mpeg', storage: 'local' };
    const result = await archiveRecordingAudio({ audio, localPath });
    assert.equal(result, 'local');
    assert.equal(audio.state.saved, 0);
    assert.equal(fs.existsSync(localPath), true);
    fs.rmSync(dir, { recursive: true, force: true });
  }
));

test('corrupt master never throws and keeps the local file', withEnv(
  { AUDIO_STORAGE_PROVIDER: undefined },
  async () => {
    if (!ffmpegAvailable()) {
      console.log('  (skipped: ffmpeg not on PATH)');
      return;
    }
    const dir = makeWorkDir();
    const localPath = path.join(dir, 'master.wav');
    fs.writeFileSync(localPath, Buffer.alloc(1024));
    const audio = { ...fakeAudioDoc(), filename: 'master.wav', mimeType: 'audio/wav', storage: 'local' };
    const result = await archiveRecordingAudio({ audio, localPath });
    assert.equal(result, 'failed');
    assert.equal(audio.state.saved, 0);
    assert.equal(fs.existsSync(localPath), true);
    fs.rmSync(dir, { recursive: true, force: true });
  }
));

test('incomplete cloud config keeps the local file', withEnv(
  { AUDIO_STORAGE_PROVIDER: 'r2', AUDIO_S3_ENDPOINT: undefined, AUDIO_S3_BUCKET: undefined },
  async () => {
    const dir = makeWorkDir();
    const localPath = path.join(dir, 'master.wav');
    fs.writeFileSync(localPath, Buffer.alloc(1024));
    const audio = fakeAudioDoc();
    const result = await archiveRecordingAudio({ audio, localPath });
    assert.equal(result, 'local');
    assert.equal(fs.existsSync(localPath), true);
    fs.rmSync(dir, { recursive: true, force: true });
  }
));

test('unreachable object storage keeps the local file and never throws', withEnv(
  {
    AUDIO_STORAGE_PROVIDER: 'r2',
    AUDIO_S3_ENDPOINT: 'http://127.0.0.1:9',
    AUDIO_S3_REGION: 'auto',
    AUDIO_S3_BUCKET: 'echoo-test',
    AUDIO_S3_ACCESS_KEY_ID: 'test',
    AUDIO_S3_SECRET_ACCESS_KEY: 'test',
    AUDIO_S3_PUBLIC_BASE: 'https://media.example.test',
  },
  async () => {
    if (!ffmpegAvailable()) {
      console.log('  (skipped: ffmpeg not on PATH)');
      return;
    }
    const dir = makeWorkDir();
    const localPath = path.join(dir, 'master.wav');
    writeSilentWav(localPath, 5);
    const audio = fakeAudioDoc();
    const result = await archiveRecordingAudio({ audio, localPath });
    // Upload to a dead endpoint must fail closed: local master untouched.
    assert.equal(result, 'failed');
    assert.equal(audio.state.saved, 0);
    assert.equal(fs.existsSync(localPath), true);
    fs.rmSync(dir, { recursive: true, force: true });
  }
));

test('private-bucket playback mints a signed URL without network', withEnv(
  {
    AUDIO_S3_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    AUDIO_S3_REGION: 'us-west-004',
    AUDIO_S3_BUCKET: 'echoo-recordings',
    AUDIO_S3_ACCESS_KEY_ID: 'test-key-id',
    AUDIO_S3_SECRET_ACCESS_KEY: 'test-secret',
  },
  async () => {
    // SigV4 signing is purely local — no request leaves the machine.
    const url = await createCloudDownloadUrl('test-playback.opus', 3600);
    assert.ok(url.startsWith('https://'), 'signed URL must be https');
    assert.ok(url.includes('echoo-recordings%2Ftest-playback.opus') || url.includes('echoo-recordings/test-playback.opus'), 'signed URL must address the object');
    assert.ok(url.includes('X-Amz-Signature='), 'signed URL must carry a signature');
    assert.ok(url.includes('X-Amz-Expires=3600'), 'signed URL must honor expiry');
  }
));

test('private cloud archives can be logged without a public URL', () => {
  assert.equal(
    archiveDestinationLabel({ url: null, objectKey: 'echoo-recordings/private-test.mp3' }),
    'private://echoo-recordings/private-test.mp3'
  );
  assert.equal(
    archiveDestinationLabel({ url: 'https://media.example.test/replay.mp3', objectKey: 'ignored.mp3' }),
    'https://media.example.test/replay.mp3'
  );
});

test('mp3 transcode shrinks a WAV master by an order of magnitude', async () => {
  if (!ffmpegAvailable()) {
    console.log('  (skipped: ffmpeg not on PATH)');
    return;
  }
  const dir = makeWorkDir();
  const source = path.join(dir, 'master.wav');
  const dest = path.join(dir, 'master.mp3');
  const sourceBytes = writeSilentWav(source, 30);
  await transcodeToMp3(source, dest);
  const destBytes = fs.statSync(dest).size;
  assert.ok(destBytes > 0, 'transcode must produce output');
  assert.ok(
    destBytes < sourceBytes / 5,
    `expected >=5x shrink, got ${(sourceBytes / destBytes).toFixed(1)}x`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
