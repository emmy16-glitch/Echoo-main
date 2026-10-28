import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Use a new process each time: env.js is intentionally frozen at module load.
// No real database, LiveKit or Whisper endpoint is contacted by this test.
const cwd = fileURLToPath(new URL('../', import.meta.url));
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    !name.startsWith('WHISPER_') && name !== 'VERCEL' && name !== 'VERCEL_URL')
);
const required = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/echoo-config-test',
  JWT_SECRET: 'test-only-access-token-secret',
  JWT_REFRESH_SECRET: 'test-only-refresh-token-secret',
  CLIENT_ORIGINS: 'https://echoo.digi02.org',
  FRONTEND_URL: 'https://echoo.digi02.org',
  LIVEKIT_URL: 'wss://example.livekit.cloud',
  LIVEKIT_PUBLIC_URL: 'wss://example.livekit.cloud',
  LIVEKIT_API_KEY: 'test-only-key',
  LIVEKIT_API_SECRET: 'test-only-secret',
  TRANSCRIPTION_ENABLED: 'false',
};

const check = (overrides = {}) =>
  spawnSync(process.execPath,
    ['--input-type=module', '-e',
      "await import('./src/config/env.js').then(() => process.stdout.write('READY')).catch(error => { process.stderr.write(error.message); process.exitCode = 1; });"],
    {
      cwd, encoding: 'utf8', timeout: 12000,
      env: { ...baseEnv, ...required, ...overrides },
    });

test('production can start with the shipped Digi02 transcription-disabled environment', () => {
  const result = check({
    TRANSCRIPTION_ENABLED: 'false',
    WHISPER_FLOW_URL: 'ws://127.0.0.1:8181/ws',
    WHISPER_FLOW_API_KEY: '',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /READY/);
});

test('enabled local loopback Whisper remains valid when authenticated', () => {
  const result = check({
    TRANSCRIPTION_ENABLED: 'true',
    WHISPER_FLOW_URL: 'ws://127.0.0.1:8181/ws',
    WHISPER_FLOW_API_KEY: 'local-private-worker-key',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('enabled Whisper rejects non-TLS remote sockets', () => {
  const result = check({
    TRANSCRIPTION_ENABLED: 'true',
    WHISPER_FLOW_URL: 'ws://whisper.example.org/ws',
    WHISPER_FLOW_API_KEY: 'test-key',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /wss:\/\//);
});

test('enabled Whisper requires a real provider key', () => {
  const result = check({
    TRANSCRIPTION_ENABLED: 'true',
    WHISPER_FLOW_URL: 'wss://whisper.example.org/ws',
    WHISPER_FLOW_API_KEY: '',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WHISPER_FLOW_API_KEY/);
});

test('enabled production Whisper requires a live endpoint', () => {
  const result = check({
    TRANSCRIPTION_ENABLED: 'true',
    WHISPER_FLOW_URL: '',
    WHISPER_FLOW_API_KEY: 'test-key',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WHISPER_FLOW_URL/);
});
