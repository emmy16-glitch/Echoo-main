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
  assert.match(banner, /useEffect\(\(\) => installRecordingAutosave\(\), \[isCreatorWorkspace\]\)/);
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
  assert.match(source, /const OPFS_CHECKPOINT_MS = 10_000/);
  assert.match(source, /queueLosslessCheckpoint/);
  assert.match(source, /queueCompressedCheckpoint/);
  assert.match(source, /writeRecoveryManifest\(recording, 'pending_upload'\)/);
});
