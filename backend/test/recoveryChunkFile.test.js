import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupOwnedRecoveryChunkFile,
  writeRecoveryChunkFile,
} from '../src/services/recoveryChunkFile.js';

test('simultaneous recovery retries cannot overwrite or remove the winning WAV', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-recovery-ownership-'));
  const target = path.join(dir, '0-recovery.wav');
  const original = Buffer.from('winning-recording-data');
  const contender = Buffer.from('losing-recording-data');
  try {
    const results = await Promise.allSettled([
      writeRecoveryChunkFile(target, original),
      writeRecoveryChunkFile(target, contender),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected' && result.reason?.code === 'EEXIST').length, 1);
    const saved = await fs.readFile(target);
    assert.ok(saved.equals(original) || saved.equals(contender));
    assert.equal(await cleanupOwnedRecoveryChunkFile(target, false), false);
    assert.deepEqual(await fs.readFile(target), saved, 'losing request must not delete the winner');
    assert.equal(await cleanupOwnedRecoveryChunkFile(target, true), true);
    await assert.rejects(fs.stat(target), { code: 'ENOENT' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('controller only cleans up owned new files and uses unique repair temporaries', async () => {
  const source = await fs.readFile(new URL('../src/controllers/broadcastChunkController.js', import.meta.url), 'utf8');
  assert.match(source, /let fileOwned = false/);
  assert.match(source, /await writeRecoveryChunkFile\(filePath, req\.file\.buffer\);\s*fileOwned = true;/);
  assert.match(source, /await cleanupOwnedRecoveryChunkFile\(filePath, fileOwned\)/);
  assert.match(source, /\.repair-\$\{randomUUID\(\)\}/);
  assert.match(source, /await cleanupOwnedRecoveryChunkFile\(tempPath, tempOwned\)/);
});
