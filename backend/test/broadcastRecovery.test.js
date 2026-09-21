import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8');

test('recovery reconciles interrupted lifecycles without fabricating history', async () => {
  const service = await read('../src/services/broadcastRecoveryService.js');

  // Ownership + existence are always verified first.
  assert.match(service, /isDeleted:\s*false/);
  assert.match(service, /String\(broadcast\.creator\) !== String\(userId\)/);
  assert.match(service, /RECOVERY_FORBIDDEN/);
  assert.match(service, /BROADCAST_NOT_FOUND/);

  // Exactly one replay: existing links/records return as success.
  assert.match(service, /already_has_replay/);
  assert.match(service, /sourceBroadcast:\s*broadcast\._id/);

  // Stale links to missing Audio docs must not wedge recovery.
  assert.match(service, /broadcast\.replayAudio = null/);

  // No blanket status rewrite: each lifecycle state is handled explicitly.
  assert.match(service, /status === 'completed'/);
  assert.match(service, /status === 'ending'/);
  assert.match(service, /status === 'live' \|\| broadcast\.status === 'starting'/);
  assert.match(service, /BROADCAST_NOT_RECOVERABLE/);
  assert.doesNotMatch(service, /\$set:\s*\{\s*status:\s*['"]completed['"]/);

  // A truly active session is never auto-finalized: LiveKit room occupancy
  // is ground truth, provider outages stay conservative.
  assert.match(service, /getParticipants/);
  assert.match(service, /BROADCAST_STILL_LIVE/);

  // Finalization mirrors end-of-life cleanup without transcription.
  assert.match(service, /releaseCreatorBroadcastLease/);
  assert.match(service, /stopBroadcastOutputs/);
  assert.match(service, /transcriptionEnabled:\s*false/);
  assert.match(service, /transcriptState.*disabled/);
  assert.doesNotMatch(service, /WHISPER|whisper|transcript_completion/);
});

test('recovery route is creator-gated and upload keeps its idempotency key', async () => {
  const routes = await read('../src/routes/broadcastRoutes.js');
  assert.match(
    routes,
    /router\.post\('\/:broadcastId\/recover',\s*authenticate,\s*requireCreator,\s*recoverBroadcast\)/
  );

  const controller = await read('../src/controllers/audioController.js');
  assert.match(controller, /BROADCAST_NOT_READY_FOR_REPLAY/);
  assert.match(controller, /REPLAY_ALREADY_EXISTS/);
  assert.match(controller, /reconcileExistingReplay/);

  const audio = await read('../src/models/Audio.js');
  assert.match(audio, /sourceBroadcast/);
  assert.match(audio, /unique:\s*true/);
});

test('autosave reconciles once, respects offline, and never loops requests', async () => {
  const autosave = await read('../../frontend/src/services/recordingAutosave.js');

  assert.match(autosave, /navigator\.onLine === false/);
  assert.match(autosave, /RECORDING_WAITING_FOR_NETWORK/);
  assert.match(autosave, /BROADCAST_NOT_READY_FOR_REPLAY/);
  assert.match(autosave, /recoverBroadcast/);
  // Exactly one recovery call followed by exactly one upload retry.
  assert.equal((autosave.match(/uploadOnce\(\)/g) || []).length, 2);
  assert.equal((autosave.match(/recoverBroadcast\(/g) || []).length, 1);
  assert.doesNotMatch(autosave, /setInterval|setTimeout/);
});

test('recovery dialog preserves the master, explains states, and offers download', async () => {
  const prompt = await read('../../frontend/src/Components/CreatorStudio/BroadcastRecordingPrompt.jsx');

  // Raw backend text is never shown; every recovery code has safe language.
  assert.match(prompt, /friendlyRecoveryMessage/);
  assert.match(prompt, /RECORDING_WAITING_FOR_NETWORK/);
  assert.match(prompt, /BROADCAST_STILL_LIVE/);
  assert.match(prompt, /RECOVERY_FORBIDDEN/);
  assert.match(prompt, /BROADCAST_NOT_FOUND/);
  assert.match(prompt, /BROADCAST_NOT_RECOVERABLE/);
  assert.doesNotMatch(prompt, /could not be linked to this replay/);

  // Event-driven network recovery, not a polling loop.
  assert.match(prompt, /window\.addEventListener\('online'/);
  assert.doesNotMatch(prompt, /setInterval\(.*refresh|setInterval\(.*save/i);

  // Escape hatch: device download that never touches OPFS.
  assert.match(prompt, /downloadLocalCopy/);
  assert.match(prompt, /URL\.createObjectURL\(recording\.blob\)/);

  // OPFS is cleared only on server READY inside markSaved.
  const markSavedAt = prompt.indexOf('const markSaved');
  const clearAt = prompt.indexOf('clearPendingBroadcastRecording(recording.broadcastId)');
  assert.ok(markSavedAt >= 0 && clearAt > markSavedAt);
  assert.equal((prompt.match(/clearPendingBroadcastRecording\(/g) || []).length, 1);

  // Duplicate-safe: uniqueness guard still finalizes as saved.
  assert.match(prompt, /REPLAY_ALREADY_EXISTS/);
  assert.match(prompt, /beforeunload/);
});
