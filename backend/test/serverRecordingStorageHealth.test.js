import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { checkServerRecordingStorageReadiness } from '../src/services/serverRecordingStorageHealth.js';

test('optional recording backup does not fail staging health when disabled', async () => {
  const result = await checkServerRecordingStorageReadiness({ required: false });
  assert.deepEqual(result, { ready: true, status: 'not-required' });
});

test('recording readiness probes a real mounted writable volume, not just a directory', async () => {
  const source = await fs.readFile(new URL('../src/services/serverRecordingStorageHealth.js', import.meta.url), 'utf8');
  const routes = await fs.readFile(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  assert.match(source, /findmnt/);
  assert(source.includes("mount === '/'"));
  assert.match(source, /statfs/);
  assert(source.includes('probe.sync()'));
  assert.match(routes, /persistentBackupStorage/);
  assert.match(routes, /checkServerRecordingStorageReadiness/);
});


test('a newly started protected broadcast is rejected before going live if disk or recorder is unhealthy', async () => {
  const source = await fs.readFile(new URL('../src/controllers/broadcastLifecycleController.js', import.meta.url), 'utf8');
  const startIndex = source.indexOf('export async function startBroadcast');
  const confirmIndex = source.indexOf('export async function confirmBroadcastLive', startIndex);
  const start = source.slice(startIndex, confirmIndex);
  assert(start.indexOf('checkServerRecordingStorageReadiness') < start.indexOf('acquireCreatorBroadcastLease'));
  assert.match(start, /RECORDING_PROTECTION_UNAVAILABLE/);
  assert.match(start, /isLiveKitServerRecordingEnabled\(\)/);
});
