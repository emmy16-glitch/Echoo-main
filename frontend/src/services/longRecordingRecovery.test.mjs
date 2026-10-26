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
  assert.match(studio, /<ServerRecordingProgress \/>/);
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
