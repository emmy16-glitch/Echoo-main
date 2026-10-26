import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Only interrupted, unverified audio is preserved here. Never hand these
// files to the public replay endpoint without independent audio verification.
export async function preserveInterruptedRecording(outputPath) {
  if (!outputPath) return { partialBytes: 0, partialAvailable: false };
  try {
    const stat = await fs.stat(outputPath);
    if (!stat.isFile() || stat.size < 4096) {
      return { partialBytes: 0, partialAvailable: false };
    }
    // Every salvage name is unique. A second recorder failure cannot replace
    // evidence from the first attempt for the same long broadcast.
    const protectedPath = `${outputPath}.interrupted-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`;
    await fs.rename(outputPath, protectedPath);
    console.warn('[Echoo Server Recording] protected interrupted MP3 for recovery:', protectedPath);
    return { partialBytes: stat.size, partialAvailable: true };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[Echoo Server Recording] could not preserve interrupted MP3:', error?.message || error);
    }
    return { partialBytes: 0, partialAvailable: false };
  }
}

/** Protects an existing output from FFmpeg's -y overwrite across retry races.
 * Unlike regular failed-session preservation, even a short nonempty fragment
 * is retained for operator inspection. Failure is fatal to recorder startup.
 */
export async function preservePriorRecordingOutput(outputPath) {
  if (!outputPath) throw new Error('Recording output path required.');
  const stat = await fs.lstat(outputPath).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return false;
  if (!stat.isFile()) throw new Error('Recording output is not a regular file.');
  const previousPath = `${outputPath}.interrupted-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`;
  await fs.rename(outputPath, previousPath);
  console.warn('[Echoo Server Recording] retained earlier output before encoder restart:', previousPath);
  return true;
}
