import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeUploadChunkFully } from '../src/services/resumableUploadWrite.js';

test('resumable upload controller uses complete and durable positional writes', async () => {
  const source = await fs.readFile(new URL('../src/controllers/uploadController.js', import.meta.url), 'utf8');
  assert.match(source, /writeUploadChunkFully\(handle, data, offset\)/);
  assert.doesNotMatch(source, /await handle\.write\(data, 0, data\.length, offset\)/);
});

test('retries short writes at the correct absolute offsets before acknowledging', async () => {
  const data = Buffer.from('abcdefghij');
  const stored = Buffer.alloc(32, 0);
  const positions = [];
  let synced = 0;
  const handle = {
    async write(buffer, bufferOffset, length, position) {
      const bytesWritten = Math.min(3, length);
      buffer.copy(stored, position, bufferOffset, bufferOffset + bytesWritten);
      positions.push(position);
      return { bytesWritten };
    },
    async sync() { synced += 1; },
  };
  assert.equal(await writeUploadChunkFully(handle, data, 7), data.length);
  assert.deepEqual(positions, [7, 10, 13, 16]);
  assert.equal(stored.subarray(7, 17).toString(), 'abcdefghij');
  assert.equal(synced, 1);
});

test('never acknowledges zero-byte writes or flushes incomplete data', async () => {
  let synced = false;
  const handle = {
    async write() { return { bytesWritten: 0 }; },
    async sync() { synced = true; },
  };
  await assert.rejects(writeUploadChunkFully(handle, Buffer.from('hello'), 0), /no valid progress/);
  assert.equal(synced, false);
});

test('does not acknowledge a chunk when the durability flush fails', async () => {
  const handle = {
    async write(_buffer, _offset, length) { return { bytesWritten: length }; },
    async sync() { throw new Error('disk I/O failure'); },
  };
  await assert.rejects(writeUploadChunkFully(handle, Buffer.from('hello'), 0), /disk I\/O failure/);
});

test('writes a real resumed chunk at the requested offset and flushes it', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-upload-write-'));
  const filename = path.join(dir, 'resume.part');
  try {
    await fs.writeFile(filename, 'ABCDEstale');
    const handle = await fs.open(filename, 'r+');
    try {
      await handle.truncate(5);
      assert.equal(await writeUploadChunkFully(handle, Buffer.from('123456'), 5), 6);
    } finally { await handle.close(); }
    assert.equal(await fs.readFile(filename, 'utf8'), 'ABCDE123456');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
