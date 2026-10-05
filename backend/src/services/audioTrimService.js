import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const ffmpegPath = () => String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';
const ffprobePath = () => String(process.env.FFPROBE_PATH || 'ffprobe').trim() || 'ffprobe';
const MAX_TRIM_SECONDS = 24 * 60 * 60;
const CAPABILITY_CACHE_MS = 60_000;
export const WAVEFORM_VERSION = 1;
export const DEFAULT_WAVEFORM_POINTS = 240;
const MIN_WAVEFORM_POINTS = 64;
const MAX_WAVEFORM_POINTS = 800;
const MIN_WAVEFORM_SAMPLE_RATE = 20;
const MAX_WAVEFORM_SAMPLE_RATE = 2000;
let capabilityCache = { checkedAt: 0, ok: false, ffmpeg: false, ffprobe: false, message: '' };

const trimError = (status, code, message) => Object.assign(new Error(message), { status, code });

const binaryAvailable = (command) => new Promise((resolve) => {
  const child = spawn(command, ['-version'], { stdio: 'ignore' });
  let settled = false;
  let timer = null;
  const finish = (ok) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    resolve(Boolean(ok));
  };
  timer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* already exited */ }
    finish(false);
  }, 5000);
  timer.unref?.();
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
    ffmpeg: ffmpegOk,
    ffprobe: ffprobeOk,
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
    // Re-encode trimmed MP3 copies at a high bitrate instead of stream-copying.
    // MP3 stream copy can only cut on compressed frame boundaries, which makes
    // creator-selected start/end points feel imprecise. The original remains
    // untouched; only the new trimmed draft is encoded.
    case '.mp3': return ['-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '48000', '-ac', '2'];
    case '.m4a':
    case '.aac': return ['-c:a', 'aac', '-b:a', '128k'];
    case '.flac': return ['-c:a', 'flac'];
    case '.webm': return ['-c:a', 'libopus', '-b:a', '96k'];
    default: return ['-c:a', 'libopus', '-b:a', '96k', '-f', 'ogg'];
  }
};

export const probeAudioDuration = async (filePath) => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(ffprobePath(), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      finish(reject, trimError(504, 'TRIM_PROBE_TIMEOUT', 'Audio verification timed out.'));
    }, 30_000);
    timer.unref?.();
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (error) => finish(reject, error));
    child.on('close', (code) => code === 0
      ? finish(resolve, stdout)
      : finish(reject, new Error(stderr || 'ffprobe failed')));
  });
  const duration = Number.parseFloat(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw trimError(422, 'TRIM_OUTPUT_INVALID', 'Trim processing produced invalid audio.');
  }
  return duration;
};


export const generateAudioWaveform = async ({
  sourcePath,
  sourceDuration = 0,
  points = DEFAULT_WAVEFORM_POINTS,
} = {}) => {
  await assertFfmpegAvailable();

  const source = path.resolve(String(sourcePath || ''));
  const stat = await fs.promises.stat(source).catch(() => null);
  if (!stat?.isFile() || !stat.size) {
    throw trimError(404, 'AUDIO_FILE_MISSING', 'The recording file is missing from this server.');
  }

  const bucketCount = Math.max(
    MIN_WAVEFORM_POINTS,
    Math.min(MAX_WAVEFORM_POINTS, Math.floor(Number(points) || DEFAULT_WAVEFORM_POINTS))
  );
  const duration = Number(sourceDuration) > 0
    ? Number(sourceDuration)
    : await probeAudioDuration(source);

  // Keep waveform extraction memory-bounded regardless of source size. FFmpeg
  // decodes the recording incrementally and emits a very low-rate mono PCM
  // stream; Node aggregates those samples directly into the requested buckets.
  // Even a 24-hour recording stays a few MB on stdout instead of expanding to
  // multi-GB browser PCM.
  const sampleRate = Math.max(
    MIN_WAVEFORM_SAMPLE_RATE,
    Math.min(
      MAX_WAVEFORM_SAMPLE_RATE,
      Math.ceil((bucketCount * 32) / Math.max(1, duration))
    )
  );
  const expectedSamples = Math.max(bucketCount, Math.ceil(duration * sampleRate));
  const peaks = new Array(bucketCount).fill(0);
  const configuredTimeout = Number(process.env.WAVEFORM_PROCESS_TIMEOUT_MS) || 0;
  const timeoutMs = Math.max(
    60_000,
    Math.min(10 * 60 * 1000, configuredTimeout > 0 ? configuredTimeout : 5 * 60 * 1000)
  );

  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-i', source,
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    let carry = Buffer.alloc(0);
    let sampleIndex = 0;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (sampleIndex <= 0) {
        reject(trimError(422, 'WAVEFORM_EMPTY', 'Echoo could not read waveform data from this recording.'));
      } else {
        resolve();
      }
    };

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already exited */ }
      finish(trimError(504, 'WAVEFORM_TIMEOUT', 'Waveform preparation timed out.'));
    }, timeoutMs);
    timer.unref?.();

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8').slice(0, 4000);
    });

    child.stdout?.on('data', (chunk) => {
      const data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const usable = data.length - (data.length % 2);
      for (let offset = 0; offset < usable; offset += 2) {
        const sample = Math.abs(data.readInt16LE(offset)) / 32768;
        const bucket = Math.min(
          bucketCount - 1,
          Math.floor((sampleIndex / expectedSamples) * bucketCount)
        );
        if (sample > peaks[bucket]) peaks[bucket] = sample;
        sampleIndex += 1;
      }
      carry = usable < data.length ? data.subarray(usable) : Buffer.alloc(0);
    });

    child.on('error', (error) => finish(error));
    child.on('close', (code) => {
      if (code === 0) return finish();
      return finish(
        trimError(
          422,
          'WAVEFORM_PROCESSING_FAILED',
          `FFmpeg could not prepare this waveform: ${stderr.trim().slice(0, 500)}`
        )
      );
    });
  });

  return {
    version: WAVEFORM_VERSION,
    duration,
    points: peaks.map((value) => Number(Math.max(0, Math.min(1, value)).toFixed(4))),
    sampleRate,
  };
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
      probeAudioDuration(outputPath),
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
  generateAudioWaveform,
  probeAudioDuration,
  validateTrimRange,
  checkFfmpegCapability,
  assertFfmpegAvailable,
};
