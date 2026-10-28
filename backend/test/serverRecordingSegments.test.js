import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  prepareServerRecordingSegments, watchServerRecordingSegments,
  inspectServerRecordingSegments, listSealedServerRecordingSegments, serverRecordingSegmentsEnabled,
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
    assert.match(statuses.at(-1).error, /backup segments are missing/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('digi02 deployment checks the actual mounted filesystem, not just write permission', async () => {
  const script = await fs.readFile(new URL('../../deploy/deploy-echoo.sh', import.meta.url), 'utf8');
  assert(script.includes('findmnt -n -T "$STORAGE_DIR" -o TARGET'));
  assert.match(script, /storage_mount.*== "\/"/);
});

test('systemd startup enforces persistent recording storage on every restart', async () => {
  const unit = await fs.readFile(new URL('../../deploy/systemd/echoo-api.service', import.meta.url), 'utf8');
  const gate = await fs.readFile(new URL('../../deploy/check-echoo-recording-storage.sh', import.meta.url), 'utf8');
  assert(unit.includes('RequiresMountsFor=/mnt/storage/media/echoo'));
  assert(unit.includes('ExecStartPre=/usr/bin/bash '));
  assert(unit.includes('check-echoo-recording-storage.sh'));
  assert(gate.includes('findmnt -n -T "$STORAGE_DIR" -o TARGET'));
  assert(gate.includes('"$storage_mount" == "/"'));
  assert(gate.includes('mktemp "$REPLAY_DIR/'));
});

test('the segment monitor downgrades previously sealed files that vanish or change', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-sealed-recheck-'));
  try {
    const updates = [];
    const first = path.join(dir, 'part-000000.mp3');
    const active = path.join(dir, 'part-000001.mp3');
    await fs.writeFile(first, Buffer.alloc(10000, 0x44));
    await fs.writeFile(active, Buffer.alloc(10000, 0x44));
    const watcher = watchServerRecordingSegments({
      dir, segmentSeconds: 600, attemptId: 'mock'
    }, {
      onProgress: async update => updates.push(update),
      closed: Promise.resolve(),
    });
    const initial = await watcher.refresh();
    assert.equal(initial.count, 1);
    await fs.writeFile(first, Buffer.alloc(8000, 0x66));
    const modified = await watcher.refresh();
    assert.equal(modified.count, 0);
    assert.equal(updates.at(-1).status, 'degraded');
    const result = await watcher.finish();
    assert.equal(result.count, 0);
    assert.equal(updates.at(-1).status, 'degraded');
  } finally { await fs.rm(dir, { force: true, recursive: true }); }
});

test('recording startup serializes concurrent encoder requests and requires MongoDB checkpoint', async () => {
  const source = await fs.readFile(new URL('../src/services/livekitServerRecording.js', import.meta.url), 'utf8');
  assert.match(source, /sessionCreationPromises\.get\(broadcastId\)/);
  assert.match(source, /sessionCreationPromises\.set\(broadcastId, creation\)/);
  assert.match(source, /await preservePriorRecordingOutput\(replay\.path\)/);
  assert.match(source, /const checkpoint = await Broadcast\.updateOne/);
  assert.match(source, /if \(!checkpoint\.matchedCount\) throw/);
});

test('graceful API restart preserves partial recording and awaits durable cleanup', async () => {
  const recorder = await fs.readFile(new URL('../src/services/livekitServerRecording.js', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(recorder, /export const closeLiveKitRecordingWebSocket = async/);
  assert.match(recorder, /session\.failed = true/);
  assert.match(recorder, /closing\.push\(finishSession\(session\)\)/);
  assert.match(recorder, /await Promise\.allSettled\(closing\)/);
  assert.match(recorder, /recorderServerClosing/);
  assert.match(app, /await closeLiveKitRecordingWebSocket\(\)/);
});


test('creator can recover 54 protected ten-minute parts after a nine-hour capture', { skip: !available }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-nine-hour-index-'));
  const previous = process.env.REPLAY_ARCHIVE_DIR;
  const id = '507f1f77bcf86cd799439015';
  const attempt = '1793010000000-cafebabe';
  const dir = path.join(root, 'segments', id, attempt);
  process.env.REPLAY_ARCHIVE_DIR = root;
  try {
    await fs.mkdir(dir, { recursive: true });
    const sample = path.join(root, 'valid.mp3');
    const ff = spawnSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'sine=frequency=750:sample_rate=48000',
      '-t', '1', '-c:a', 'libmp3lame', '-b:a', '128k', sample,
    ], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(ff.status, 0, ff.stderr);
    for (let index = 0; index < 54; index += 1) {
      await fs.copyFile(sample, path.join(dir, 'part-' + String(index).padStart(6, '0') + '.mp3'));
    }
    const full = await listSealedServerRecordingSegments({
      broadcastId: id, attemptId: attempt, segmentStatus: 'completed',
    });
    assert.equal(full.length, 54);
    const interrupted = await listSealedServerRecordingSegments({
      broadcastId: id, attemptId: attempt, segmentStatus: 'degraded',
    });
    assert.equal(interrupted.length, 53, 'never expose the potentially open final part');
    await fs.rm(path.join(dir, 'part-000017.mp3'));
    const missing = await listSealedServerRecordingSegments({
      broadcastId: id, attemptId: attempt, segmentStatus: 'completed',
    });
    assert.equal(missing.length, 17, 'a missing middle segment must stop the contiguous recovery catalog');
  } finally {
    if (previous === undefined) delete process.env.REPLAY_ARCHIVE_DIR;
    else process.env.REPLAY_ARCHIVE_DIR = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('server recording recovery downloads require creator authentication', async () => {
  const routes = await fs.readFile(new URL('../src/routes/broadcastRoutes.js', import.meta.url), 'utf8');
  const controller = await fs.readFile(new URL('../src/controllers/broadcastRecordingRecoveryDownloadsController.js', import.meta.url), 'utf8');
  assert.match(routes, /recording-segments', authenticate, requireCreator, listRecordingRecoveryDownloads/);
  assert.match(routes, /recording-segments\/:index', authenticate, requireCreator, downloadRecordingRecoverySegment/);
  assert.match(controller, /creator: req.userId/);
  assert.match(controller, /createReadStream/);
  assert.doesNotMatch(controller, /readFile\(/);
});

test('backup monitor reports a silent tee failure before End Broadcast', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-stalled-backup-'));
  let clock = 100000;
  const updates = [];
  const watcher = watchServerRecordingSegments({
    dir, segmentSeconds: 1, attemptId: 'test-backup-failure',
  }, {
    now: () => clock,
    onProgress: async update => updates.push(update),
    closed: Promise.resolve(),
  });
  try {
    await watcher.refresh();
    assert.equal(updates.at(-1).status, 'recording');
    assert.equal(updates.at(-1).completedSegments, 0);
    // No files arrive for 31 seconds, including the 30-second closure grace.
    // Counts remain 0/0, but the warning must still be persisted while live.
    clock += 31_000;
    await watcher.refresh();
    assert.equal(updates.length, 2);
    assert.equal(updates.at(-1).status, 'degraded');
    assert.match(updates.at(-1).error, /backup segments are missing/);
    assert.equal(updates.at(-1).completedSegments, 0);
    await watcher.refresh();
    assert.equal(updates.length, 2, 'unchanged alerts must not spam MongoDB');
  } finally {
    await watcher.finish();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('concurrent segment refreshes cannot overwrite a final recording state', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-serial-progress-'));
  const updates = [];
  const watcher = watchServerRecordingSegments({
    dir, segmentSeconds: 600, attemptId: 'test-serial-status',
  }, {
    closed: Promise.resolve(),
    onProgress: async value => {
      if (value.status === 'recording') await new Promise(resolve => setTimeout(resolve, 20));
      updates.push(value.status);
    },
  });
  try {
    const first = watcher.refresh();
    const second = watcher.refresh();
    const final = watcher.finish();
    await Promise.all([first, second, final]);
    assert.equal(updates.at(-1), 'degraded', 'no backup files means an unsafe final recording');
    assert(!updates.slice(updates.indexOf('degraded') + 1).includes('recording'),
      'an earlier poll must never regress terminal recording status');
  } finally {
    await fs.rm(dir, { force: true, recursive: true });
  }
});
