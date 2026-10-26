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
