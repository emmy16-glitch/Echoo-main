import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) =>
  readFile(new URL(relative, import.meta.url), 'utf8');

test('a creator sees recording recovery on Broadcast after refresh', async () => {
  const banner = await read('../Components/RecordingSaveBanner.jsx');
  assert.match(banner, /const inCreatorWorkspace = String\(location\.pathname \|\| ''\)\.startsWith\('\/creator-studio'\)/);
  assert.match(banner, /state\.kind === 'recovered'/);
  assert.match(banner, /getBroadcastRecordingState\(\)\.recording/);
  assert.match(banner, /flushRecordingForPageHide\(\)/);
  assert.match(banner, /await uploadRecoveredTake\(/);
  assert.match(banner, /installRecordingAutosave\(\{ recoverOnInstall: isCreatorWorkspace \}\)/);
});

test('recovered master is not forgotten before server acknowledgement', async () => {
  const autosave = await read('./recordingAutosave.js');
  const start = autosave.indexOf('export const uploadRecoveredTake');
  const end = autosave.indexOf('// Headless mount', start);
  assert(start > 0 && end > start);
  const retry = autosave.slice(start, end);
  assert.match(retry, /const saved = await startAutosave\(/);
  assert.match(retry, /if \(saved\?\.audioId\) forgetLocalMaster\('recovered'\)/);
  assert.doesNotMatch(retry, /forgetLocalMaster\('recovered'\);\s*return startAutosave/);
});

test('long browser recordings checkpoint independently of the live stream', async () => {
  const source = await read('./broadcastRecordingService.js');
  assert.match(source, /const LONG_SESSION_TARGET_SECONDS = 12 \* 60 \* 60/);
  assert.match(source, /const OPFS_CHECKPOINT_MS = 15_000/);
  assert.match(source, /queueLosslessCheckpoint/);
  assert.match(source, /queueCompressedCheckpoint/);
  assert.match(source, /writeRecoveryManifest\(recording, 'pending_upload'\)/);
});

test('persistent recording progress survives navigation, refresh and network failure', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../Components/CreatorStudio/ServerRecordingProgress.jsx', import.meta.url), 'utf8');
  const studio = await fs.readFile(new URL('../Components/CreatorStudio/CreatorStudio.jsx', import.meta.url), 'utf8');
  const broadcast = await fs.readFile(new URL('../Components/CreatorStudio/CreatorLiveConnectedWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /echoo:server-recording-progress:v1/);
  assert.match(source, /rememberSnapshot\(broadcastId, result\)/);
  assert.match(source, /window.addEventListener\('online'/);
  assert.match(source, /document.addEventListener\('visibilitychange'/);
  assert.match(source, /role="progressbar"/);
  assert.match(source, /retryAutosave\(broadcastId\)/);
  assert.match(source, /retryRecordingFinalization\(broadcastId\)/);
  assert.match(source, /Restoring the last verified recording state/);
  assert.match(studio, /<ServerRecordingProgress compact=\{activeNav === 'Broadcast'\}/);
  assert.match(broadcast, /echoo:recording-track-broadcast/);
});

test('live recording progress does not push End Broadcast below the viewport', async () => {
  const studio = await read('../Components/CreatorStudio/CreatorStudio.jsx');
  const styles = await read('../Components/CreatorStudio/CreatorBroadcastApproved.css');
  const panel = await read('../Components/CreatorStudio/ServerRecordingProgress.jsx');
  assert.match(studio, /studio-persistent-recording is-live-workspace/);
  assert.match(studio, /<ServerRecordingProgress compact=\{activeNav === 'Broadcast'\}/);
  assert.match(styles, /\.studio-persistent-recording\.is-live-workspace \{/);
  assert.match(styles, /position: fixed;/);
  assert.match(panel, /compact && live && !expanded/);
  assert.match(panel, /setExpanded\(true\)/);
});

test('recording progress never intercepts the live Reconnect audio button', async () => {
  const panel = await read('../Components/CreatorStudio/ServerRecordingProgress.jsx');
  const css = await read('../Components/CreatorStudio/CreatorBroadcastApproved.css');
  assert.match(panel, /if \(compact\) return null;/);
  assert.match(css, /studio-persistent-recording\.is-live-workspace > \* \{ pointer-events: none;/);
  assert.match(css, /studio-persistent-recording\.is-live-workspace button \{ pointer-events: auto;/);
});

test('a linked replay must be physically verified before deleting OPFS recovery', async () => {
  const autosave = await read('./recordingAutosave.js');
  const completion = autosave.slice(
    autosave.indexOf("if (replay.status === 'ready' && replay.audioId)"),
    autosave.indexOf("if (replay.status === 'incomplete' || replay.status === 'failed')")
  );
  assert.match(completion, /getServerRecordingProgress\(recording\.broadcastId\)/);
  assert.match(completion, /verifiedProgress\?\.data\?\.fullReplaySaved !== true/);
  assert.match(completion, /verifiedProgress\?\.data\?\.replayFileUnavailable === true/);
  assert(completion.indexOf('fullReplaySaved !== true') < completion.indexOf('recording.dispose'));

  const boot = autosave.slice(autosave.indexOf('export const installRecordingAutosave'));
  assert.match(boot, /getServerRecordingProgress\(broadcastId\)/);
  assert.match(boot, /progress\?\.data\?\.fullReplaySaved === true/);
  assert.doesNotMatch(boot, /serverBroadcast\?\.replayAudio\s*\|\|/);
});

test('delayed device copy cannot delete OPFS after the server replay disappears', async () => {
  const autosave = await read('./recordingAutosave.js');
  assert.match(autosave, /const isServerReplayVerified = async \(broadcastId\)/);
  const choice = autosave.slice(
    autosave.indexOf('export const completeDeviceCopyChoice'),
    autosave.indexOf('export const saveRecoveryCopy')
  );
  assert.match(choice, /pending\.serverReady = await isServerReplayVerified\(pending\.recording\.broadcastId\)/);
  assert(choice.indexOf('pending.serverReady = await isServerReplayVerified') <
    choice.indexOf('pending.recording.dispose'));
  const saving = autosave.slice(
    autosave.indexOf('export const saveRecoveryCopy'),
    autosave.indexOf('export const retryAutosave')
  );
  assert.match(saving, /pending\.serverReady = await isServerReplayVerified\(pending\.recording\?\.broadcastId\)/);
  assert(saving.indexOf('pending.serverReady = await isServerReplayVerified') <
    saving.indexOf('pending.recording?.dispose'));
  assert.match(saving, /status: 'error', key,/);
  assert.match(saving, /rememberLocalMaster\(lookupKey, pending\)/);
});

test('persistent recording retry resumes the matching recovered OPFS master after refresh', async () => {
  const source = await read('./recordingAutosave.js');
  const start = source.indexOf('export const retryAutosave =');
  const end = source.indexOf('export const uploadRecoveredTake =', start);
  assert(start >= 0 && end > start);
  const retry = source.slice(start, end);
  assert.match(retry, /peekLocalMaster\('recovered'\)/);
  assert.match(retry, /String\(recovered\?\.recording\?\.broadcastId \|\| ''\) !== String\(key\)/);
  assert.match(retry, /!recovered\?\.recording\?\.blob\?\.size/);
  assert.match(retry, /return uploadRecoveredTake\(recovered\)/);
  assert.match(retry, /await batch3Service\.recoverBroadcast\(pending\.recording\.broadcastId\)/);
  assert.match(retry, /return startAutosave\(\{/);
});

test('OPFS recovery skips an evicted newest file without deleting older metadata', async () => {
  const { recoveryCandidatesForUser, firstAvailableRecoveryManifest } =
    await import('./recoveryManifestAvailability.js');
  const entries = [
    { storageName: 'newest', ownerUserId: 'creator-a' },
    { storageName: 'older', ownerUserId: 'creator-a' },
  ];
  const candidates = recoveryCandidatesForUser(entries, 'creator-a');
  const seen = [];
  const found = await firstAvailableRecoveryManifest(candidates, async (manifest) => {
    seen.push(manifest.storageName);
    if (manifest.storageName === 'newest') throw new Error('NotFoundError');
    return true;
  });
  assert.equal(found?.storageName, 'older');
  assert.deepEqual(seen, ['newest', 'older']);
  assert.equal(entries.length, 2);
});

test('OPFS recovery skips empty files and never selects another creator recording', async () => {
  const { recoveryCandidatesForUser, firstAvailableRecoveryManifest } =
    await import('./recoveryManifestAvailability.js');
  const manifests = [
    { storageName: 'other', ownerUserId: 'creator-b' },
    { storageName: 'empty', ownerUserId: 'creator-a' },
    { storageName: 'usable', ownerUserId: 'creator-a' },
    { storageName: 'legacy' },
  ];
  const candidates = recoveryCandidatesForUser(manifests, 'creator-a');
  assert.deepEqual(candidates.map((item) => item.storageName), ['empty', 'usable', 'legacy']);
  const found = await firstAvailableRecoveryManifest(candidates, async (item) => item.storageName !== 'empty');
  assert.equal(found?.storageName, 'usable');
  assert.deepEqual(recoveryCandidatesForUser(manifests, ''), [{ storageName: 'legacy' }]);
});

test('OPFS recovery preserves registry and returns null if no local file is readable', async () => {
  const { firstAvailableRecoveryManifest } = await import('./recoveryManifestAvailability.js');
  const manifests = [{ storageName: 'missing' }, { storageName: 'empty' }];
  assert.equal(await firstAvailableRecoveryManifest(manifests, async () => false), null);
  assert.deepEqual(manifests, [{ storageName: 'missing' }, { storageName: 'empty' }]);
});

test('boot recovery checks candidate file availability before hydrating the OPFS master', async () => {
  const source = await read('./broadcastRecordingService.js');
  assert.match(source, /const readRecoveryMetadata = async \(\) =>/);
  assert.match(source, /recoveryCandidatesForUser\(readRecoveryManifests\(\), currentSessionUserId\(\)\)/);
  assert.match(source, /firstAvailableRecoveryManifest\(candidates, async \(manifest\) =>/);
  assert.match(source, /return file\.size > 0/);
  assert.match(source, /const meta = await readRecoveryMetadata\(\)/);
});

test('resumable chunk retries a 401 once after refreshing credentials without changing offset', async () => {
  const { postChunkWithAuthRetry } = await import('./resumableUploadAuth.js');
  let token = 'expired';
  const offset = 5 * 1024 * 1024;
  const attempts = [];
  let refreshes = 0;
  const result = await postChunkWithAuthRetry(
    async () => {
      attempts.push({ token, offset });
      return { status: token === 'expired' ? 401 : 200 };
    },
    async () => { refreshes += 1; token = 'renewed'; return token; }
  );
  assert.equal(result.status, 200);
  assert.equal(refreshes, 1);
  assert.deepEqual(attempts, [
    { token: 'expired', offset },
    { token: 'renewed', offset },
  ]);
});

test('resumable chunk does not refresh for authorization failures other than 401', async () => {
  const { postChunkWithAuthRetry } = await import('./resumableUploadAuth.js');
  let sends = 0, refreshes = 0;
  const result = await postChunkWithAuthRetry(
    async () => { sends += 1; return { status: 403 }; },
    async () => { refreshes += 1; return 'new-token'; }
  );
  assert.equal(result.status, 403);
  assert.equal(sends, 1);
  assert.equal(refreshes, 0);
});

test('resumable chunk never loops on repeated 401 or failed refresh', async () => {
  const { postChunkWithAuthRetry } = await import('./resumableUploadAuth.js');
  let sends = 0;
  const unauthorized = async () => { sends += 1; return { status: 401 }; };
  const twice = await postChunkWithAuthRetry(unauthorized, async () => 'renewed');
  assert.equal(twice.status, 401);
  assert.equal(sends, 2);
  const failedRefresh = await postChunkWithAuthRetry(unauthorized, async () => { throw new Error('offline'); });
  assert.equal(failedRefresh.status, 401);
  assert.equal(sends, 3);
});

test('resumable chunk does not resend if the user pauses during token refresh', async () => {
  const { postChunkWithAuthRetry } = await import('./resumableUploadAuth.js');
  const controller = new AbortController();
  let sends = 0;
  const result = await postChunkWithAuthRetry(
    async () => { sends += 1; return { status: 401 }; },
    async () => { controller.abort(); return 'renewed'; },
    controller.signal
  );
  assert.equal(result.status, 401);
  assert.equal(sends, 1);
});

test('studio resumable upload uses bounded auth refresh with a freshly read token per chunk attempt', async () => {
  const source = await read('./studioService.js');
  const start = source.indexOf('uploadAudioResumable: async');
  const end = source.indexOf('cancelResumableUpload:', start);
  assert(start >= 0 && end > start);
  const upload = source.slice(start, end);
  assert.match(upload, /postChunkWithAuthRetry\(/);
  assert.match(upload, /refreshSessionAccessToken,/);
  assert.match(upload, /Authorization: `Bearer \$\{getCurrentAccessToken\(\)\}`/);
});
