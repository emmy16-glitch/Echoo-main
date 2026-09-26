import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Recording archive: compress finished live recordings to MP3.
//
// Why this exists: the browser captures a 24-bit/48kHz stereo WAV master
// (~17 MB per minute, ~1 GB per hour). Those giants die mid-upload, fill the
// local disk, and vanish on redeploys — the "my recording disappeared"
// problem. This service runs right after a replay upload lands:
//
//   Server copy (automatic, always MP3):
//   1. Transcode the WAV master to MP3 (default 192k stereo ≈ 86 MB/hour).
//      The MP3 becomes the canonical server file; the giant WAV is deleted.
//   2. If S3-compatible object storage is configured (Cloudflare R2 free
//      tier: 10 GB + zero egress — see backend/.env.example AUDIO_*),
//      PUT the MP3 to the bucket and point the Audio record at the cloud URL.
//
// Everything is best-effort and NEVER throws: any failure (no FFmpeg, no
// cloud config, upload error) logs a warning and keeps the local file, so
// archiving can never break the upload it follows.
// ---------------------------------------------------------------------------

const provider = () => String(process.env.AUDIO_STORAGE_PROVIDER || 'local').trim().toLowerCase();
export const isCloudArchiveEnabled = () => provider() !== 'local' && provider() !== '' && provider() !== 'off';

const ffmpegPath = () => String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const opusBitrate = () => String(process.env.AUDIO_OPUS_BITRATE || '48k').trim() || '48k';
const mp3Bitrate = () => String(process.env.AUDIO_MP3_BITRATE || '192k').trim() || '192k';
const keepLocal = () => String(process.env.AUDIO_KEEP_LOCAL_AFTER_ARCHIVE || '').toLowerCase() === 'true';

const s3Config = () => ({
  endpoint: String(process.env.AUDIO_S3_ENDPOINT || '').trim().replace(/\/$/, ''),
  region: String(process.env.AUDIO_S3_REGION || 'auto').trim() || 'auto',
  bucket: String(process.env.AUDIO_S3_BUCKET || '').trim(),
  accessKeyId: String(process.env.AUDIO_S3_ACCESS_KEY_ID || '').trim(),
  secretAccessKey: String(process.env.AUDIO_S3_SECRET_ACCESS_KEY || '').trim(),
  publicBase: String(process.env.AUDIO_S3_PUBLIC_BASE || '').trim().replace(/\/$/, ''),
  prefix: String(process.env.AUDIO_S3_PREFIX || 'echoo-recordings').trim().replace(/^\/+|\/+$/g, ''),
});

const s3Configured = () => {
  const config = s3Config();
  const credentialsReady = Boolean(
    config.endpoint &&
    config.bucket &&
    config.accessKeyId &&
    config.secretAccessKey
  );
  if (!credentialsReady) return false;

  // Private buckets do not need a public base URL. Playback is authorized by
  // Echoo first, then redirected to a short-lived signed S3 URL using cloudKey.
  if (!isCloudBucketPublic()) return true;

  // Public buckets can redirect directly to their public object URL.
  return Boolean(config.publicBase);
};

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

// 48 kbps stereo Opus ≈ 22 MB/hour (30x smaller than the 24-bit WAV master)
// while staying transparent for voice and kind to music. Voice-only stations
// can drop to 32k via AUDIO_OPUS_BITRATE (≈15 MB/hour). Kept for backwards
// compatibility — new recordings archive to MP3 (see transcodeToMp3).
export async function transcodeToOpus(sourcePath, destPath) {
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

// 192k stereo MP3 ≈ 86 MB/hour (≈12x smaller than the 24-bit WAV master).
// Universal playback: every browser, phone and desktop player reads MP3,
// which is why the server canonical copy is MP3. 128k (≈58 MB/hr) for
// voice-only stations, 320k (≈144 MB/hr) for music-first quality.
export async function transcodeToMp3(sourcePath, destPath) {
  await runFfmpeg([
    '-i', sourcePath,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', mp3Bitrate(),
    '-ar', '44100',
    '-ac', '2',
    destPath,
  ]);
}

let s3ClientCache = { fingerprint: '', promise: null };
async function getS3Client() {
  const config = s3Config();
  const fingerprint = JSON.stringify([
    config.endpoint,
    config.region,
    config.accessKeyId,
    config.secretAccessKey,
    String(process.env.AUDIO_S3_FORCE_PATH_STYLE || 'true'),
  ]);
  if (!s3ClientCache.promise || s3ClientCache.fingerprint !== fingerprint) {
    s3ClientCache = {
      fingerprint,
      promise: import('@aws-sdk/client-s3').then(({ S3Client }) => {
        // R2-style endpoints are path-style. Backblaze B2 accepts path-style
        // too; disable via AUDIO_S3_FORCE_PATH_STYLE=false if a provider
        // insists on virtual-hosted-style URLs.
        const forcePathStyle =
          String(process.env.AUDIO_S3_FORCE_PATH_STYLE || 'true').toLowerCase() !== 'false';
        return new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
          forcePathStyle,
        });
      }),
    };
  }
  return s3ClientCache.promise;
}

export async function uploadToObjectStorage(localPath, key, mimeType) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const config = s3Config();
  const client = await getS3Client();
  const stat = await fs.promises.stat(localPath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error('Audio archive source is missing or empty');
  }

  // Stream long replay MP3s from disk instead of reading the entire recording
  // into Node memory. A one-hour 320 kbps replay is ~144 MB, so buffering the
  // full file here creates avoidable memory spikes during archive uploads.
  const body = fs.createReadStream(localPath);
  const objectKey = config.prefix ? `${config.prefix}/${key}` : key;
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentLength: stat.size,
      ContentType: mimeType,
    })
  );
  return {
    url: config.publicBase ? `${config.publicBase}/${objectKey}` : null,
    objectKey,
  };
}

// Private buckets intentionally have no public URL. Keep archive diagnostics
// useful without treating that valid null URL as an upload failure.
export const archiveDestinationLabel = ({ url, objectKey } = {}) => {
  const destination = String(url || (objectKey ? `private://${objectKey}` : 'private object'));
  return destination.length > 80 ? `${destination.slice(0, 80)}...` : destination;
};

// Buckets that cost nothing stay PRIVATE (Backblaze charges $1 to enable
// public buckets). Playback then needs a short-lived signed URL minted at
// stream time — the signed /stream grant already authorized the request, so
// this just translates it into object-storage auth. Pure local signing, no
// network needed to create the URL.
export const isCloudBucketPublic = () =>
  String(process.env.AUDIO_S3_BUCKET_PUBLIC || 'true').trim().toLowerCase() !== 'false';

export async function createCloudDownloadUrl(objectKey, expiresInSeconds = 6 * 60 * 60) {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  const config = s3Config();
  const client = await getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { expiresIn: Math.max(60, Math.min(7 * 24 * 60 * 60, Number(expiresInSeconds) || 21600)) }
  );
}

export async function getCloudObject(objectKey) {
  const cleanKey = String(objectKey || '').trim();
  if (!cleanKey) throw new Error('Cloud audio object key is missing');
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const config = s3Config();
  const client = await getS3Client();
  return client.send(new GetObjectCommand({ Bucket: config.bucket, Key: cleanKey }));
}

export async function deleteCloudObject(objectKey) {
  const cleanKey = String(objectKey || '').trim();
  if (!cleanKey) return false;
  const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const config = s3Config();
  const client = await getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: cleanKey }));
  return true;
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

// Archive a just-uploaded replay recording: WAV master → MP3 canonical.
// `audio` is the saved Audio mongoose document, `localPath` the multer file.
// Server behaviour (automatic, no user choice):
//   - local mode:  transcode to MP3 next to the upload, repoint the Audio
//                  record at the MP3, delete the giant WAV.
//   - cloud mode:  same MP3 transcode, then PUT the MP3 to S3 and repoint.
// Returns 'cloud', 'local-mp3', 'local', or 'failed' (failed = kept original,
// original error logged). Never throws.
export async function archiveRecordingAudio({ audio, localPath }) {
  if (!audio || !localPath) return 'failed';

  // Already an MP3 (or S3-migrated doc): nothing to convert.
  const currentName = String(audio.filename || localPath || '').toLowerCase();
  const currentMime = String(audio.mimeType || '').toLowerCase();
  if (currentName.endsWith('.mp3') || currentMime.includes('mpeg') || currentMime.includes('mp3')) {
    return audio.storage === 'cloud' ? 'cloud' : 'local';
  }

  const workDir = path.dirname(localPath);
  const base = path.basename(localPath, path.extname(localPath)) || `${Date.now()}-${randomUUID()}`;
  const mp3Name = `${base}.mp3`;
  const transcodedPath = path.join(workDir, mp3Name);
  const key = mp3Name;
  const mimeType = 'audio/mpeg';

  const pointRecordAtMp3 = async (size) => {
    audio.filename = mp3Name;
    audio.fileSize = size;
    audio.mimeType = mimeType;
    await audio.save();
  };

  // Local server copy: always normalise replays to MP3 automatically.
  if (!isCloudArchiveEnabled()) {
    try {
      await transcodeToMp3(localPath, transcodedPath);
      const stat = await fs.promises.stat(transcodedPath).catch(() => null);
      if (!stat?.size) throw new Error('Transcode produced an empty file');
      // Move transcoded MP3 over the canonical path when names differ.
      await pointRecordAtMp3(stat.size);
      console.info(
        `[audio-archive] replay ${audio._id} normalised to MP3 (${(stat.size / 1048576).toFixed(1)} MB)`
      );
      if (!keepLocal()) {
        if (path.resolve(localPath) !== path.resolve(transcodedPath)) {
          await removeQuietly(localPath);
        }
      }
      return 'local-mp3';
    } catch (error) {
      console.warn('[audio-archive] MP3 normalise failed, keeping original file:', error?.message || error);
      await removeQuietly(transcodedPath);
      return 'failed';
    }
  }

  if (!s3Configured()) {
    console.warn(
      '[audio-archive] AUDIO_STORAGE_PROVIDER is set but S3 credentials/bucket are incomplete — keeping the recording on local disk.'
    );
    return 'local';
  }

  try {
    await transcodeToMp3(localPath, transcodedPath);
    const stat = await fs.promises.stat(transcodedPath).catch(() => null);
    if (!stat?.size) throw new Error('Transcode produced an empty file');

    const { url, objectKey } = await uploadToObjectStorage(transcodedPath, key, mimeType);

    audio.storage = 'cloud';
    audio.cloudUrl = url;
    audio.cloudKey = objectKey;
    audio.filename = mp3Name;
    audio.fileSize = stat.size;
    audio.mimeType = mimeType;
    await audio.save();

    console.info(
      `[audio-archive] replay ${audio._id} archived to cloud MP3 (${(stat.size / 1048576).toFixed(1)} MB): ${archiveDestinationLabel({ url, objectKey })}`
    );

    if (!keepLocal()) {
      await removeQuietly(localPath);
    }
    await removeQuietly(transcodedPath);
    return 'cloud';
  } catch (error) {
    console.warn('[audio-archive] archiving failed, keeping local file:', error?.message || error);
    await removeQuietly(transcodedPath);
    return 'failed';
  }
}

export default {
  isCloudArchiveEnabled,
  isCloudBucketPublic,
  transcodeToOpus,
  transcodeToMp3,
  uploadToObjectStorage,
  archiveDestinationLabel,
  createCloudDownloadUrl,
  getCloudObject,
  deleteCloudObject,
  archiveRecordingAudio,
};
