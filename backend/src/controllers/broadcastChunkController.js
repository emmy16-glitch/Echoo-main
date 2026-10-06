import fs from 'node:fs/promises';
import path from 'node:path';
import Broadcast from '../models/Broadcast.js';
import BroadcastAudioChunk from '../models/BroadcastAudioChunk.js';
import BroadcastProcessingJob from '../models/BroadcastProcessingJob.js';
import {
  appendBroadcastOutputPcm,
  pcmFromWavChunk,
  startBroadcastOutputs,
  stopBroadcastOutputs,
} from '../services/broadcastOutputService.js';
import { finalizeBroadcastReplay } from '../services/broadcastReplayService.js';
import { checkFfmpegCapability } from '../services/audioTrimService.js';
import { isTranscriptionConfigured } from '../services/transcriptionGateway.js';
import { waitForCreatorProgramAudio } from '../services/broadcastAudioReadiness.js';
import {
  ensureLiveKitServerRecording,
  isLiveKitServerRecordingEnabled,
} from '../services/livekitServerRecording.js';

const CHUNK_DIR = path.join(process.cwd(), 'uploads', 'transcript-chunks');
const MAX_CHUNK_DURATION_MS = 60_000;
const QUALITY_JOB_MAX_ATTEMPTS = 8;

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

const validWavUpload = (file) => Boolean(
  file?.buffer?.length >= 44 &&
  file.buffer.toString('ascii', 0, 4) === 'RIFF' &&
  file.buffer.toString('ascii', 8, 12) === 'WAVE'
);

const durableWavChunkExists = async (chunk) => {
  const filePath = String(chunk?.filePath || '');
  if (!filePath) return false;
  let handle = null;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 44) return false;
    handle = await fs.open(filePath, 'r');
    const header = Buffer.alloc(44);
    const { bytesRead } = await handle.read(header, 0, 44, 0);
    if (bytesRead !== 44) return false;

    const declaredDataBytes = header.readUInt32LE(40);
    return (
      header.toString('ascii', 0, 4) === 'RIFF' &&
      header.toString('ascii', 8, 12) === 'WAVE' &&
      header.toString('ascii', 12, 16) === 'fmt ' &&
      header.readUInt16LE(20) === 1 &&
      header.readUInt16LE(22) === 2 &&
      header.readUInt32LE(24) === 48000 &&
      header.readUInt16LE(34) === 24 &&
      header.toString('ascii', 36, 40) === 'data' &&
      stat.size === 44 + declaredDataBytes
    );
  } catch {
    return false;
  } finally {
    if (handle) await handle.close().catch(() => null);
  }
};

const ensureQualityJob = async (broadcastId, chunk) => {
  // Recovery chunks are post-live only. They may also feed optional quality
  // processing when transcription is explicitly enabled; with transcription
  // disabled, no transcript job is created.
  if (!isTranscriptionConfigured()) return;
  await BroadcastProcessingJob.updateOne(
    { broadcastId, jobType: 'transcript_quality_chunk', chunkId: chunk._id },
    {
      $setOnInsert: {
        broadcastId,
        jobType: 'transcript_quality_chunk',
        chunkId: chunk._id,
        status: 'queued',
        progress: 0,
        maxAttempts: Number(chunk.maxAttempts) || QUALITY_JOB_MAX_ATTEMPTS,
        availableAt: new Date(),
      },
    },
    { upsert: true }
  );
};

export async function startBroadcastAudioChunks(req, res, next) {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('_id status replayStatus programTrackSid serverRecording qualityChunkingStartedAt qualityChunkingCompletedAt');
    if (!broadcast) return res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' } });
    const recoveryAfterCompleted =
      broadcast.status === 'completed' && broadcast.replayStatus !== 'ready';
    if (!['starting', 'live'].includes(broadcast.status) && !recoveryAfterCompleted) {
      return res.status(409).json({ error: { code: 'INVALID_BROADCAST_STATE', message: 'Recording transport can only start for a running broadcast or an incomplete completed recording.' } });
    }

    // Prefer the MP3 pipeline when media tooling exists. On lightweight
    // staging hosts without FFmpeg/FFprobe, keep broadcasting normally and
    // fall back after OFF AIR to a durable WAV replay assembled from the
    // browser's bounded recovery chunks.
    const recordingTooling = await checkFfmpegCapability();

    // Preferred path: LiveKit sends the already-published program track to the
    // Echoo backend over a signed WebSocket. The browser keeps OPFS only as a
    // safety master and does not upload raw PCM during or after a healthy show.
    if (recordingTooling.ok && isLiveKitServerRecordingEnabled() && ['starting', 'live'].includes(broadcast.status)) {
      try {
        let trackSid = String(broadcast.programTrackSid || '');
        if (!trackSid) {
          const publisher = await waitForCreatorProgramAudio(
            broadcast._id,
            req.userId
          );
          trackSid = String(publisher?.trackSid || '');
        }
        if (trackSid) {
          const serverRecording = await ensureLiveKitServerRecording({
            broadcastId: String(broadcast._id),
            trackSid,
          });
          if (serverRecording?.mode === 'server-egress') {
            return res.status(200).json({
              data: {
                broadcastId: String(broadcast._id),
                started: true,
                mode: 'server-egress',
                serverRecording: true,
                transcription: isTranscriptionConfigured() ? 'separate' : 'disabled',
              },
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        console.warn(
          '[Echoo Server Recording] falling back to browser recovery transport:',
          error?.message || error
        );
        await Broadcast.updateOne(
          { _id: broadcast._id },
          {
            $set: {
              'serverRecording.status': 'failed',
              'serverRecording.transport': 'browser-fallback',
              'serverRecording.error': String(error?.message || error).slice(0, 1000),
            },
          }
        ).catch(() => null);
      }
    }

    if (['starting', 'live'].includes(broadcast.status)) {
      // Server Egress was unavailable, but live listener audio must stay
      // WebRTC-only. Do NOT start browser PCM/WAV transport while on air.
      // The complete OPFS master will reopen this endpoint after OFF AIR.
      return res.status(200).json({
        data: {
          broadcastId: String(broadcast._id),
          started: false,
          mode: 'browser-recovery-deferred',
          serverRecording: false,
          recoveryAfterLive: true,
          transcription: isTranscriptionConfigured() ? 'separate' : 'disabled',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const existingChunks = await BroadcastAudioChunk.find({ broadcastId: broadcast._id })
      .select('_id chunkIndex filePath')
      .sort({ chunkIndex: 1 })
      .lean();
    const existingChunkIndices = [];
    for (const chunk of existingChunks) {
      const index = Number(chunk.chunkIndex);
      if (!Number.isInteger(index) || index < 0) continue;
      if (await durableWavChunkExists(chunk)) existingChunkIndices.push(index);
    }
    const existingCount = existingChunkIndices.length;

    if (!broadcast.qualityChunkingStartedAt || broadcast.qualityChunkingCompletedAt) {
      await Broadcast.updateOne(
        { _id: broadcast._id },
        {
          $set: {
            qualityChunkingStartedAt: new Date(),
            qualityChunkingCompletedAt: null,
            qualityChunkCount: existingCount,
            qualityChunkUploadErrors: 0,
          },
        }
      );
    }
    // The canonical replay branch is required here because the product
    // guarantees an automatic server MP3. Optional radio/FLAC branches may
    // still fail independently without affecting LiveKit.
    const outputs = await startBroadcastOutputs(String(broadcast._id)).catch((error) => ({
      radioOutput: { status: 'failed', error: String(error?.message || error) },
      masterRecording: { status: 'failed', error: String(error?.message || error) },
    }));
    return res.status(200).json({
      data: {
        broadcastId: String(broadcast._id),
        started: true,
        mode: 'browser-fallback',
        serverRecording: false,
        existingChunkIndices,
        outputs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function completeBroadcastAudioChunks(req, res, next) {
  try {
    const qualityChunkCount = Math.max(0, Number(req.body?.qualityChunkCount) || 0);
    const qualityChunkUploadErrors = Math.max(0, Number(req.body?.qualityChunkUploadErrors) || 0);
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('_id status serverRecording qualityChunkingStartedAt qualityChunkingCompletedAt');
    if (!broadcast) return res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' } });

    // A client may lose every response to the idempotent start request. If it
    // later closes the quality path with an explicit error count, persist that
    // terminal failure instead of rejecting the close and leaving the worker
    // unable to distinguish “quality never worked” from “still uploading”.
    const serverPrimary =
      broadcast.serverRecording?.transport === 'livekit-track-egress';

    if (!broadcast.qualityChunkingStartedAt && !serverPrimary && qualityChunkUploadErrors <= 0) {
      return res.status(409).json({ error: { code: 'QUALITY_CHUNKING_NOT_STARTED', message: 'Quality chunking was not started for this broadcast.' } });
    }

    const chunkCount = await BroadcastAudioChunk.countDocuments({ broadcastId: broadcast._id });
    if (broadcast.qualityChunkingStartedAt || !serverPrimary) {
      const now = new Date();
      await Broadcast.updateOne(
        { _id: broadcast._id },
        {
          $set: {
            qualityChunkingStartedAt: broadcast.qualityChunkingStartedAt || now,
            qualityChunkingCompletedAt: broadcast.qualityChunkingCompletedAt || now,
            qualityChunkCount: Math.max(chunkCount, qualityChunkCount),
            qualityChunkUploadErrors,
          },
        }
      );
    }
    await stopBroadcastOutputs(String(broadcast._id), {
      incomplete: qualityChunkUploadErrors > 0,
    }).catch((error) => {
      console.warn('[Echoo Outputs] stop warning:', error?.message || error);
    });
    // Server-side replay finalization: prefer the server-Egress MP3; when that
    // failed, the bounded post-live recovery chunks become the canonical MP3.
    // No giant client upload is ever required. Failures here never fail the
    // close itself — the local recovery master
    // stays alive and an explicit retry resumes from the same chunks.
    let replay = { status: 'empty', audioId: null };
    try {
      replay = await finalizeBroadcastReplay({
        broadcastId: String(broadcast._id),
        creatorId: String(req.userId || ''),
        expectedChunkCount: Math.max(chunkCount, qualityChunkCount),
        uploadErrors: qualityChunkUploadErrors,
      });
    } catch (error) {
      console.warn('[Echoo Replay] finalize warning:', error?.message || error);
      replay = { status: 'failed', audioId: null, code: error?.code || 'REPLAY_FINALIZE_FAILED' };
    }
    return res.status(200).json({
      data: { broadcastId: String(broadcast._id), qualityChunkCount: Math.max(chunkCount, qualityChunkCount), qualityChunkUploadErrors, replay },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadBroadcastAudioChunk(req, res, next) {
  let filePath = null;
  let createdChunkId = null;
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
    const recoveryWindowOpen =
      broadcast.status === 'completed' &&
      Boolean(broadcast.qualityChunkingStartedAt) &&
      !broadcast.qualityChunkingCompletedAt;

    if (!recoveryWindowOpen) {
      return res.status(409).json({
        error: {
          code: 'RECORDING_RECOVERY_NOT_OPEN',
          message: 'Browser WAV chunks are accepted only after OFF AIR during an explicit recording-recovery session.',
        },
      });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: { code: 'NO_CHUNK', message: 'A recording chunk is required.' } });
    }
    if (!validWavUpload(req.file)) {
      return res.status(400).json({ error: { code: 'INVALID_CHUNK_AUDIO', message: 'Quality chunks must be valid RIFF/WAVE audio.' } });
    }
    try {
      pcmFromWavChunk(req.file.buffer);
    } catch {
      return res.status(400).json({
        error: {
          code: 'INVALID_CHUNK_AUDIO',
          message: 'Recovery chunks must be 48 kHz stereo 24-bit PCM WAV audio.',
        },
      });
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
    if (sampleRate !== 48000 || channels !== 2 || bitDepth !== 24) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CHUNK_FORMAT',
          message: 'Recovery chunks must use the Echoo 48 kHz stereo 24-bit PCM master format.',
        },
      });
    }

    const existing = await BroadcastAudioChunk.findOne({ broadcastId, chunkId });
    if (existing) {
      if (await durableWavChunkExists(existing)) {
        await ensureQualityJob(broadcastId, existing);
        return res.status(200).json({ data: existing, duplicate: true, timestamp: new Date().toISOString() });
      }

      // A database row can outlive its local file after a disk cleanup/crash.
      // Repair that same chunk identity atomically so resumable recovery does
      // not get stuck forever skipping a file that no longer exists.
      const repairPath = existing.filePath || path.join(
        CHUNK_DIR,
        String(broadcastId),
        `${chunkIndex}-${safeChunkName(chunkId)}.wav`
      );
      await fs.mkdir(path.dirname(repairPath), { recursive: true });
      const tempPath = `${repairPath}.repair-${process.pid}-${Date.now()}`;
      try {
        await fs.writeFile(tempPath, req.file.buffer, { flag: 'wx' });
        await fs.rename(tempPath, repairPath);
      } finally {
        await fs.rm(tempPath, { force: true }).catch(() => null);
      }

      existing.chunkIndex = chunkIndex;
      existing.startMs = startMs;
      existing.endMs = endMs;
      existing.filePath = repairPath;
      existing.mimeType = 'audio/wav';
      existing.sizeBytes = req.file.size;
      existing.sampleRate = sampleRate;
      existing.channels = channels;
      existing.bitDepth = bitDepth;
      existing.status = 'pending';
      await existing.save();
      await ensureQualityJob(broadcastId, existing);
      await appendBroadcastOutputPcm(broadcastId, req.file.buffer).catch((error) => {
        console.warn('[Echoo Outputs] repaired PCM append warning:', error?.message || error);
      });
      return res.status(200).json({
        data: existing,
        duplicate: true,
        repaired: true,
        timestamp: new Date().toISOString(),
      });
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
      mimeType: 'audio/wav',
      sizeBytes: req.file.size,
      sampleRate,
      channels,
      bitDepth,
      status: 'pending',
      maxAttempts: QUALITY_JOB_MAX_ATTEMPTS,
    });
    createdChunkId = chunk._id;

    await Broadcast.updateOne(
      { _id: broadcast._id, qualityChunkingStartedAt: null },
      { $set: { qualityChunkingStartedAt: new Date() } }
    );

    await ensureQualityJob(broadcastId, chunk);

    // Feed this authenticated post-live recovery WAV to replay/optional output
    // encoders. This endpoint is unreachable while LIVE, so it cannot compete
    // with creator WebRTC upstream.
    await appendBroadcastOutputPcm(broadcastId, req.file.buffer).catch((error) => {
      console.warn('[Echoo Outputs] PCM append warning; LiveKit continues:', error?.message || error);
    });

    return res.status(201).json({ data: chunk, timestamp: new Date().toISOString() });
  } catch (error) {
    if (createdChunkId) {
      await BroadcastAudioChunk.deleteOne({ _id: createdChunkId, status: 'pending' }).catch(() => null);
    }
    if (error?.code === 11000) {
      const existing = await BroadcastAudioChunk.findOne({ broadcastId: req.params.broadcastId, chunkId: String(req.body.chunkId || '') });
      if (existing) {
        await ensureQualityJob(req.params.broadcastId, existing).catch(() => null);
        return res.status(200).json({ data: existing, duplicate: true, timestamp: new Date().toISOString() });
      }
    }
    if (filePath) await fs.rm(filePath, { force: true }).catch(() => null);
    next(error);
  }
}
