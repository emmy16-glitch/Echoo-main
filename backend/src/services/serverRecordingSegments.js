import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// One FFmpeg / one MP3 encoder: FFmpeg tee writes the continuous replay and
// a ten-minute segment muxer from identical compressed packets. The optional
// segment sink uses its own FIFO; onfail=ignore leaves the primary MP3 alone.
const SEGMENT_SECONDS = 600;
const PART_RE = /^part-(\d{6})\.mp3$/;
const safeId = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
const baseDir = () => path.resolve(
  process.env.REPLAY_ARCHIVE_DIR || path.join(process.cwd(), 'uploads', 'replay'),
  'segments',
);
const flag = () => String(process.env.SERVER_RECORDING_SEGMENTS_ENABLED || '').toLowerCase().trim();
export const serverRecordingSegmentsEnabled = () => /^(true|1|yes)$/.test(flag());

const sealedParts = async (directory, leaveLastOpen = true, cache = new Map()) => {
  const names = (await fs.readdir(directory).catch(() => []))
    .filter((name) => PART_RE.test(name)).sort();
  const closed = leaveLastOpen ? names.slice(0, -1) : names;
  const parts = [];
  // Check the actual filesystem on EVERY refresh. Cached metadata can refer
  // to NFS parts lost or truncated after the initial successful checkpoint.
  for (const [index, name] of closed.entries()) {
    if (name !== `part-${String(index).padStart(6, '0')}.mp3`) break;
    const handle = path.join(directory, name);
    const stat = await fs.lstat(handle).catch(() => null);
    if (!stat?.isFile() || stat.size < 4096) break;
    if (cache.get(name) !== undefined && cache.get(name) !== stat.size) {
      // An already-sealed part was modified. Do not report it as protected.
      break;
    }
    // Only declare completed MP3 parts protected after flushing their bytes.
    const fd = await fs.open(handle, 'r');
    try { await fd.sync(); } finally { await fd.close(); }
    cache.set(name, stat.size);
    parts.push({ name, bytes: stat.size });
  }
  return parts;
};

export const inspectServerRecordingSegments = async ({
  broadcastId, attemptId, completedSegments = 0,
} = {}) => {
  const expected = Math.max(0, Math.floor(Number(completedSegments) || 0));
  if (expected === 0) return { verified: true, completedSegments: 0, segmentBytes: 0 };
  const id = safeId(broadcastId);
  const attempt = String(attemptId || '');
  if (!id || !/^\d{13}-[a-f0-9]{8}$/.test(attempt)) {
    return { verified: false, completedSegments: 0, segmentBytes: 0 };
  }
  const directory = path.join(baseDir(), id, attempt);
  let count = 0;
  let bytes = 0;
  for (let index = 0; index < expected; index += 1) {
    const stat = await fs.lstat(
      path.join(directory, `part-${String(index).padStart(6, '0')}.mp3`)
    ).catch(() => null);
    if (!stat?.isFile() || stat.size < 4096) break;
    bytes += stat.size;
    count += 1;
  }
  return { verified: count === expected, completedSegments: count, segmentBytes: bytes };
};

// The only filesystem preparation happens before the primary encoder spawns.
// If segment preparation fails the ordinary MP3 recorder starts unchanged.
export async function prepareServerRecordingSegments({
  broadcastId, primaryOutputPath, segmentSeconds = SEGMENT_SECONDS,
} = {}) {
  if (!serverRecordingSegmentsEnabled()) return null;
  const id = safeId(broadcastId);
  if (!id || !primaryOutputPath) throw new Error('Missing primary replay/recording ID.');
  const sessionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(baseDir(), id, sessionId);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'part-%06d.mp3');
  const seconds = Number(segmentSeconds);
  if (!Number.isInteger(seconds) || seconds < 1) throw new Error('Invalid recording segment duration.');
  // No arbitrary remote URLs or user-controlled paths in these tee sinks.
  const safePath = (value) => {
    if (['|', '[', ']', '\\n', '\\r'].some((character) => value.includes(character))) {
      throw new Error('Unsafe recording path for FFmpeg tee.');
    }
    return value;
  };
  const teeOutput =
    `[f=mp3:onfail=abort]${safePath(primaryOutputPath)}|` +
    `[f=segment:onfail=ignore:use_fifo=1:segment_time=${seconds}:segment_format=mp3:reset_timestamps=1]${safePath(target)}`;
  return { attemptId: sessionId, dir, segmentSeconds: seconds, teeOutput };
}

// Poll only the completed parts; the last file is still being written.
// Progress always represents server files, never an optimistic browser count.
export function watchServerRecordingSegments(config, {
  onProgress = async () => {}, isRecorderFailed = () => false,
  closed = Promise.resolve(), intervalMs = 15_000, now = Date.now,
} = {}) {
  if (!config) return null;
  const cache = new Map();
  let count = -1, bytes = -1, status = null, error = null, ending = false;
  const recordingStartedAt = now();
  let chain = Promise.resolve(), terminal = null;
  const refresh = async ({ final = false } = {}) => {
    // If FFmpeg exited with an error, its last file can be truncated.
    const failed = Boolean(isRecorderFailed());
    const files = await sealedParts(config.dir, !final || failed, cache);
    // The optional tee sink uses onfail=ignore. It can fail while the main
    // encoder succeeds, so never report a healthy backup merely because
    // FFmpeg exited cleanly. Allow one short grace window for segment closure.
    const elapsedSeconds = Math.max(0, (now() - recordingStartedAt) / 1000);
    const expectedMinimum = Math.max(0, Math.floor(
      (elapsedSeconds - Math.max(30, config.segmentSeconds * 0.05)) / config.segmentSeconds
    ));
    const backupMissing = files.length < expectedMinimum || (final && files.length === 0);
    const expectedPartNames = (await fs.readdir(config.dir).catch(() => []))
      .filter(name => PART_RE.test(name));
    const corruptOrMissing = files.length < Math.max(0, expectedPartNames.length - ((!final || failed) ? 1 : 0));
    const degraded = failed || backupMissing || corruptOrMissing;
    const nextBytes = files.reduce((a, f) => a + f.bytes, 0);
    // A failed tee backup may stop creating files while its count and bytes
    // remain unchanged. Persist the health transition immediately.
    const nextStatus = degraded ? 'degraded' : final ? 'completed' : 'recording';
    const nextError = failed
      ? 'Segment recording was interrupted; only sealed parts are recoverable.'
      : backupMissing || corruptOrMissing
        ? 'Server backup segments are missing, altered or incomplete; check persistent storage.'
        : null;
    if (count !== files.length || bytes !== nextBytes || status !== nextStatus ||
        error !== nextError || final) {
      count = files.length; bytes = nextBytes;
      status = nextStatus; error = nextError;
      const update = {
        status,
        completedSegments: count,
        segmentBytes: bytes,
        segmentSeconds: config.segmentSeconds,
        attemptId: config.attemptId,
        updatedAt: new Date(),
        error,
      };
      chain = chain.catch(() => null).then(() => onProgress(update));
      await chain;
    }
    return { count, bytes, files: files.map(f => path.join(config.dir, f.name)) };
  };
  const timer = setInterval(() => { void refresh().catch(error => {
    console.warn('[Echoo Recording Segments] progress warning:', error?.message || error);
  }); }, intervalMs);
  timer.unref?.();
  const finish = () => {
    if (terminal) return terminal;
    ending = true;
    clearInterval(timer);
    terminal = (async () => {
      // The same FFmpeg process must finish writing its last part before it
      // can be marked complete. Do not hold the live-control path on this.
      await closed;
      return refresh({ final: true });
    })();
    return terminal;
  };
  return { refresh, finish, get closing() { return ending; } };
}

// Legacy compatibility: the old secondary FFmpeg process is intentionally
// removed. There must never be a second MP3 encoder in this workflow.
export default {
  serverRecordingSegmentsEnabled,
  prepareServerRecordingSegments,
  watchServerRecordingSegments,
  inspectServerRecordingSegments,
};


// Never expose an in-progress final part. A newer part's existence proves
// the earlier part was closed, even if the backend crashed before updating
// MongoDB's last checkpoint. This lets creators retrieve hours of sealed audio.
export const listSealedServerRecordingSegments = async ({
  broadcastId, attemptId, segmentStatus,
} = {}) => {
  const id = String(broadcastId || '');
  const attempt = String(attemptId || '');
  if (!/^[a-f0-9]{24}$/i.test(id) || !/^\d{13}-[a-f0-9]{8}$/.test(attempt)) return [];
  const dir = path.join(baseDir(), id, attempt);
  const dirStat = await fs.lstat(dir).catch(() => null);
  if (!dirStat?.isDirectory()) return [];
  const names = (await fs.readdir(dir)).filter(name => PART_RE.test(name)).sort();
  const available = segmentStatus === 'completed' ? names.length : Math.max(0, names.length - 1);
  const parts = [];
  for (let index = 0; index < available && index < 2048; index += 1) {
    const name = 'part-' + String(index).padStart(6, '0') + '.mp3';
    if (names[index] !== name) break;
    const filePath = path.join(dir, name);
    const stat = await fs.lstat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size < 4096) break;
    let file;
    try {
      file = await fs.open(filePath, 'r');
      const header = Buffer.alloc(4);
      await file.read(header, 0, 4, 0);
      const valid = header.toString('ascii', 0, 3) === 'ID3' ||
        (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
      if (!valid) break;
    } catch { break; }
    finally { await file?.close().catch(() => null); }
    parts.push({ index, bytes: stat.size });
  }
  return parts;
};
