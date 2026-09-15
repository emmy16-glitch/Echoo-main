import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Recording archive: compress + cloud-store finished live recordings.
//
// Why this exists: the browser captures a 24-bit/48kHz stereo WAV master
// (~17 MB per minute, ~1 GB per hour). Those giants die mid-upload, fill the
// local disk, and vanish on redeploys — the "my recording disappeared"
// problem. This service runs right after a replay upload lands:
//
//   1. Transcode the WAV to Opus (~48 kbps stereo ≈ 22 MB/hour,
//      ~30x smaller) with the machine FFmpeg.
//   2. PUT the Opus file to S3-compatible object storage (Cloudflare R2 free
//      tier: 10 GB + zero egress — see backend/.env.example AUDIO_*).
//   3. Point the Audio record at the cloud URL and delete the local WAV.
//
// Everything is best-effort and NEVER throws: any failure (no FFmpeg, no
// cloud config, upload error) logs a warning and keeps the local file, so
// archiving can never break the upload it follows.
// ---------------------------------------------------------------------------

const provider = () => String(process.env.AUDIO_STORAGE_PROVIDER || 'local').trim().toLowerCase();
export const isCloudArchiveEnabled = () => provider() !== 'local' && provider() !== '' && provider() !== 'off';

const ffmpegPath = () => String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const opusBitrate = () => String(process.env.AUDIO_OPUS_BITRATE || '48k').trim() || '48k';
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
  return Boolean(config.endpoint && config.bucket && config.accessKeyId && config.secretAccessKey && config.publicBase);
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
// can drop to 32k via AUDIO_OPUS_BITRATE (≈15 MB/hour).
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
  const body = await fs.promises.readFile(localPath);
  const objectKey = config.prefix ? `${config.prefix}/${key}` : key;
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: mimeType,
    })
  );
  return { url: `${config.publicBase}/${objectKey}`, objectKey };
}

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

// Archive a just-uploaded replay recording: transcode → cloud → repoint.
// `audio` is the saved Audio mongoose document, `localPath` the multer file.
// Returns 'cloud', 'local', or 'failed' (failed = kept local, original error
// logged). Never throws.
export async function archiveRecordingAudio({ audio, localPath }) {
  if (!audio || !localPath) return 'failed';

  if (!isCloudArchiveEnabled()) return 'local';
  if (!s3Configured()) {
    console.warn(
      '[audio-archive] AUDIO_STORAGE_PROVIDER is set but S3 credentials/bucket are incomplete — keeping the recording on local disk.'
    );
    return 'local';
  }

  const workDir = path.dirname(localPath);
  const base = `${Date.now()}-${randomUUID()}`;
  const transcodedPath = path.join(workDir, `${base}.opus`);
  const key = `${base}.opus`;
  const mimeType = 'audio/ogg; codecs=opus';

  try {
    await transcodeToOpus(localPath, transcodedPath);
    const stat = await fs.promises.stat(transcodedPath).catch(() => null);
    if (!stat?.size) throw new Error('Transcode produced an empty file');

    const { url, objectKey } = await uploadToObjectStorage(transcodedPath, key, mimeType);

    audio.storage = 'cloud';
    audio.cloudUrl = url;
    audio.cloudKey = objectKey;
    audio.filename = `${base}.opus`;
    audio.fileSize = stat.size;
    audio.mimeType = mimeType;
    await audio.save();

    console.info(
      `[audio-archive] replay ${audio._id} archived to cloud (${(stat.size / 1048576).toFixed(1)} MB): ${url.slice(0, 80)}...`
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
  uploadToObjectStorage,
  createCloudDownloadUrl,
  archiveRecordingAudio,
};
