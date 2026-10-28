import fs from 'node:fs/promises';
import path from 'node:path';

// Fast status check: a database row, an MP3 filename or a plausible file
// length is not proof that any playable recording bytes still exist. This
// check stays inexpensive for long recordings by reading only their header.
// Full decode/duration verification remains part of replay finalization.
export async function savedReplayFileAvailable(audio, { root = process.cwd() } = {}) {
  if (!audio || audio.isDeleted) return false;
  if (audio.storage === 'cloud' && audio.cloudKey) {
    // This proves a registered cloud archive, not provider uptime. The signed
    // media endpoint separately handles missing/unreachable cloud objects.
    return true;
  }
  const name = String(audio.filename || '');
  if (!name || path.basename(name) !== name) return false;
  const kind = String(audio.mimeType || '').toLowerCase();
  const mp3 = /\.mp3$/i.test(name) && (!kind || kind === 'audio/mpeg' || kind === 'audio/mp3');
  const wav = /\.wav$/i.test(name) && (!kind || kind.includes('wav'));
  if (!mp3 && !wav) return false;
  const filePath = path.join(root, 'uploads', 'audio', name);
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size < 4096) return false;
  const expectedBytes = Number(audio.fileSize);
  if (Number.isFinite(expectedBytes) && expectedBytes > 0 && stat.size !== expectedBytes) {
    return false;
  }
  let handle = null;
  try {
    handle = await fs.open(filePath, 'r');
    const signature = Buffer.alloc(12);
    const { bytesRead } = await handle.read(signature, 0, 12, 0);
    if (bytesRead !== 12) return false;
    if (mp3) {
      return signature.toString('ascii', 0, 3) === 'ID3' ||
        (signature[0] === 0xff && (signature[1] & 0xe0) === 0xe0);
    }
    return (signature.toString('ascii', 0, 4) === 'RIFF' ||
      signature.toString('ascii', 0, 4) === 'RF64') &&
      signature.toString('ascii', 8, 12) === 'WAVE';
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => null);
  }
}
