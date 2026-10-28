// A successful upload acknowledgement must mean every byte was written and
// flushed before MongoDB's confirmed offset is advanced. FileHandle.write()
// is permitted to complete with fewer bytes than requested.
export async function writeUploadChunkFully(handle, data, offset) {
  if (!Buffer.isBuffer(data) || !Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError('Invalid upload chunk or offset');
  }
  let written = 0;
  while (written < data.length) {
    const { bytesWritten } = await handle.write(data, written, data.length - written, offset + written);
    if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > data.length - written) {
      throw new Error('Upload chunk write made no valid progress');
    }
    written += bytesWritten;
  }
  await handle.sync();
  return written;
}
