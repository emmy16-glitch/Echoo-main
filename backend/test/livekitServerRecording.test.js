import test from 'node:test';
import assert from 'node:assert/strict';

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
