import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hasConfirmedUploadPrefix } from '../src/services/resumableUploadPrefixSafety.js';

const fileStat = (size) => ({ size, isFile: () => true });

test('confirmed prefix must exist before any resumed bytes are appended', () => {
  assert.equal(hasConfirmedUploadPrefix(fileStat(10), 10), true);
  assert.equal(hasConfirmedUploadPrefix(fileStat(11), 10), true);
  assert.equal(hasConfirmedUploadPrefix(fileStat(9), 10), false);
  assert.equal(hasConfirmedUploadPrefix(fileStat(0), 0), true);
  assert.equal(hasConfirmedUploadPrefix(null, 10), false);
  assert.equal(hasConfirmedUploadPrefix({ size: 100, isFile: () => false }, 10), false);
  assert.equal(hasConfirmedUploadPrefix(fileStat(100), -1), false);
  assert.equal(hasConfirmedUploadPrefix(fileStat(100), Number.NaN), false);
});

test('truncated file after restart is rejected without extending or deleting its surviving bytes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'echoo-confirmed-prefix-'));
  const target = path.join(dir, 'existing-upload.part');
  try {
    await fs.writeFile(target, Buffer.from('ABCDE'));
    const stat = await fs.stat(target);
    assert.equal(hasConfirmedUploadPrefix(stat, 10), false);
    assert.equal((await fs.readFile(target)).toString(), 'ABCDE');
    assert.equal(hasConfirmedUploadPrefix(stat, 5), true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('controller checks prefix before truncation and rejects corrupt resume status', async () => {
  const source = await fs.readFile(new URL('../src/controllers/uploadController.js', import.meta.url), 'utf8');
  assert.match(source, /hasConfirmedUploadPrefix\(resumeStat, resume\.offset\)/);
  assert.match(source, /hasConfirmedUploadPrefix\(await handle\.stat\(\), session\.offset\)/);
  assert.match(source, /UPLOAD_STORAGE_TRUNCATED/);
  const upload = source.slice(source.indexOf('export async function uploadChunk'), source.indexOf('export async function completeUpload'));
  assert(upload.indexOf('hasConfirmedUploadPrefix(await handle.stat(), session.offset)') < upload.indexOf('await handle.truncate(session.offset)'));
  const status = source.slice(source.indexOf('export async function getUploadStatus'), source.indexOf('export async function cancelUpload'));
  assert.match(status, /hasConfirmedUploadPrefix\(stat, session\.offset\)/);
});

test('frontend falls back to a fresh upload when an old session lost confirmed bytes', async () => {
  const source = await fs.readFile(new URL('../../frontend/src/services/studioService.js', import.meta.url), 'utf8');
  const start = source.indexOf('uploadAudioResumable:');
  const end = source.indexOf('cancelResumableUpload:', start);
  const upload = source.slice(start, end);
  assert(start >= 0 && end > start);
  assert.match(upload, /error\?\.code !== 'UPLOAD_STORAGE_TRUNCATED'/);
  assert.match(upload, /if \(!initiated\) initiated = await readResponse\(await apiFetch\('\/uploads\/initiate'/);
});
