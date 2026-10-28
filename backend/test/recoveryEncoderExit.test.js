import test from 'node:test';
import assert from 'node:assert/strict';
import { encoderExitIsUnexpected } from '../src/services/recoveryEncoderExit.js';

test('an encoder that exits before End Broadcast is not marked completed', () => {
  assert.equal(encoderExitIsUnexpected({ code: 0, stopping: false }), true);
  assert.equal(encoderExitIsUnexpected({ code: 1, stopping: false }), true);
  assert.equal(encoderExitIsUnexpected({ code: null, signal: 'SIGKILL', stopping: false }), true);
});

test('normal intentional End Broadcast is the only clean encoder exit', () => {
  assert.equal(encoderExitIsUnexpected({ code: 0, stopping: true }), false);
  assert.equal(encoderExitIsUnexpected({ code: null, signal: 'SIGKILL', stopping: true }), true);
  assert.equal(encoderExitIsUnexpected({ code: 1, stopping: true }), true);
});
