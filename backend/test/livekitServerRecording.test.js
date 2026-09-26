import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { getLiveKitServerRecordingDiagnostics } from '../src/services/livekitServerRecording.js';

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
  assert.match(source, /session\.currentTrackSid = track/);
  assert.match(source, /session\.handoff = true/);
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
  assert.match(source, /RECORDING_SOCKET_CLOSE_GRACE_MS/);
  assert.match(source, /session\.disconnectTimer/);
  assert.match(source, /session\.sockets\.size > 0/);
});
