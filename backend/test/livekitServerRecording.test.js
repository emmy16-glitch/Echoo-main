import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';

import { getLiveKitServerRecordingDiagnostics, writeWithBackpressure } from '../src/services/livekitServerRecording.js';
import { encoderExitIsUnexpected } from '../src/services/recoveryEncoderExit.js';

const originalEnv = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

test.afterEach(restoreEnv);

test('server recorder stays disabled unless explicitly enabled', () => {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://echoo.example',
    LIVEKIT_API_SECRET: 'test-secret',
    LIVEKIT_SERVER_RECORDING_ENABLED: 'false',
  });
  delete process.env.VERCEL;
  delete process.env.VERCEL_URL;

  const diagnostics = getLiveKitServerRecordingDiagnostics();
  assert.equal(diagnostics.configured, true);
  assert.equal(diagnostics.enabled, false);
  assert.equal(diagnostics.available, false);
});

test('long-lived production backend can enable signed LiveKit recording websocket', () => {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://echoo.example',
    LIVEKIT_API_SECRET: 'test-secret',
    LIVEKIT_SERVER_RECORDING_ENABLED: 'true',
  });
  delete process.env.LIVEKIT_RECORDING_WS_URL;
  delete process.env.VERCEL;
  delete process.env.VERCEL_URL;

  const diagnostics = getLiveKitServerRecordingDiagnostics();
  assert.equal(diagnostics.configured, true);
  assert.equal(diagnostics.enabled, true);
  assert.equal(diagnostics.available, true);
  assert.equal(diagnostics.websocketPath, '/api/internal/livekit-recording');
});

test('serverless runtime refuses the long-lived recording websocket', () => {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://echoo.example',
    LIVEKIT_API_SECRET: 'test-secret',
    LIVEKIT_SERVER_RECORDING_ENABLED: 'true',
    VERCEL: '1',
  });

  const diagnostics = getLiveKitServerRecordingDiagnostics();
  assert.equal(diagnostics.configured, true);
  assert.equal(diagnostics.serverlessRuntime, true);
  assert.equal(diagnostics.available, false);
});


test('track republish handoff keeps one recorder session and fails closed if replacement never arrives', async () => {
  const source = await readFile(
    new URL('../src/services/livekitServerRecording.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /TRACK_HANDOFF_TIMEOUT_MS/);
  assert.match(source, /session\.pendingTrackSid = track/);
  assert.match(source, /session\.handoff = true/);
  assert.match(source, /waitForTrackHandoff/);
  assert.match(source, /stopEgressBounded\(handoffFromEgressId, 'recording handoff cleanup'\)/);
  assert.match(source, /identity\.trackSid !== session\.currentTrackSid/);
  assert.match(source, /identity\.trackSid !== session\.currentTrackSid \|\| session\.handoff/);
  assert.match(source, /Stale recording track/);
  assert.match(source, /Server recording is using browser recovery/);
  assert.match(source, /LiveKit recording track handoff did not reconnect in time/);
  assert.match(source, /expectedTracks\.delete\(session\.broadcastId\)/);
});


test('concurrent recorder starts preserve the newest track and bound PCM backlog', async () => {
  const source = await readFile(
    new URL('../src/services/livekitServerRecording.js', import.meta.url),
    'utf8'
  );

  assert.match(source, /MAX_PENDING_PCM_BYTES/);
  assert.match(source, /queuedPcmBytes/);
  assert.match(source, /Recording encoder backlog exceeded/);
  assert.match(source, /const inFlight = startPromises\.get\(id\)/);
  assert.match(source, /inFlight\.trackSid === track/);
  assert.match(source, /\.then\(\(\) => ensureLiveKitServerRecording\(\{ broadcastId: id, trackSid: track \}\)\)/);
  assert.match(source, /const entry = \{ trackSid: track, promise: task \}/);
  assert.match(source, /desiredTracks\.set\(id, track\)/);
  assert.match(source, /desiredTracks\.get\(id\) !== track/);
  assert.match(source, /reason: 'newer-track-requested'/);
  assert.match(source, /finishPromise/);
  assert.match(source, /if \(session\.finishPromise\) return session\.finishPromise/);
  assert.match(source, /session\.child\?\.stdin\?\.destroy/);
  assert.match(source, /Recording encoder stopped/);
  assert.match(source, /Server recording encoder stopped accepting PCM/);
  assert.match(source, /unexpectedCleanExit/);
  assert.match(source, /FFmpeg recording encoder exited before End Broadcast/);
  assert.match(source, /RECORDING_SOCKET_CLOSE_GRACE_MS/);
  assert.match(source, /MAX_ACCEPTED_PCM_GAP_MS/);
  assert.match(source, /disconnectStartedAt/);
  assert.match(source, /Recording gap requires browser recovery/);
  assert.match(source, /session\.disconnectTimer/);
  assert.match(source, /candidate\.echooTrackSid === session\.currentTrackSid/);
  assert.match(source, /stdin\.off\('drain', onDrain\)/);
  assert.match(source, /stdin\.off\('error', onError\)/);
});

const fakeBackpressuredRecorder = () => {
  const child = new EventEmitter();
  const stdin = new EventEmitter();
  stdin.write = () => false;
  stdin.destroyed = false;
  stdin.writableEnded = false;
  child.stdin = stdin;
  child.exitCode = null;
  child.signalCode = null;
  return { child, stdin };
};

test('killed LiveKit recorder is failed rather than left active with null exit code', async () => {
  assert.equal(encoderExitIsUnexpected({
    code: null, signal: 'SIGKILL', stopping: false,
  }), true);
  assert.equal(encoderExitIsUnexpected({
    code: null, signal: 'SIGTERM', stopping: true,
  }), true);
  assert.equal(encoderExitIsUnexpected({
    code: 0, signal: null, stopping: true,
  }), false);
  const source = await readFile(
    new URL('../src/services/livekitServerRecording.js', import.meta.url), 'utf8'
  );
  assert.match(source, /encoderExitIsUnexpected\(\{ code, signal, stopping: session\.stopping \}\)/);
  assert.match(source, /if \(session\.failed\) void finishSession\(session\)/);
});

test('recorder PCM backpressure drains and unregisters close listeners', async () => {
  const { child, stdin } = fakeBackpressuredRecorder();
  const promise = writeWithBackpressure(child, Buffer.alloc(2048));
  assert.equal(stdin.listenerCount('drain'), 1);
  stdin.emit('drain');
  await promise;
  assert.equal(stdin.listenerCount('close'), 0);
  assert.equal(child.listenerCount('close'), 0);
});

test('a signaled encoder close rejects an outstanding recorder write promptly', async () => {
  const { child, stdin } = fakeBackpressuredRecorder();
  const promise = writeWithBackpressure(child, Buffer.alloc(2048));
  child.signalCode = 'SIGKILL';
  child.emit('close', null, 'SIGKILL');
  await assert.rejects(promise, /closed before PCM could drain/);
  assert.equal(stdin.listenerCount('drain'), 0);
  await assert.rejects(
    writeWithBackpressure(child, Buffer.alloc(2048)),
    /stopped accepting PCM/
  );
});

test('a closed encoder stdin rejects a backpressured write', async () => {
  const { child, stdin } = fakeBackpressuredRecorder();
  const promise = writeWithBackpressure(child, Buffer.alloc(512));
  stdin.destroyed = true;
  stdin.emit('close');
  await assert.rejects(promise, /closed before PCM could drain/);
});

test('recorder shutdown cleans up its deadline timer instead of leaving a one-minute task', async () => {
  const source = await readFile(
    new URL('../src/services/livekitServerRecording.js', import.meta.url), 'utf8'
  );
  assert.match(source, /await withDeadline\(\s*session\.closed, STOP_TIMEOUT_MS,/);
  assert.doesNotMatch(source, /await Promise\.race\(\[\s*session\.closed,/);
});
