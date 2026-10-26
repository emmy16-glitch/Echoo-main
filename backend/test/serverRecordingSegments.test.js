import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  prepareServerRecordingSegments, watchServerRecordingSegments,
  inspectServerRecordingSegments, serverRecordingSegmentsEnabled,
} from '../src/services/serverRecordingSegments.js';

const ffmpeg = String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0;

test('server segments can be enabled without spawning a second encoder', () => {
  const previous = process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
  try {
    delete process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
    assert.equal(serverRecordingSegmentsEnabled(), false);
    process.env.SERVER_RECORDING_SEGMENTS_ENABLED = 'true';
    assert.equal(serverRecordingSegmentsEnabled(), true);
    process.env.SERVER_RECORDING_SEGMENTS_ENABLED = 'false';
    assert.equal(serverRecordingSegmentsEnabled(), false);
  } finally {
    if (previous === undefined) delete process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
    else process.env.SERVER_RECORDING_SEGMENTS_ENABLED = previous;
  }
});

test('one FFmpeg encoder creates full MP3 and sealed MP3 parts from the same packets', { skip: !available }, async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-tee-test-'));
  const previous = process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
  const previousReplay = process.env.REPLAY_ARCHIVE_DIR;
  process.env.SERVER_RECORDING_SEGMENTS_ENABLED = 'true';
  process.env.REPLAY_ARCHIVE_DIR = tmp;
  try {
    const primary = path.join(tmp, 'full.mp3');
    const planned = await prepareServerRecordingSegments({
      broadcastId: '507f1f77bcf86cd799439012',
      primaryOutputPath: primary, segmentSeconds: 1,
    });
    assert(planned?.teeOutput?.includes('[f=segment:onfail=ignore:use_fifo=1'));
    const done = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=700:sample_rate=48000',
      '-t', '3.5', '-map', '0:a:0', '-c:a', 'libmp3lame', '-b:a', '128k',
      '-f', 'tee', planned.teeOutput,
    ], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(done.status, 0, done.stderr);
    assert((await fs.stat(primary)).size > 4096);
    const updates = [];
    const watcher = watchServerRecordingSegments(planned, {
      onProgress: async x => { updates.push(x); },
      closed: Promise.resolve(),
    });
    const result = await watcher.finish();
    assert(result.count >= 3);
    assert(result.bytes > 8192);
    assert(updates.some(x => x.status === 'completed'));
    const checked = await inspectServerRecordingSegments({
      broadcastId: '507f1f77bcf86cd799439012',
      attemptId: planned.attemptId,
      completedSegments: result.count,
    });
    assert.equal(checked.verified, true);
    assert.equal(checked.completedSegments, result.count);
    for (const filename of result.files) {
      const b = await fs.readFile(filename);
      assert(b.length > 4096);
      assert(b.subarray(0, 3).toString('ascii') === 'ID3' || b[0] === 0xff);
    }
  } finally {
    if (previous === undefined) delete process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
    else process.env.SERVER_RECORDING_SEGMENTS_ENABLED = previous;
    if (previousReplay === undefined) delete process.env.REPLAY_ARCHIVE_DIR;
    else process.env.REPLAY_ARCHIVE_DIR = previousReplay;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('LiveKit stream uses only one FFmpeg encoder, with tee output and listener-safe failure policy', async () => {
  const source = await fs.readFile(new URL('../src/services/livekitServerRecording.js', import.meta.url), 'utf8');
  const createStart = source.indexOf('const createSession = async (broadcastId) => {');
  const createEnd = source.indexOf('const getOrCreateSession', createStart);
  assert(createStart >= 0 && createEnd > createStart);
  const create = source.slice(createStart, createEnd);
  assert.match(create, /prepareServerRecordingSegments/);
  assert.match(create, /watchServerRecordingSegments/);
  assert.match(create, /segmentPlan \? 'tee' : 'mp3'/);
  assert.doesNotMatch(create, /startServerRecordingSegments\(/);
  assert.doesNotMatch(source, /segmentRecorder\?\.enqueue\(/);
  assert.match(create, /child\.once\('error'/);
});


test('backup segment disk failure does not kill continuous MP3 recording', { skip: !available }, async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-segment-failure-'));
  const previous = process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
  const previousReplay = process.env.REPLAY_ARCHIVE_DIR;
  process.env.SERVER_RECORDING_SEGMENTS_ENABLED = 'true';
  process.env.REPLAY_ARCHIVE_DIR = tmp;
  try {
    const primary = path.join(tmp, 'continuous.mp3');
    const plan = await prepareServerRecordingSegments({
      broadcastId: '507f1f77bcf86cd799439013',
      primaryOutputPath: primary, segmentSeconds: 1,
    });
    // Simulate a failed segment destination before the same FFmpeg starts.
    await fs.rm(plan.dir, { recursive: true, force: true });
    const result = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000',
      '-t', '1.4', '-map', '0:a:0', '-c:a', 'libmp3lame',
      '-b:a', '128k', '-f', 'tee', plan.teeOutput,
    ], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status, 0, result.stderr);
    assert((await fs.stat(primary)).size > 8192,
      'canonical recording must survive missing backup destination');
    assert.match(result.stderr, /Slave muxer|Failed to open segment/);
  } finally {
    if (previous === undefined) delete process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
    else process.env.SERVER_RECORDING_SEGMENTS_ENABLED = previous;
    if (previousReplay === undefined) delete process.env.REPLAY_ARCHIVE_DIR;
    else process.env.REPLAY_ARCHIVE_DIR = previousReplay;
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('segment monitor flags missing backup files even when primary FFmpeg did not fail', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-missing-backup-'));
  try {
    const statuses = [];
    const watcher = watchServerRecordingSegments({
      dir: tmp, segmentSeconds: 600, attemptId: 'test-attempt',
    }, {
      isRecorderFailed: () => false,
      closed: Promise.resolve(),
      onProgress: async progress => statuses.push(progress),
    });
    const result = await watcher.finish();
    assert.equal(result.count, 0);
    assert.equal(statuses.at(-1).status, 'degraded');
    assert.match(statuses.at(-1).error, /backup sink did not produce/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('digi02 deployment checks the actual mounted filesystem, not just write permission', async () => {
  const script = await fs.readFile(new URL('../../deploy/deploy-echoo.sh', import.meta.url), 'utf8');
  assert.match(script, /findmnt -n -T "\\$STORAGE_DIR" -o TARGET/);
  assert.match(script, /storage_mount.*== "\/"/);
});
