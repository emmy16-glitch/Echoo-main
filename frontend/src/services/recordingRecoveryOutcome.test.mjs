import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryUploadConfirmed } from './recordingRecoveryOutcome.js';

test('a failed recovery chunk cannot permanently mark an upload completed', () => {
  assert.equal(recoveryUploadConfirmed({
    replay: { status: 'incomplete', missingChunkIndices: [3], audioId: null },
    chunkErrors: [{ chunkIndex: 3, message: 'network disconnected' }],
  }), false);
  assert.equal(recoveryUploadConfirmed({
    replay: { status: 'ready', audioId: 'audio-1' },
    chunkErrors: [{ chunkIndex: 3, message: 'network disconnected' }],
  }), false);
});

test('an accepted completion request without saved replay remains retryable', () => {
  assert.equal(recoveryUploadConfirmed({ replay: { status: 'empty' }, chunkErrors: [] }), false);
  assert.equal(recoveryUploadConfirmed({ replay: { status: 'ready' }, chunkErrors: [] }), false);
  assert.equal(recoveryUploadConfirmed({ replay: null, chunkErrors: [] }), false);
});

test('a replay with no missing chunks and an acknowledged audio ID finishes', () => {
  assert.equal(recoveryUploadConfirmed({ replay: { status: 'ready', audioId: 'audio-1' }, chunkErrors: [] }), true);
});
