import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// Offline, bounded finalization only. Never called by the LiveKit/WebRTC
// publisher or an active PCM ingest callback.
const FILE_PATTERN = /^part-(\d{6})\.mp3$/;
const ATTEMPT_PATTERN = /^\d{13}-[a-f0-9]{8}$/;
const ID_PATTERN = /^[a-f0-9]{24}$/i;
const MAX_PARTS = 2048;

const archiveDir = () => path.resolve(
  process.env.REPLAY_ARCHIVE_DIR || path.join(process.cwd(), 'uploads', 'replay'),
  'segments',
);

const run = (command, args, timeoutMs = 60_000) => new Promise((resolve, reject) => {
  let settled = false;
  let stdout = '';
  let stderr = '';
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const settle = (callback, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    callback(value);
  };
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    settle(reject, new Error('Recording reconstruction process timed out.'));
  }, timeoutMs);
  timer.unref?.();
  child.stdout?.on('data', (buffer) => { stdout = (stdout + String(buffer)).slice(-65536); });
  child.stderr?.on('data', (buffer) => { stderr = (stderr + String(buffer)).slice(-4096); });
  child.on('error', (error) => settle(reject, error));
  child.on('close', (code) => {
    if (code === 0) settle(resolve, { stdout, stderr });
    else settle(reject, new Error('Recording reconstruction tool failed: ' + stderr.slice(-300)));
  });
});

const probeMp3 = async (filePath) => {
  const result = await run(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,codec_type:format=duration',
    '-of', 'json', filePath,
  ], 30_000);
  const decoded = JSON.parse(result.stdout);
  const duration = Number(decoded.format?.duration);
  const codec = decoded.streams?.[0]?.codec_name;
  if (codec !== 'mp3' || !Number.isFinite(duration) || duration <= 0) {
    throw new Error('Invalid or unreadable MP3 recording segment.');
  }
  return duration;
};

const incomplete = (reason, extras = {}) => ({ status: 'incomplete', reason, ...extras });

// A crash leaves the final segment possibly open. Only a cleanly finalized
// segment muxer may treat that last segment as sealed. Earlier segments are
// sealed because FFmpeg opened their successor. Every part is independently
// probed and a duration/coverage check must pass before publishing.
export async function reconstructServerRecordingFromSegments({
  broadcastId, attemptId, segmentStatus, completedSegments = 0,
  segmentSeconds = 600, expectedDurationSeconds, outputPath,
} = {}) {
  if (!ID_PATTERN.test(String(broadcastId || '')) ||
      !ATTEMPT_PATTERN.test(String(attemptId || '')) ||
      !outputPath || !Number.isFinite(expectedDurationSeconds) ||
      expectedDurationSeconds <= 0) {
    return incomplete('reconstruction-metadata-unavailable');
  }
  const directory = path.join(archiveDir(), String(broadcastId), String(attemptId));
  const entries = await fs.readdir(directory).catch(error => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const names = entries.filter(name => FILE_PATTERN.test(name)).sort();
  if (!names.length) return incomplete('segments-missing');
  if (names.length > MAX_PARTS) return incomplete('too-many-parts');
  // No missing, reordered or duplicate part indices are ever silently merged.
  for (let i = 0; i < names.length; i += 1) {
    if (names[i] !== 'part-' + String(i).padStart(6, '0') + '.mp3') {
      return incomplete('segment-index-gap');
    }
  }
  const muxerClosedCleanly = segmentStatus === 'completed';
  const recordedCount = Math.max(0, Math.floor(Number(completedSegments) || 0));
  if (muxerClosedCleanly && recordedCount > names.length) return incomplete('segments-missing');
  // After an abrupt stop the last part may have been open when the process
  // died. Do not publish it even if it happens to have an MP3 header.
  const usableCount = muxerClosedCleanly ? names.length : Math.max(0, names.length - 1);
  if (usableCount === 0) return incomplete('no-verified-sealed-segments');
  const secondsPerPart = Number(segmentSeconds);
  if (!Number.isFinite(secondsPerPart) || secondsPerPart < 1) return incomplete('invalid-segment-window');

  const parts = [];
  let totalDuration = 0;
  for (let i = 0; i < usableCount; i += 1) {
    const filePath = path.join(directory, names[i]);
    const stat = await fs.lstat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size < 4096) return incomplete('segment-invalid');
    let duration;
    try {
      duration = await probeMp3(filePath);
    } catch {
      return incomplete('segment-invalid');
    }
    if (i < usableCount - 1 && duration + Math.max(3, secondsPerPart * 0.02) < secondsPerPart) {
      return incomplete('short-intermediate-segment');
    }
    totalDuration += duration;
    parts.push(filePath);
  }

  // Compare measured audio against the PCM/timeline coverage supplied by the
  // caller. A missing minute is NOT a successful "recovery".
  const tolerance = Math.max(2, Math.min(8, expectedDurationSeconds * 0.001));
  if (totalDuration + tolerance < expectedDurationSeconds) {
    return incomplete('recording-coverage-gap', {
      availableSeconds: totalDuration, expectedSeconds: expectedDurationSeconds,
    });
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const token = randomUUID();
  const listPath = path.join(path.dirname(outputPath), '.echoo-' + token + '.concat.txt');
  const tempPath = path.join(path.dirname(outputPath), '.echoo-' + token + '.mp3');
  const safeLines = parts.map(part => "file '" + part.replace(/'/g, "'\\''") + "'").join('\n');
  try {
    await fs.writeFile(listPath, safeLines + '\n', { flag: 'wx', mode: 0o600 });
    await run(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-map', '0:a:0', '-c:a', 'copy', '-f', 'mp3', tempPath,
    ], 15 * 60_000);
    const joinedDuration = await probeMp3(tempPath);
    if (joinedDuration + tolerance < expectedDurationSeconds) {
      return incomplete('joined-replay-too-short', { availableSeconds: joinedDuration });
    }
    const handle = await fs.open(tempPath, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    await fs.rename(tempPath, outputPath);
    return { status: 'ready', path: outputPath, duration: joinedDuration, partCount: parts.length };
  } finally {
    await fs.rm(listPath, { force: true }).catch(() => null);
    await fs.rm(tempPath, { force: true }).catch(() => null);
  }
}
