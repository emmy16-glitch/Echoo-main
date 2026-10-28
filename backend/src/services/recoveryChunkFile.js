import fs from 'node:fs/promises';

// 'wx' establishes ownership before any bytes are written. An EEXIST retry
// never owns the existing path and must never remove another request's audio.
export async function writeRecoveryChunkFile(filePath, buffer) {
  const handle = await fs.open(filePath, 'wx', 0o600);
  let failure = null;
  try {
    await handle.writeFile(buffer);
    await handle.sync();
  } catch (error) {
    failure = error;
  }
  try {
    await handle.close();
  } catch (error) {
    failure ||= error;
  }
  if (failure) {
    await fs.rm(filePath, { force: true }).catch(() => null);
    throw failure;
  }
}

// Only the request that successfully created a file may clean it up.
// This also protects the winner when two identical retries overlap.
export async function cleanupOwnedRecoveryChunkFile(filePath, owned) {
  if (!owned || !filePath) return false;
  await fs.rm(filePath, { force: true });
  return true;
}
