import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Recording archive: compress finished live recordings on our own server.
//
// Why this exists: the browser captures a 24-bit/48kHz stereo WAV master
// (~17 MB per minute, ~1 GB per hour). Those giants fill the server disk.
// This service runs right after a replay upload lands:
//
//   1. Transcode the WAV to Opus (~64 kbps stereo ≈ 29 MB/hour,
//      ~35x smaller) with the machine FFmpeg.
//   2. Keep the Opus file in the server uploads/audio directory and point
//      the Audio record at it, then delete the local WAV.
//
// Everything is best-effort and NEVER throws: any failure (no FFmpeg,
// transcode error) logs a warning and keeps the original file, so
// archiving can never break the upload it follows.
//
// NOTE: Echoo stores recordings on its own server. There is no cloud /
// S3 / Backblaze B2 object storage in this path by design.
// ---------------------------------------------------------------------------

const ffmpegPath = () => String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const opusBitrate = () => String(process.env.AUDIO_OPUS_BITRATE || '64k').trim() || '64k';
const mp3Bitrate = () => String(process.env.AUDIO_MP3_BITRATE || '128k').trim() || '128k';
const keepOriginal = () => String(process.env.AUDIO_KEEP_LOCAL_AFTER_ARCHIVE || '').toLowerCase() === 'true';

// The creator picks the saved format when the recording is saved:
// 'opus' (small, recommended) or 'mp3' (maximum compatibility).
export const normalizeArchiveFormat = (value) =>
  String(value || '').trim().toLowerCase() === 'mp3' ? 'mp3' : 'opus';

// 64 kbps stereo Opus ≈ 29 MB/hour (35x smaller than the 24-bit WAV master)
// while staying transparent for voice and kind to music. Voice-only stations
// can drop to 32k via AUDIO_OPUS_BITRATE (≈15 MB/hour); music-first stations
// can raise to 96k (≈44 MB/hour).
export async function transcodeToOpus(sourcePath, destPath) {
  const runFfmpeg = (args, timeoutMs = 10 * 60 * 1000) =>
    new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(error);
        return;
      }
      let stderr = '';
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already gone.
        }
        reject(new Error('Audio transcode timed out'));
      }, timeoutMs);
      if (timer.unref) timer.unref();
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString('utf8').slice(0, 2000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      });
    });

  await runFfmpeg([
    '-i', sourcePath,
    '-vn',
    '-c:a', 'libopus',
    '-b:a', opusBitrate(),
    '-vbr', 'on',
    '-compression_level', '10',
    '-ar', '48000',
    '-ac', '2',
    '-application', 'audio',
    destPath,
  ]);
}

// 128 kbps MP3 ≈ 58 MB/hour — the compatibility pick. Roughly matches the
// default Opus quality at ~2x the bytes; plays on everything including old
// hardware that cannot decode Opus.
export async function transcodeToMp3(sourcePath, destPath) {
  const runFfmpeg = (args, timeoutMs = 10 * 60 * 1000) =>
    new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(error);
        return;
      }
      let stderr = '';
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Already gone.
        }
        reject(new Error('Audio transcode timed out'));
      }, timeoutMs);
      if (timer.unref) timer.unref();
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString('utf8').slice(0, 2000);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      });
    });

  await runFfmpeg([
    '-i', sourcePath,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', mp3Bitrate(),
    '-ar', '48000',
    '-ac', '2',
    destPath,
  ]);
}

const removeQuietly = async (absolutePath) => {
  if (!absolutePath) return;
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[audio-archive] local cleanup warning:', error?.message || error);
    }
  }
};

// Archive a just-uploaded replay recording on this server: transcode → repoint.
// `audio` is the saved Audio mongoose document, `localPath` the multer file.
// Returns 'local' (archived or kept as-is) or 'failed' (kept original, error
// logged). Never throws.
export async function archiveRecordingAudio({ audio, localPath }) {
  if (!audio || !localPath) return 'failed';

  const workDir = path.dirname(localPath);
  const base = `${Date.now()}-${randomUUID()}`;
  const transcodedFilename = `${base}.opus`;
  const transcodedPath = path.join(workDir, transcodedFilename);
  const mimeType = 'audio/ogg; codecs=opus';

  try {
    await transcodeToOpus(localPath, transcodedPath);
    const stat = await fs.promises.stat(transcodedPath).catch(() => null);
    if (!stat?.size) throw new Error('Transcode produced an empty file');

    const previousFilename = audio.filename;
    const previousFileKey = audio.fileKey;

    audio.storage = 'local';
    audio.cloudUrl = null;
    audio.cloudKey = null;
    audio.filename = transcodedFilename;
    audio.fileKey = transcodedFilename;
    audio.fileSize = stat.size;
    audio.mimeType = mimeType;
    await audio.save();

    console.info(
      `[audio-archive] replay ${audio._id} compressed on server (${(stat.size / 1048576).toFixed(1)} MB): ${transcodedFilename}`
    );

    if (!keepOriginal()) {
      // localPath is the original WAV master; previousFilename/fileKey point
      // at the same file. Remove it once the Opus copy is durable.
      await removeQuietly(localPath);
      if (previousFilename && previousFilename !== transcodedFilename) {
        const previousPath = path.join(workDir, path.basename(String(previousFilename)));
        if (previousPath !== localPath) await removeQuietly(previousPath);
      }
      if (previousFileKey && previousFileKey !== transcodedFilename && previousFileKey !== previousFilename) {
        await removeQuietly(path.join(workDir, path.basename(String(previousFileKey))));
      }
    }
    return 'local';
  } catch (error) {
    console.warn('[audio-archive] archiving failed, keeping original file:', error?.message || error);
    await removeQuietly(transcodedPath);
    return 'failed';
  }
}

// --- Legacy cloud-compat stubs (removed). Kept so old imports fail loudly
// --- instead of silently doing nothing.

export const isCloudArchiveEnabled = () => false;

export const isCloudBucketPublic = () => true;

export async function uploadToObjectStorage() {
  throw new Error('Cloud object storage was removed: recordings stay on the Echoo server.');
}

export async function createCloudDownloadUrl() {
  throw new Error('Cloud object storage was removed: recordings stay on the Echoo server.');
}

export default {
  isCloudArchiveEnabled,
  isCloudBucketPublic,
  transcodeToOpus,
  uploadToObjectStorage,
  createCloudDownloadUrl,
  archiveRecordingAudio,
};
