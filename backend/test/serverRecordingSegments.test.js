import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startServerRecordingSegments, serverRecordingSegmentsEnabled } from '../src/services/serverRecordingSegments.js';

const ffmpeg = String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const available = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' }).status === 0;

test('server segments remain explicitly configurable for safe staging', () => {
  const previous = process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
  try {
    delete process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
    assert.equal(serverRecordingSegmentsEnabled(), false);
    process.env.SERVER_RECORDING_SEGMENTS_ENABLED = 'true';
    assert.equal(serverRecordingSegmentsEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
    else process.env.SERVER_RECORDING_SEGMENTS_ENABLED = previous;
  }
});

test('independently finalized server MP3 parts survive after recording stops', { skip: !available }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-segment-test-'));
  const previous = process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
  const previousReplay = process.env.REPLAY_ARCHIVE_DIR;
  process.env.SERVER_RECORDING_SEGMENTS_ENABLED = 'true';
  process.env.REPLAY_ARCHIVE_DIR = dir;
  const updates = [];
  try {
    const recorder = await startServerRecordingSegments({
      broadcastId: '507f1f77bcf86cd799439012',
      bitrate: '128k',
      segmentSeconds: 1,
      onProgress: async (progress) => { updates.push(progress); },
    });
    assert(recorder, 'recorder should be active when enabled');
    // Send 3.5 seconds of stereo PCM at 48 kHz. The segment encoder is
    // asynchronous and never blocks the caller's primary recording stream.
    const frame = Buffer.alloc(48000 * 2 * 2 / 2);
    for (let i = 0; i < 7; i += 1) recorder.enqueue(frame);
    const finished = await recorder.finish();
    assert(finished.count >= 2, 'expected at least two sealed one-second segments');
    assert(finished.bytes > 8192, 'completed audio should occupy durable bytes');
    assert(updates.some((item) => item.status === 'completed'));
    for (const filename of finished.files) {
      const bytes = await fs.readFile(filename);
      assert(bytes.length > 4096);
      assert(bytes.subarray(0, 3).toString('ascii') === 'ID3' || bytes[0] === 0xff);
    }
  } finally {
    if (previous === undefined) delete process.env.SERVER_RECORDING_SEGMENTS_ENABLED;
    else process.env.SERVER_RECORDING_SEGMENTS_ENABLED = previous;
    if (previousReplay === undefined) delete process.env.REPLAY_ARCHIVE_DIR;
    else process.env.REPLAY_ARCHIVE_DIR = previousReplay;
    await fs.rm(dir, { recursive: true, force: true });
  }
});


test('primary FFmpeg handlers are installed before optional segment initialization', async () => {
  const main = await fs.readFile(new URL('../src/services/livekitServerRecording.js', import.meta.url), 'utf8');
  const start = main.indexOf('const createSession = async (broadcastId) => {');
  const end = main.indexOf('const getOrCreateSession', start);
  assert(start >= 0 && end > start);
  const body = main.slice(start, end);
  const ffmpegErrorHook = body.indexOf("child.once('error'");
  const segmentStart = body.indexOf('void startServerRecordingSegments({');
  assert(ffmpegErrorHook > 0 && segmentStart > ffmpegErrorHook,
    'FFmpeg failure handlers must be attached before optional segment startup');
  assert.doesNotMatch(body, /await startServerRecordingSegments\(/);
  assert.match(body, /if \(session\.stopping \|\| session\.failed\)/);
});
