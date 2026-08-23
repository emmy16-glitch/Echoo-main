import fs from 'node:fs/promises';
import path from 'node:path';
import Broadcast from '../models/Broadcast.js';
import BroadcastAudioChunk from '../models/BroadcastAudioChunk.js';
import BroadcastProcessingJob from '../models/BroadcastProcessingJob.js';

const CHUNK_DIR = path.join(process.cwd(), 'uploads', 'transcript-chunks');
const MAX_CHUNK_DURATION_MS = 60_000;

const safeChunkName = (value) => String(value || '')
  .trim()
  .replace(/[^a-zA-Z0-9_-]/g, '-')
  .slice(0, 120) || 'chunk';

const numberField = (value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    const error = new Error(`${name} must be a valid number`);
    error.status = 400;
    error.code = 'INVALID_CHUNK_METADATA';
    throw error;
  }
  return number;
};

export async function startBroadcastAudioChunks(req, res, next) {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('_id status');
    if (!broadcast) return res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' } });
    if (!['starting', 'live'].includes(broadcast.status)) {
      return res.status(409).json({ error: { code: 'INVALID_BROADCAST_STATE', message: 'Quality chunking can only start for a running broadcast.' } });
    }
    await Broadcast.updateOne(
      { _id: broadcast._id },
      { $set: { qualityChunkingStartedAt: new Date(), qualityChunkingCompletedAt: null, qualityChunkCount: 0, qualityChunkUploadErrors: 0 } }
    );
    return res.status(200).json({ data: { broadcastId: String(broadcast._id), started: true }, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function completeBroadcastAudioChunks(req, res, next) {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('_id status');
    if (!broadcast) return res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' } });
    const qualityChunkCount = Math.max(0, Number(req.body?.qualityChunkCount) || 0);
    const qualityChunkUploadErrors = Math.max(0, Number(req.body?.qualityChunkUploadErrors) || 0);
    const chunkCount = await BroadcastAudioChunk.countDocuments({ broadcastId: broadcast._id });
    await Broadcast.updateOne(
      { _id: broadcast._id },
      {
        $set: {
          qualityChunkingCompletedAt: new Date(),
          qualityChunkCount: Math.max(chunkCount, qualityChunkCount),
          qualityChunkUploadErrors,
        },
      }
    );
    return res.status(200).json({
      data: { broadcastId: String(broadcast._id), qualityChunkCount: Math.max(chunkCount, qualityChunkCount), qualityChunkUploadErrors },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadBroadcastAudioChunk(req, res, next) {
  let filePath = null;
  try {
    const { broadcastId } = req.params;
    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('_id creator status qualityChunkingStartedAt qualityChunkingCompletedAt');

    if (!broadcast) {
      return res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' } });
    }
    if (!['starting', 'live', 'ending'].includes(broadcast.status) && !(broadcast.status === 'completed' && broadcast.qualityChunkingStartedAt && !broadcast.qualityChunkingCompletedAt)) {
      return res.status(409).json({ error: { code: 'INVALID_BROADCAST_STATE', message: 'This broadcast is not accepting live recording chunks.' } });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: { code: 'NO_CHUNK', message: 'A recording chunk is required.' } });
    }

    const chunkId = String(req.body.chunkId || '').trim();
    if (!chunkId || chunkId.length > 160) {
      return res.status(400).json({ error: { code: 'INVALID_CHUNK_ID', message: 'A valid chunkId is required.' } });
    }
    const chunkIndex = numberField(req.body.chunkIndex, 'chunkIndex', { max: 1_000_000 });
    const startMs = numberField(req.body.startMs, 'startMs');
    const endMs = numberField(req.body.endMs, 'endMs', { min: startMs });
    if (endMs <= startMs || endMs - startMs > MAX_CHUNK_DURATION_MS) {
      return res.status(400).json({ error: { code: 'INVALID_CHUNK_DURATION', message: 'Chunk duration must be greater than zero and no longer than 60 seconds.' } });
    }
    const sampleRate = numberField(req.body.sampleRate, 'sampleRate', { min: 8000, max: 192000 });
    const channels = numberField(req.body.channels, 'channels', { min: 1, max: 2 });
    const bitDepth = numberField(req.body.bitDepth, 'bitDepth', { min: 16, max: 32 });
    if (![16, 24, 32].includes(bitDepth)) {
      return res.status(400).json({ error: { code: 'INVALID_BIT_DEPTH', message: 'bitDepth must be 16, 24, or 32.' } });
    }

    const existing = await BroadcastAudioChunk.findOne({ broadcastId, chunkId });
    if (existing) {
      return res.status(200).json({ data: existing, duplicate: true, timestamp: new Date().toISOString() });
    }

    await fs.mkdir(path.join(CHUNK_DIR, String(broadcastId)), { recursive: true });
    filePath = path.join(CHUNK_DIR, String(broadcastId), `${chunkIndex}-${safeChunkName(chunkId)}.wav`);
    await fs.writeFile(filePath, req.file.buffer, { flag: 'wx' });

    const chunk = await BroadcastAudioChunk.create({
      broadcastId,
      creatorId: req.userId,
      chunkId,
      chunkIndex,
      startMs,
      endMs,
      filePath,
      mimeType: req.file.mimetype || 'audio/wav',
      sizeBytes: req.file.size,
      sampleRate,
      channels,
      bitDepth,
      status: 'pending',
    });

    await Broadcast.updateOne(
      { _id: broadcast._id, qualityChunkingStartedAt: null },
      { $set: { qualityChunkingStartedAt: new Date() } }
    );

    await BroadcastProcessingJob.updateOne(
      { broadcastId, jobType: 'transcript_quality_chunk', chunkId: chunk._id },
      {
        $setOnInsert: {
          broadcastId,
          jobType: 'transcript_quality_chunk',
          chunkId: chunk._id,
          status: 'queued',
          progress: 0,
          availableAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(201).json({ data: chunk, timestamp: new Date().toISOString() });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await BroadcastAudioChunk.findOne({ broadcastId: req.params.broadcastId, chunkId: String(req.body.chunkId || '') });
      if (existing) return res.status(200).json({ data: existing, duplicate: true, timestamp: new Date().toISOString() });
    }
    if (filePath) await fs.rm(filePath, { force: true }).catch(() => null);
    next(error);
  }
}
