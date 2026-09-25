import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';
import Station from '../models/Station.js';
import BroadcastAudioChunk from '../models/BroadcastAudioChunk.js';
import {
  getReplayOutputFile,
  pcmFromWavChunk,
} from './broadcastOutputService.js';
import {
  isCloudArchiveEnabled,
  isCloudBucketPublic,
  uploadToObjectStorage,
} from './audioArchiveService.js';
import { isTranscriptionConfigured } from './transcriptionGateway.js';
import { assertFfmpegAvailable } from './audioTrimService.js';

// ---------------------------------------------------------------------------
// Canonical server replay finalization.
//
// End Broadcast finalizes the bounded recording chunks already received
// during the live session into a real server-side MP3. A finished broadcast
// NEVER requires one giant client WAV upload.
//
// Sources, in order:
//  1. The always-on replay MP3 encoder output (uploads/replay/<id>.mp3).
//  2. Fallback: one-shot FFmpeg assembly from the durable chunk WAV files
//     (covers encoder outages and server restarts mid-broadcast).
//
// Idempotency: Audio.fileKey is `replay-<broadcastId>` (unique). Repeat
// finalize calls, browser retries and page refreshes all resolve to the same
// Audio record. An in-memory lock serializes concurrent finalizations.
// ---------------------------------------------------------------------------

const AUDIO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'audio');
const locks = new Map();

const replayFileKey = (broadcastId) => `replay-${String(broadcastId)}`;

const safeTitle = (value, fallback = 'Live broadcast recording') => String(value || fallback)
  .trim()
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || fallback;

const cleanHumanSegment = (value = '', fallback = '') =>
  String(value || fallback)
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 64)
    .trim();

const recordingDateStamp = (value = Date.now()) => {
  const date = new Date(value || Date.now());
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (part) => String(part).padStart(2, '0');
  return `${safe.getFullYear()}-${pad(safe.getMonth() + 1)}-${pad(safe.getDate())} ${pad(safe.getHours())}-${pad(safe.getMinutes())}`;
};

const buildHumanRecordingName = ({ title, channelName, startedAt } = {}) => {
  const parts = ['Echoo'];
  const channel = cleanHumanSegment(channelName);
  const recordingTitle = cleanHumanSegment(title, 'Live broadcast');
  if (channel && channel.toLowerCase() !== recordingTitle.toLowerCase()) parts.push(channel);
  parts.push(recordingTitle, recordingDateStamp(startedAt));
  return `${parts.join(' - ')}.mp3`;
};

const applyEchooMp3Metadata = async ({ filePath, title, artist, startedAt } = {}) => {
  const taggedPath = `${filePath}.tagged.mp3`;
  try {
    const year = String(new Date(startedAt || Date.now()).getFullYear());
    const result = spawnSync(
      ffmpegPath(),
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', filePath,
        '-map', '0:a:0',
        '-c', 'copy',
        '-metadata', `title=${cleanHumanSegment(title, 'Live broadcast')}`,
        '-metadata', `artist=${cleanHumanSegment(artist, 'Echoo Creator')}`,
        '-metadata', 'album=Echoo Recordings',
        '-metadata', `date=${year}`,
        '-metadata', 'comment=Recorded with Echoo',
        taggedPath,
      ],
      { encoding: 'utf8', timeout: 60_000 }
    );
    if (result.status !== 0) return false;
    await fs.rename(taggedPath, filePath);
    return true;
  } catch {
    await fs.rm(taggedPath, { force: true }).catch(() => null);
    return false;
  }
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

// A real MP3 starts with an ID3 tag or an MPEG frame-sync word. This rejects
// truncated/empty encoder output and WAV bytes wearing an .mp3 name.
export const isRealMp3Bytes = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (buffer.toString('ascii', 0, 3) === 'ID3') return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
};

const ffprobePath = () => String(process.env.FFPROBE_PATH || 'ffprobe').trim() || 'ffprobe';
const ffmpegPath = () => String(process.env.FFMPEG_PATH || 'ffmpeg').trim() || 'ffmpeg';

const probeMp3DurationSeconds = (filePath) => {
  try {
    const probed = spawnSync(
      ffprobePath(),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8', timeout: 30_000 }
    );
    const seconds = Number(String(probed.stdout || '').trim());
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  } catch {
    // Fall through to estimation.
  }
  return 0;
};

const assembleChunksToMp3 = async ({ chunks, outputPath, bitrate }) => {
  // FFmpeg concat demuxer over the per-chunk WAV files: headers are parsed
  // per file, so no giant in-memory PCM buffer is ever built.
  const listPath = `${outputPath}.concat.txt`;
  const lines = chunks.map((chunk) => `file '${String(chunk.filePath).replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listPath, `${lines}\n`);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        ffmpegPath(),
        ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-vn', '-c:a', 'libmp3lame', '-b:a', bitrate, '-f', 'mp3', outputPath],
        { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }
      );
      let stderr = '';
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* done */ } reject(new Error('Replay assembly timed out')); }, 10 * 60 * 1000);
      child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8').slice(0, 2000); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`Replay assembly failed (code ${code}): ${stderr.trim().slice(0, 300)}`));
      });
    });
  } finally {
    await fs.rm(listPath, { force: true }).catch(() => null);
  }
};

const mp3Bitrate = () => {
  // Live replays are a high-fidelity derivative of the 48 kHz PCM master.
  // Keep this independent from generic/manual-upload archive settings.
  const raw = String(process.env.AUDIO_REPLAY_MP3_BITRATE || '320k').trim() || '320k';
  return /^\d+k$/i.test(raw) ? raw.toLowerCase() : '320k';
};

const estimateDurationSeconds = ({ chunks, pcmBytes }) => {
  const fromChunks = chunks.reduce((total, chunk) => total + Math.max(0, (Number(chunk.endMs) || 0) - (Number(chunk.startMs) || 0)), 0) / 1000;
  if (fromChunks > 0) return Math.round(fromChunks * 10) / 10;
  if (pcmBytes > 0) return Math.round((pcmBytes / (48000 * 2 * 3)) * 10) / 10;
  return 0;
};

export async function finalizeBroadcastReplay({ broadcastId, creatorId, expectedChunkCount = 0, uploadErrors = 0 } = {}) {
  await assertFfmpegAvailable();
  const bid = String(broadcastId || '');
  if (!bid) throw Object.assign(new Error('broadcastId is required'), { status: 400, code: 'INVALID_BROADCAST' });

  if (locks.has(bid)) {
    await locks.get(bid);
    const existing = await Audio.findOne({ fileKey: replayFileKey(bid) }).select('_id');
    if (existing) return { status: 'ready', audioId: String(existing._id), duplicate: true };
  }
  let release = null;
  const gate = new Promise((resolve) => { release = resolve; });
  locks.set(bid, gate);
  try {
    return await finalizeInner({ broadcastId: bid, creatorId, expectedChunkCount, uploadErrors });
  } finally {
    locks.delete(bid);
    release();
  }
}

async function finalizeInner({ broadcastId, creatorId, expectedChunkCount, uploadErrors }) {
  const fileKey = replayFileKey(broadcastId);

  // Idempotency first: End Broadcast retries, double complete posts and page
  // refreshes all resolve to the single canonical replay.
  const already = await Audio.findOne({ fileKey }).select('_id');
  if (already) {
    await Broadcast.updateOne(
      { _id: broadcastId, replayAudioId: null },
      { $set: { replayAudio: already._id, replayAudioId: already._id, replayStatus: 'ready' } }
    ).catch(() => null);
    return { status: 'ready', audioId: String(already._id), duplicate: true };
  }

  const broadcast = await Broadcast.findOne({ _id: broadcastId, isDeleted: false })
    .select('_id creator station title description status replayAudio replayAudioId replayStatus startedAt startTime');
  if (!broadcast) {
    const error = new Error('Broadcast not found.');
    error.status = 404;
    error.code = 'BROADCAST_NOT_FOUND';
    throw error;
  }
  const broadcastCreatorId = String(broadcast.creator || '');
  if (creatorId && broadcastCreatorId !== String(creatorId)) {
    const error = new Error('Only the broadcast creator can finalize its recording.');
    error.status = 403;
    error.code = 'REPLAY_FORBIDDEN';
    throw error;
  }
  if (broadcast.replayAudio || broadcast.replayAudioId) {
    const audioId = broadcast.replayAudio || broadcast.replayAudioId;
    await Broadcast.updateOne(
      { _id: broadcastId },
      { $set: { replayAudio: audioId, replayAudioId: audioId, replayStatus: 'ready' } }
    ).catch(() => null);
    return { status: 'ready', audioId: String(audioId), duplicate: true };
  }

  const chunks = await BroadcastAudioChunk.find({ broadcastId }).sort({ chunkIndex: 1 });
  const indices = chunks.map((chunk) => Number(chunk.chunkIndex));
  const maxIndex = indices.length ? Math.max(...indices) : -1;
  const contiguous = indices.length > 0 && indices.every((value, position) => value === position) && maxIndex === indices.length - 1;
  const expected = Math.max(Number(expectedChunkCount) || 0, chunks.length, maxIndex + 1);

  // No durable audio at all: keep every recovery path, create nothing.
  const replayFile = getReplayOutputFile(broadcastId);
  const replayExists = replayFile ? await fileExists(replayFile.path) : false;
  let replayBytes = 0;
  if (replayExists) {
    try {
      replayBytes = (await fs.stat(replayFile.path)).size;
    } catch {
      replayBytes = 0;
    }
  }
  if (!chunks.length && !replayBytes) {
    await Broadcast.updateOne({ _id: broadcastId }, { $set: { replayStatus: 'empty' } }).catch(() => null);
    return { status: 'empty', audioId: null };
  }

  // Do not silently truncate: gaps, shortfalls, or transport errors keep the
  // local recovery master alive and report incomplete for an explicit retry.
  const accounted = chunks.length > 0 && contiguous && chunks.length >= expected && Number(uploadErrors) <= 0;
  const missing = [];
  if (chunks.length && !contiguous) {
    const seen = new Set(indices);
    for (let index = 0; index <= maxIndex; index += 1) {
      if (!seen.has(index)) missing.push(index);
    }
  }
  if (!accounted && !replayBytes) {
    await Broadcast.updateOne({ _id: broadcastId }, { $set: { replayStatus: 'incomplete' } }).catch(() => null);
    return {
      status: 'incomplete',
      audioId: null,
      receivedChunks: chunks.length,
      expectedChunks: expected,
      missingChunkIndices: missing.slice(0, 50),
      uploadErrors: Number(uploadErrors) || 0,
    };
  }

  const bitrate = mp3Bitrate();
  const filename = `replay-${broadcastId}.mp3`;
  await fs.mkdir(AUDIO_UPLOAD_DIR, { recursive: true });
  const finalPath = path.join(AUDIO_UPLOAD_DIR, filename);

  // Prefer the always-on streamed replay MP3; fall back to deterministic
  // one-shot assembly from the durable chunk files.
  let mp3Source = null;
  if (replayBytes > 0) {
    try {
      const header = Buffer.alloc(4);
      const handle = await fs.open(replayFile.path, 'r');
      await handle.read(header, 0, 4, 0);
      await handle.close();
      if (isRealMp3Bytes(header) && probeMp3DurationSeconds(replayFile.path) > 0) {
        mp3Source = 'stream';
      }
    } catch {
      mp3Source = null;
    }
  }
  if (!mp3Source) {
    if (!accounted) {
      await Broadcast.updateOne({ _id: broadcastId }, { $set: { replayStatus: 'incomplete' } }).catch(() => null);
      return {
        status: 'incomplete',
        audioId: null,
        receivedChunks: chunks.length,
        expectedChunks: expected,
        missingChunkIndices: missing.slice(0, 50),
        uploadErrors: Number(uploadErrors) || 0,
      };
    }
    // Validate every chunk before the assembly so one corrupt file fails
    // loudly instead of producing a silently wrong replay.
    for (const chunk of chunks) {
      let buffer = null;
      try {
        buffer = await fs.readFile(chunk.filePath);
      } catch {
        buffer = null;
      }
      if (!buffer) {
        await Broadcast.updateOne({ _id: broadcastId }, { $set: { replayStatus: 'incomplete' } }).catch(() => null);
        return { status: 'incomplete', audioId: null, receivedChunks: chunks.length, expectedChunks: expected, missingChunkIndices: missing.slice(0, 50), uploadErrors: Number(uploadErrors) || 0, reason: 'chunk-file-missing' };
      }
      try {
        pcmFromWavChunk(buffer);
      } catch {
        await Broadcast.updateOne({ _id: broadcastId }, { $set: { replayStatus: 'incomplete' } }).catch(() => null);
        return { status: 'incomplete', audioId: null, receivedChunks: chunks.length, expectedChunks: expected, missingChunkIndices: missing.slice(0, 50), uploadErrors: Number(uploadErrors) || 0, reason: 'chunk-invalid' };
      }
    }
    await assembleChunksToMp3({ chunks, outputPath: finalPath, bitrate });
    mp3Source = 'assembled';
  } else {
    await fs.copyFile(replayFile.path, finalPath);
  }

  const header = Buffer.alloc(4);
  const verifyHandle = await fs.open(finalPath, 'r');
  await verifyHandle.read(header, 0, 4, 0);
  await verifyHandle.close();
  if (!isRealMp3Bytes(header)) {
    await fs.rm(finalPath, { force: true }).catch(() => null);
    await Broadcast.updateOne({ _id: broadcastId }, { $set: { replayStatus: 'failed' } }).catch(() => null);
    const error = new Error('Replay MP3 verification failed; recovery data kept.');
    error.status = 500;
    error.code = 'REPLAY_VERIFY_FAILED';
    throw error;
  }
  const [creatorProfile, stationProfile] = await Promise.all([
    User.findById(broadcast.creator)
      .select('displayName username creatorProfile.artistName creatorProfile.organizationName')
      .lean()
      .catch(() => null),
    Station.findById(broadcast.station).select('name').lean().catch(() => null),
  ]);
  const creatorName =
    creatorProfile?.creatorProfile?.artistName ||
    creatorProfile?.creatorProfile?.organizationName ||
    creatorProfile?.displayName ||
    creatorProfile?.username ||
    'Echoo Creator';
  const channelName = stationProfile?.name || '';
  await applyEchooMp3Metadata({
    filePath: finalPath,
    title: broadcast.title,
    artist: channelName || creatorName,
    startedAt: broadcast.startedAt || broadcast.startTime || Date.now(),
  }).catch(() => false);

  const stat = await fs.stat(finalPath);
  const duration = probeMp3DurationSeconds(finalPath) || estimateDurationSeconds({ chunks, pcmBytes: replayBytes });

  const title = safeTitle(broadcast.title);
  const humanFilename = buildHumanRecordingName({
    title: broadcast.title,
    channelName,
    startedAt: broadcast.startedAt || broadcast.startTime || Date.now(),
  });
  let audio = null;
  try {
    audio = await Audio.create({
      title,
      description: String(broadcast.description || '').slice(0, 2000),
      artist: broadcastCreatorId,
      sourceBroadcast: broadcast._id,
      filename,
      fileUrl: `/uploads/audio/${filename}`,
      originalName: humanFilename,
      fileSize: stat.size,
      fileKey,
      mimeType: 'audio/mpeg',
      duration,
      genre: 'Other',
      tags: ['live-recording', 'broadcast', 'server-mp3'],
      isPublic: false,
      visibility: 'private',
      publicationStatus: 'draft',
      storage: 'local',
    });
  } catch (error) {
    if (error?.code === 11000) {
      const winner = await Audio.findOne({ fileKey }).select('_id');
      if (winner) {
        await Broadcast.updateOne({ _id: broadcastId }, { $set: { replayAudio: winner._id, replayAudioId: winner._id, replayStatus: 'ready' } }).catch(() => null);
        return { status: 'ready', audioId: String(winner._id), duplicate: true };
      }
    }
    await fs.rm(finalPath, { force: true }).catch(() => null);
    throw error;
  }

  // Optional cloud archive reuses the standard pipeline (private buckets via
  // signed URLs, no public base required). Failures keep the local MP3.
  let cloudKey = null;
  if (isCloudArchiveEnabled()) {
    try {
      const { objectKey } = await uploadToObjectStorage(finalPath, filename, 'audio/mpeg');
      cloudKey = objectKey;
      audio.storage = 'cloud';
      audio.cloudKey = objectKey;
      if (!isCloudBucketPublic()) audio.cloudUrl = null;
      await audio.save();
      const keepLocal = String(process.env.AUDIO_KEEP_LOCAL_AFTER_ARCHIVE || '').toLowerCase() === 'true';
      if (!keepLocal) await fs.rm(finalPath, { force: true }).catch(() => null);
    } catch (error) {
      console.warn('[Echoo Replay] cloud archive failed; local MP3 kept:', error?.message || error);
    }
  }

  // Chunk lifecycle: transcription owns chunk files while it is configured
  // (it consumes them itself). Only unconfigured deployments clean up here,
  // and only after the canonical MP3 is persisted above.
  if (!isTranscriptionConfigured()) {
    await BroadcastAudioChunk.deleteMany({ broadcastId }).catch(() => null);
    for (const chunk of chunks) {
      if (chunk?.filePath) await fs.rm(chunk.filePath, { force: true }).catch(() => null);
    }
    const chunkDir = path.join(process.cwd(), 'uploads', 'transcript-chunks', String(broadcastId));
    await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => null);
  }
  if (replayFile) await fs.rm(replayFile.path, { force: true }).catch(() => null);

  await Broadcast.updateOne(
    { _id: broadcastId },
    { $set: { replayAudio: audio._id, replayAudioId: audio._id, replayStatus: 'ready' } }
  ).catch(() => null);
  return { status: 'ready', audioId: String(audio._id), duplicate: false, source: mp3Source, cloud: Boolean(cloudKey) };
}

export default { finalizeBroadcastReplay, isRealMp3Bytes };
