import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { reconstructServerRecordingFromSegments } from '../src/services/serverRecordingReconstruction.js';
import { eligibleFailedReplayJob } from '../src/services/broadcastProcessingService.js';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0 &&
  spawnSync(ffprobe, ['-version'], { stdio: 'ignore' }).status === 0;
const ID = '507f1f77bcf86cd799439012';
const ATTEMPT = '1793010000000-abcdef12';

const fixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-rebuild-'));
  const dir = path.join(root, 'segments', ID, ATTEMPT);
  await fs.mkdir(dir, { recursive: true });
  const result = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'sine=frequency=700:sample_rate=48000', '-t', '3.6',
    '-map', '0:a:0', '-c:a', 'libmp3lame', '-b:a', '128k',
    '-f', 'segment', '-segment_time', '1',
    '-segment_format', 'mp3', '-reset_timestamps', '1',
    path.join(dir, 'part-%06d.mp3'),
  ], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr);
  const names = (await fs.readdir(dir)).sort();
  assert(names.length >= 3, 'fixture must have several sealed segments');
  return { root, dir, names, output: path.join(root, 'joined.mp3') };
};

const withFixture = async (execute) => {
  const old = process.env.REPLAY_ARCHIVE_DIR;
  const oldFfmpeg = process.env.FFMPEG_PATH;
  const oldFfprobe = process.env.FFPROBE_PATH;
  const state = await fixture();
  process.env.REPLAY_ARCHIVE_DIR = state.root;
  process.env.FFMPEG_PATH = ffmpeg;
  process.env.FFPROBE_PATH = ffprobe;
  try { return await execute(state); } finally {
    if (old === undefined) delete process.env.REPLAY_ARCHIVE_DIR;
    else process.env.REPLAY_ARCHIVE_DIR = old;
    if (oldFfmpeg === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = oldFfmpeg;
    if (oldFfprobe === undefined) delete process.env.FFPROBE_PATH;
    else process.env.FFPROBE_PATH = oldFfprobe;
    await fs.rm(state.root, { recursive: true, force: true });
  }
};

const recover = (s, options = {}) => reconstructServerRecordingFromSegments({
  broadcastId: ID, attemptId: ATTEMPT, segmentSeconds: 1,
  segmentStatus: 'completed', completedSegments: s.names.length,
  expectedDurationSeconds: 3.6, outputPath: s.output,
  ...options,
});

test('server automatically reconstructs contiguous sealed MP3 parts', { skip: !available }, () =>
  withFixture(async s => {
    const result = await recover(s);
    assert.equal(result.status, 'ready', JSON.stringify(result));
    assert(result.duration >= 3.35);
    const file = await fs.stat(s.output);
    assert(file.size > 4096);
    assert.equal((await fs.readdir(s.dir)).length, s.names.length,
      'recovery must preserve original segments');
  }));

test('missing intermediate segment prevents publication and preserves originals', { skip: !available }, () =>
  withFixture(async s => {
    await fs.rename(path.join(s.dir, s.names[1]), path.join(s.dir, 'part-000099.mp3'));
    const result = await recover(s);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.reason, 'segment-index-gap');
    await assert.rejects(fs.stat(s.output), { code: 'ENOENT' });
  }));

test('a failed recorder never publishes its possibly open final part', { skip: !available }, () =>
  withFixture(async s => {
    const result = await recover(s, { segmentStatus: 'degraded' });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.reason, 'recording-coverage-gap');
    assert.equal((await fs.readdir(s.dir)).length, s.names.length);
  }));

test('corrupt MP3 part cannot become verified replay', { skip: !available }, () =>
  withFixture(async s => {
    await fs.writeFile(path.join(s.dir, s.names[0]), Buffer.alloc(8192, 0));
    const result = await recover(s);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.reason, 'segment-invalid');
    await assert.rejects(fs.stat(s.output), { code: 'ENOENT' });
  }));

test('valid but short captured audio is not passed off as the full show', { skip: !available }, () =>
  withFixture(async s => {
    const result = await recover(s, { expectedDurationSeconds: 7.6 });
    assert.equal(result.status, 'incomplete');
    assert.equal(result.reason, 'recording-coverage-gap');
  }));

test('invalid attempt IDs cannot escape the private segment directory', async () => {
  const result = await reconstructServerRecordingFromSegments({
    broadcastId: ID, attemptId: '../../secret', expectedDurationSeconds: 60,
    outputPath: path.join(os.tmpdir(), 'should-not-create.mp3'),
  });
  assert.equal(result.status, 'incomplete');
  assert.equal(result.reason, 'reconstruction-metadata-unavailable');
});

test('replay background finalization uses segment reconstruction only after recorder stops', async () => {
  const source = await fs.readFile(new URL('../src/services/broadcastReplayService.js', import.meta.url), 'utf8');
  assert.match(source, /reconstructServerRecordingFromSegments/);
  assert.match(source, /canReconstructSegments/);
  assert.match(source, /serverRecording\.segments\.recoveryStatus/);
  assert.match(source, /replaySource === 'server-segments'/);
});

test('backend startup and orphan sweep requeue a lost replay finalization job', async () => {
  const processing = await fs.readFile(new URL('../src/services/broadcastProcessingService.js', import.meta.url), 'utf8');
  const sweep = await fs.readFile(new URL('../src/services/livekitOrphanSweep.js', import.meta.url), 'utf8');
  assert.match(processing, /requeueMissingRecordingFinalizations/);
  assert.match(processing, /serverRecording\.segments\.attemptId/);
  assert.match(processing, /enqueueBroadcastProcessing\(broadcast\._id, \{ transcriptionEnabled: false \}\)/);
  assert.match(sweep, /enqueueBroadcastProcessing\(doc\._id, \{ transcriptionEnabled: false \}\)/);
});

test('requeue policy retries failed recorded audio after bounded backoff, but never completed jobs', () => {
  const now = Date.now();
  const job = {
    status: 'failed', attempts: 1, maxAttempts: 5,
    completedAt: new Date(now - 31 * 60_000),
  };
  assert.equal(eligibleFailedReplayJob(job, now), true);
  assert.equal(eligibleFailedReplayJob({ ...job, status: 'completed' }, now), false);
  assert.equal(eligibleFailedReplayJob({ ...job, attempts: 5 }, now), false);
  assert.equal(eligibleFailedReplayJob({ ...job, completedAt: new Date(now - 10_000) }, now), false);
  assert.equal(eligibleFailedReplayJob({ ...job, completedAt: null, updatedAt: null }, now), false);
});

test('recovery reconciliation pages through all rows and stops its own timer', async () => {
  const processing = await fs.readFile(new URL('../src/services/broadcastProcessingService.js', import.meta.url), 'utf8');
  assert.match(processing, /replayRepairCursor/);
  assert.match(processing, /sort\(\{ _id: 1 \}\)\.limit\(REPLAY_REPAIR_BATCH\)/);
  assert.match(processing, /setInterval\(recover, REPLAY_REPAIR_INTERVAL_MS\)/);
  assert.match(processing, /clearInterval\(replayRepairTimer\)/);
});
