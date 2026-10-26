import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preserveInterruptedRecording, preservePriorRecordingOutput } from '../src/services/serverRecordingPreservation.js';

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

test('a restarted encoder preserves every byte from a previous live attempt', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-previous-attempt-'));
  try {
    const output = path.join(dir, 'same-broadcast.mp3');
    const original = Buffer.from('prior recording bytes are important');
    await fs.writeFile(output, original);
    assert.equal(await preservePriorRecordingOutput(output), true);
    await assert.rejects(fs.stat(output), { code: 'ENOENT' });
    const parts = (await fs.readdir(dir)).filter(x => x.includes('.interrupted-'));
    assert.equal(parts.length, 1);
    assert.deepEqual(await fs.readFile(path.join(dir, parts[0])), original);
    assert.equal(await preservePriorRecordingOutput(output), false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('failed recording preservation refuses to overwrite a directory or symbolic link', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-preserve-safety-'));
  try {
    await assert.rejects(preservePriorRecordingOutput(dir), /regular file/);
    const target = path.join(dir, 'original.mp3');
    const symlink = path.join(dir, 'danger.mp3');
    await fs.writeFile(target, 'original');
    await fs.symlink(target, symlink);
    await assert.rejects(preservePriorRecordingOutput(symlink), /regular file/);
    assert.equal(await fs.readFile(target, 'utf8'), 'original');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
