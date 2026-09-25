import test from 'node:test';
import assert from 'node:assert/strict';

import { isTranscriptionConfigured } from '../src/services/transcriptionGateway.js';

const originalEnv = { ...process.env };

const restoreEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

test.afterEach(restoreEnv);

test('old Whisper credentials cannot enable transcription when feature flag is off', () => {
  Object.assign(process.env, {
    TRANSCRIPTION_ENABLED: 'false',
    WHISPER_FLOW_URL: 'wss://whisper.example/ws',
    WHISPER_FLOW_API_KEY: 'old-secret',
  });
  assert.equal(isTranscriptionConfigured(), false);
});

test('transcription requires explicit opt-in plus provider credentials', () => {
  Object.assign(process.env, {
    TRANSCRIPTION_ENABLED: 'true',
    WHISPER_FLOW_URL: 'wss://whisper.example/ws',
    WHISPER_FLOW_API_KEY: 'test-secret',
  });
  assert.equal(isTranscriptionConfigured(), true);

  process.env.WHISPER_FLOW_API_KEY = '';
  assert.equal(isTranscriptionConfigured(), false);
});
