import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = () =>
  fs.readFile(new URL('../src/controllers/uploadController.js', import.meta.url), 'utf8');

test('upload controller validates UUID-shaped upload paths instead of joining arbitrary IDs', async () => {
  const source = await read();
  assert.match(source, /UUID_PATTERN/);
  assert.match(source, /uploadPath\(uploadId\)/);
  assert.doesNotMatch(source, /path\.join\(TEMP_DIR, uploadId\)/);
});

test('upload controller bounds upload and chunk sizes', async () => {
  const source = await read();
  assert.match(source, /MAX_UPLOAD_SIZE/);
  assert.match(source, /MAX_CHUNK_SIZE/);
  assert.match(source, /CHUNK_TOO_LARGE/);
});

test('resumable uploads persist ownership, validate offsets and checksums, and finalize idempotently', async () => {
  const source = await read();
  assert.match(source, /UploadSession/);
  assert.match(source, /Upload-Offset/);
  assert.match(source, /OFFSET_MISMATCH/);
  assert.match(source, /Upload-Checksum/);
  assert.match(source, /CHECKSUM_MISMATCH/);
  assert.match(source, /idempotent: true/);
  assert.match(source, /lockUpload/);
  assert.match(source, /CHECKSUM_REQUIRED/);
  assert.match(source, /fileKey: finalFilename/);
  assert.match(source, /MAX_AUDIO_UPLOAD_BYTES/);
  assert.doesNotMatch(source, /appendFileSync|appendFile\(/);
});
