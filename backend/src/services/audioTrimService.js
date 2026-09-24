import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ffmpegPath = () => String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const ffprobePath = () => String(process.env.FFPROBE_PATH || 'ffprobe').trim() || 'ffprobe';
const MAX_TRIM_SECONDS = 24 * 60 * 60;
const CAPABILITY_CACHE_MS = 60_000;
let capabilityCache = { checkedAt: 0, ok: false, message: '' };

const trimError = (status, code, message) => Object.assign(new Error(message), { status, code });

const binaryAvailable = (command) => new Promise((resolve) => {
  const child = spawn(command, ['-version'], { stdio: 'ignore' });
  let settled = false;
  const finish = (ok) => {
    if (settled) return;
    settled = true;
    resolve(Boolean(ok));
  };
  child.on('error', () => finish(false));
  child.on('close', (code) => finish(code === 0));
});

export const checkFfmpegCapability = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && capabilityCache.checkedAt && now - capabilityCache.checkedAt < CAPABILITY_CACHE_MS) {
    return { ...capabilityCache };
  }

  const [ffmpegOk, ffprobeOk] = await Promise.all([
    binaryAvailable(ffmpegPath()),
    binaryAvailable(ffprobePath()),
  ]);
  const ok = ffmpegOk && ffprobeOk;
  capabilityCache = {
    checkedAt: now,
    ok,
    message: ok
      ? ''
      : 'FFmpeg and FFprobe are required on this Echoo server for automatic MP3 recordings and trimming.',
  };
  return { ...capabilityCache };
};

export const assertFfmpegAvailable = async () => {
  const capability = await checkFfmpegCapability();
  if (capability.ok) return capability;
  throw trimError(503, 'FFMPEG_REQUIRED', capability.message);
};

export const validateTrimRange = ({ startSeconds, endSeconds, sourceDuration = 0 }) => {
  const start = Number(startSeconds);
  const end = Number(endSeconds);
  const duration = Number(sourceDuration) || 0;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw trimError(400, 'INVALID_TRIM_RANGE', 'Trim start and end must be valid numbers.');
  }
  if (start < 0 || end <= start) {
    throw trimError(400, 'INVALID_TRIM_RANGE', 'Trim end must be later than trim start.');
  }
  if (end - start > MAX_TRIM_SECONDS) {
    throw trimError(400, 'TRIM_RANGE_TOO_LONG', 'A trim cannot exceed 24 hours.');
  }
  if (duration > 0 && end > duration + 0.25) {
    throw trimError(400, 'TRIM_OUT_OF_BOUNDS', 'Trim end is beyond the recording duration.');
  }
  return { start, end, duration: end - start };
};

const run = (command, args, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (error) reject(error);
    else resolve(stderr);
  };
  const timer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* already exited */ }
    finish(trimError(504, 'TRIM_TIMEOUT', 'Audio trim processing timed out.'));
  }, timeoutMs);
  timer.unref?.();
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8').slice(0, 4000); });
  child.on('error', (error) => finish(error));
  child.on('close', (code) => finish(
    code === 0 ? null : trimError(422, 'TRIM_PROCESSING_FAILED', `FFmpeg could not trim this recording: ${stderr.trim().slice(0, 500)}`)
  ));
});

const encodingArgs = (extension) => {
  switch (extension) {
    case '.wav': return ['-c:a', 'pcm_s24le', '-ar', '48000', '-ac', '2'];
    case '.mp3': return ['-c:a', 'copy'];
    case '.m4a':
    case '.aac': return ['-c:a', 'aac', '-b:a', '128k'];
    case '.flac': return ['-c:a', 'flac'];
    case '.webm': return ['-c:a', 'libopus', '-b:a', '96k'];
    default: return ['-c:a', 'libopus', '-b:a', '96k', '-f', 'ogg'];
  }
};

const probeDuration = async (filePath) => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(ffprobePath(), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || 'ffprobe failed')));
  });
  const duration = Number.parseFloat(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw trimError(422, 'TRIM_OUTPUT_INVALID', 'Trim processing produced invalid audio.');
  }
  return duration;
};

export const trimAudioFile = async ({ sourcePath, startSeconds, endSeconds, sourceDuration = 0, outputDirectory = '' }) => {
  await assertFfmpegAvailable();
  const range = validateTrimRange({ startSeconds, endSeconds, sourceDuration });
  const source = path.resolve(String(sourcePath || ''));
  const stat = await fs.promises.stat(source).catch(() => null);
  if (!stat?.isFile() || !stat.size) {
    throw trimError(404, 'AUDIO_FILE_MISSING', 'The recording file is missing from this server.');
  }
  const extension = path.extname(source).toLowerCase() || '.ogg';
  const outputFilename = `${path.basename(source, extension)}-trim-${randomUUID()}${extension}`;
  const targetDirectory = outputDirectory ? path.resolve(outputDirectory) : path.dirname(source);
  await fs.promises.mkdir(targetDirectory, { recursive: true });
  const outputPath = path.join(targetDirectory, outputFilename);

  try {
    await run(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', range.start.toFixed(6), '-i', source,
      '-t', range.duration.toFixed(6), '-vn',
      '-map_metadata', '0',
      ...encodingArgs(extension),
      outputPath,
    ], 20 * 60 * 1000);
    const [outputStat, duration] = await Promise.all([
      fs.promises.stat(outputPath),
      probeDuration(outputPath),
    ]);
    if (!outputStat.size) throw trimError(422, 'TRIM_OUTPUT_INVALID', 'Trim processing produced an empty file.');
    return { outputPath, outputFilename, fileSize: outputStat.size, duration, range };
  } catch (error) {
    await fs.promises.unlink(outputPath).catch(() => {});
    if (error?.code && error?.status) throw error;
    throw trimError(422, 'TRIM_PROCESSING_FAILED', error?.message || 'Audio trim processing failed.');
  }
};

export default {
  trimAudioFile,
  validateTrimRange,
  checkFfmpegCapability,
  assertFfmpegAvailable,
};
