import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preserveInterruptedRecording } from '../src/services/serverRecordingPreservation.js';

test('failed recorder protects bytes without publishing them as a replay', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-replay-'));
  try {
    const output = path.join(dir, 'test-broadcast.mp3');
    const data = Buffer.alloc(8192, 0x55);
    await fs.writeFile(output, data);
    const first = await preserveInterruptedRecording(output);
    assert.deepEqual(first, { partialBytes: 8192, partialAvailable: true });
    await assert.rejects(fs.stat(output), { code: 'ENOENT' });
    let saved = (await fs.readdir(dir)).filter((name) => name.includes('.interrupted-'));
    assert.equal(saved.length, 1);
    assert.deepEqual(await fs.readFile(path.join(dir, saved[0])), data);
    await fs.writeFile(output, Buffer.alloc(16384, 0x66));
    const second = await preserveInterruptedRecording(output);
    assert.deepEqual(second, { partialBytes: 16384, partialAvailable: true });
    saved = (await fs.readdir(dir)).filter((name) => name.includes('.interrupted-'));
    assert.equal(saved.length, 2, 'a second failure must never overwrite the first salvage');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('missing recorder produces no falsely verified salvage', async () => {
  const result = await preserveInterruptedRecording('/no/such/echoo-test-broadcast.mp3');
  assert.deepEqual(result, { partialBytes: 0, partialAvailable: false });
});
