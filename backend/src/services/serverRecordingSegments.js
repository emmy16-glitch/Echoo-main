import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// A separate, best-effort recording path. The primary LiveKit PCM -> replay
// encoder and the published audio are never awaited by this recorder.
const SEGMENT_SECONDS = 10 * 60;
const MAX_PENDING_SEGMENT_BYTES = 4 * 1024 * 1024;
const SEGMENT_DRAIN_TIMEOUT_MS = 20_000;
const enabled = () => /^(true|1|yes)$/i.test(String(process.env.SERVER_RECORDING_SEGMENTS_ENABLED || '').trim());
const safeId = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
const baseDir = () => path.resolve(
  process.env.REPLAY_ARCHIVE_DIR || path.join(process.cwd(), 'uploads', 'replay'),
  'segments'
);
const SEGMENT_RE = /^part-(\d{6})\.mp3$/;
const bounded = (promise, timeoutMs) => Promise.race([
  promise,
  new Promise((resolve) => { const timer = setTimeout(() => resolve(false), timeoutMs); timer.unref?.(); }),
]);

const writeBuffer = (stream, buffer) => new Promise((resolve, reject) => {
  if (!stream || stream.destroyed || stream.writableEnded) return reject(new Error('Recording segment encoder is closed.'));
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    stream.removeListener('error', onError);
    if (error) reject(error); else resolve();
  };
  const onError = (error) => finish(error);
  stream.once('error', onError);
  stream.write(buffer, (error) => finish(error));
});

const durableSealedParts = async (dir, recordingActive, cache = new Map()) => {
  const names = (await fs.readdir(dir).catch(() => []))
    .filter((name) => SEGMENT_RE.test(name))
    .sort();
  // FFmpeg is still writing the highest-index part. Never mark it as sealed
  // or count it as a recoverable segment until FFmpeg has closed that file.
  const closedNames = recordingActive ? names.slice(0, -1) : names;
  const parts = [];
  for (const name of closedNames) {
    const filename = path.join(dir, name);
    if (cache.has(name)) { parts.push({ name, bytes: cache.get(name) }); continue; }
    const info = await fs.stat(filename).catch(() => null);
    if (!info?.isFile() || info.size < 4096) continue;
    // A sealed MP3 is only reported protected after its bytes are synced.
    // This includes the final segment after a normal clean FFmpeg shutdown.
    const fd = await fs.open(filename, 'r');
    try { await fd.sync(); } finally { await fd.close(); }
    cache.set(name, info.size);
    parts.push({ name, bytes: info.size });
  }
  return parts;
};

// Reconcile MongoDB progress against the actual private files. This is
// critical after ephemeral container restarts: old database counts alone
// are never proof that the MP3 parts still exist.
export const inspectServerRecordingSegments = async ({
  broadcastId, attemptId, completedSegments = 0,
} = {}) => {
  const expected = Math.max(0, Math.floor(Number(completedSegments) || 0));
  if (expected === 0) return { verified: true, completedSegments: 0, segmentBytes: 0 };
  const id = safeId(broadcastId);
  const attempt = String(attemptId || '');
  if (!id || !/^\\d{13}-[a-f0-9]{8}$/.test(attempt)) {
    return { verified: false, completedSegments: 0, segmentBytes: 0 };
  }
  const directory = path.join(baseDir(), id, attempt);
  let checked = 0;
  let bytes = 0;
  for (let index = 0; index < expected; index += 1) {
    const filename = path.join(directory, `part-${String(index).padStart(6, '0')}.mp3`);
    const stat = await fs.stat(filename).catch(() => null);
    if (!stat?.isFile() || stat.size < 4096) break;
    bytes += stat.size;
    checked += 1;
  }
  return { verified: checked === expected, completedSegments: checked, segmentBytes: bytes };
};

export const serverRecordingSegmentsEnabled = enabled;

export async function startServerRecordingSegments({
  broadcastId,
  bitrate = '192k',
  onProgress = async () => {},
  segmentSeconds = SEGMENT_SECONDS,
} = {}) {
  if (!enabled()) return null;
  const id = safeId(broadcastId);
  if (!id) throw new Error('Invalid broadcast ID for server segments.');

  // A unique attempt directory prevents restart/handoff overwrites. Operators
  // can recover previous attempts without one encoder clobbering another.
  const sessionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(baseDir(), id, sessionId);
  await fs.mkdir(dir, { recursive: true });
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    '-i', 'pipe:0', '-vn', '-c:a', 'libmp3lame',
    '-threads', '1', '-b:a', bitrate,
    '-f', 'segment', '-segment_time', String(segmentSeconds),
    '-segment_format', 'mp3', '-reset_timestamps', '1',
    path.join(dir, 'part-%06d.mp3'),
  ];
  const child = spawn(String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg', args, {
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let pending = 0;
  let chain = Promise.resolve();
  let closing = false;
  let stopped = false;
  let failed = false;
  let errorText = '';
  let lastCount = -1;
  let lastBytes = -1;
  let progressChain = Promise.resolve();
  const confirmed = new Map();
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const state = () => ({ stopped, failed, error: errorText });

  const fail = (error) => {
    if (failed) return;
    failed = true;
    errorText = String(error?.message || error).slice(0, 500);
    try { child.stdin?.destroy(); } catch { /* ignore */ }
    if (!stopped) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
  };
  child.on('error', fail);
  child.on('close', (code) => {
    stopped = true;
    if (code !== 0) fail(new Error(`Segment encoder stopped with code ${code}`));
    if (failed) {
      clearInterval(interval);
      // Persist the degraded checkpoint once, not every 15s for a multi-hour
      // live session whose optional recorder has already crashed.
      void refresh(true).catch((error) => {
        console.warn('[Echoo Recording Segments] failed state update:', error?.message || error);
      });
    }
    resolveClosed();
  });
  child.stderr?.on('data', (data) => { errorText = String(data).slice(-500); });

  const refresh = async (final = false) => {
    // After an unclean exit the newest part can be truncated. Do not report
    // it as a fully protected segment, even if the file exists on disk.
    const keepNewestOpen = failed || !(final || stopped);
    const parts = await durableSealedParts(dir, keepNewestOpen, confirmed);
    const bytes = parts.reduce((sum, part) => sum + part.bytes, 0);
    if (parts.length !== lastCount || bytes !== lastBytes || final || failed) {
      lastCount = parts.length;
      lastBytes = bytes;
      const snapshot = {
        status: failed ? 'degraded' : final ? 'completed' : 'recording',
        completedSegments: parts.length,
        segmentBytes: bytes,
        segmentSeconds,
        attemptId: sessionId,
        updatedAt: new Date(),
        error: failed ? errorText : null,
      };
      // Serialise metadata writes so an older 15-second poll cannot overwrite
      // the final completed/degraded state after End Broadcast.
      progressChain = progressChain.catch(() => undefined).then(() => onProgress(snapshot));
      await progressChain;
    }
    return { count: parts.length, bytes, files: parts.map((item) => path.join(dir, item.name)) };
  };
  const interval = setInterval(() => { void refresh().catch((e) => {
    console.warn('[Echoo Recording Segments] progress warning:', e?.message || e);
  }); }, 15_000);
  interval.unref?.();

  const enqueue = (pcm) => {
    if (failed || closing || stopped || !pcm?.length) return;
    if (pending + pcm.length > MAX_PENDING_SEGMENT_BYTES) {
      fail(new Error('Segment encoder fell behind; the primary replay and live audio are unaffected.'));
      return;
    }
    pending += pcm.length;
    chain = chain.then(() => writeBuffer(child.stdin, pcm))
      .catch(fail)
      .finally(() => { pending = Math.max(0, pending - pcm.length); });
  };

  const finish = async () => {
    if (closing) return closed;
    closing = true;
    clearInterval(interval);
    const drained = await bounded(chain.then(() => true).catch(() => false), SEGMENT_DRAIN_TIMEOUT_MS);
    if (!drained) {
      failed = true;
      errorText ||= 'Segment encoder backlog did not drain.';
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    } else if (!child.stdin?.destroyed && !child.stdin?.writableEnded) {
      try { child.stdin.end(); } catch { /* ignore */ }
    }
    const ended = await bounded(closed.then(() => true), SEGMENT_DRAIN_TIMEOUT_MS);
    if (!ended) {
      failed = true;
      errorText ||= 'Segment encoder did not close.';
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
    return refresh(true);
  };
  return { enqueue, refresh, finish, state, dir, segmentSeconds };
}

export default { serverRecordingSegmentsEnabled, startServerRecordingSegments };
