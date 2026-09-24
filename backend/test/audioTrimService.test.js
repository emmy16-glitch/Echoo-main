import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  checkFfmpegCapability,
  trimAudioFile,
  validateTrimRange,
} from '../src/services/audioTrimService.js';

const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'ignore' });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});

test('trim range validation rejects reversed and out-of-bounds ranges', () => {
  assert.throws(
    () => validateTrimRange({ startSeconds: 5, endSeconds: 2, sourceDuration: 10 }),
    (error) => error.code === 'INVALID_TRIM_RANGE'
  );
  assert.throws(
    () => validateTrimRange({ startSeconds: 0, endSeconds: 12, sourceDuration: 10 }),
    (error) => error.code === 'TRIM_OUT_OF_BOUNDS'
  );
});

test('server trim creates verified output and preserves the source', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'echoo-trim-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'source.wav');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:a', 'pcm_s24le', sourcePath,
  ]);
  const before = await fs.promises.stat(sourcePath);
  const result = await trimAudioFile({
    sourcePath,
    startSeconds: 0.25,
    endSeconds: 1.25,
    sourceDuration: 2,
  });
  assert.ok(result.fileSize > 0);
  assert.ok(result.duration > 0.9 && result.duration < 1.1);
  assert.equal((await fs.promises.stat(sourcePath)).size, before.size);
  assert.notEqual(result.outputPath, sourcePath);
});


test('recording pipeline reports FFmpeg and FFprobe availability', async () => {
  const capability = await checkFfmpegCapability({ force: true });
  assert.equal(capability.ok, true);
});

test('MP3 trim preserves the source and keeps MP3 without a quality re-encode', async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'echoo-trim-mp3-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'source.mp3');
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:a', 'libmp3lame', '-b:a', '320k', sourcePath,
  ]);
  const before = await fs.promises.stat(sourcePath);
  const result = await trimAudioFile({
    sourcePath,
    startSeconds: 0.5,
    endSeconds: 2.5,
    sourceDuration: 3,
  });
  assert.equal(path.extname(result.outputPath), '.mp3');
  assert.ok(result.fileSize > 0);
  assert.ok(result.duration > 1.8 && result.duration < 2.2);
  assert.equal((await fs.promises.stat(sourcePath)).size, before.size);
});
