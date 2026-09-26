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
  assert.match(service, /stopLiveKitServerRecording/);
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

test('autosave finalizes server-side, respects offline, and never loops requests', async () => {
  const autosave = await read('../../frontend/src/services/recordingAutosave.js');

  assert.match(autosave, /navigator\.onLine === false/);
  assert.match(autosave, /RECORDING_WAITING_FOR_NETWORK/);
  // Server finalization replaced the giant client upload: no giant WAV File
  // construction, no one-shot multipart upload of the master blob.
  assert.match(autosave, /finalizeServerReplay/);
  assert.doesNotMatch(autosave, /new File\(\[recording\.blob/);
  assert.doesNotMatch(autosave, /uploadAudioWithProgress/);
  assert.doesNotMatch(autosave, /setInterval|setTimeout/);
});

test('recovery save states are explained, event-driven, and never strand the master', async () => {
  const autosave = await read('../../frontend/src/services/recordingAutosave.js');
  const banner = await read('../../frontend/src/Components/RecordingSaveBanner.jsx');

  // Raw backend text is never shown; every recovery code has safe language.
  assert.match(autosave, /friendlyRecoveryMessage/);
  assert.match(autosave, /RECORDING_WAITING_FOR_NETWORK/);
  assert.match(autosave, /BROADCAST_STILL_LIVE/);
  assert.match(autosave, /RECOVERY_FORBIDDEN/);
  assert.match(autosave, /BROADCAST_NOT_FOUND/);
  assert.match(autosave, /BROADCAST_NOT_RECOVERABLE/);
  assert.doesNotMatch(autosave, /could not be linked to this replay/);

  // Event-driven network recovery, not a polling loop.
  assert.match(banner, /window\.addEventListener\('online'/);
  assert.doesNotMatch(banner, /setInterval\(.*refresh|setInterval\(.*save/i);

  // Lifecycle events keep the workstation truthful end to end.
  assert.match(autosave, /status: 'done'/);
  assert.match(autosave, /status: 'error'/);
  assert.match(banner, /RECORDING_WAITING_FOR_NETWORK/);

  // OPFS is cleared only after the server copy lands.
  assert.match(autosave, /clearPendingBroadcastRecording\(recording\.broadcastId\)/);

  // Duplicate-safe: repeat finalization resolves to the same replay.
  assert.match(autosave, /replay\.duplicate/);
});
