import fs from 'node:fs/promises';
import path from 'node:path';
import Broadcast from '../models/Broadcast.js';
import BroadcastAudioChunk from '../models/BroadcastAudioChunk.js';
import BroadcastProcessingJob from '../models/BroadcastProcessingJob.js';
import {
  appendBroadcastOutputPcm,
  startBroadcastOutputs,
  stopBroadcastOutputs,
} from '../services/broadcastOutputService.js';
import { finalizeBroadcastReplay } from '../services/broadcastReplayService.js';
import { assertFfmpegAvailable } from '../services/audioTrimService.js';
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

const ensureQualityJob = async (broadcastId, chunk) => {
  // Transcription pause: recording/master PCM chunks remain active (the chunk
  // is still stored and forwarded to MP3/FLAC outputs at upload time), but no
  // transcript quality jobs are created when Whisper is not configured.
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
    }).select('_id status programTrackSid serverRecording qualityChunkingStartedAt qualityChunkingCompletedAt');
    if (!broadcast) return res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' } });
    if (!['starting', 'live'].includes(broadcast.status)) {
      return res.status(409).json({ error: { code: 'INVALID_BROADCAST_STATE', message: 'Quality chunking can only start for a running broadcast.' } });
    }

    // Echoo promises an automatic server MP3 for every completed live show.
    // Fail this recording-path handshake clearly when the host cannot provide
    // FFmpeg/FFprobe, instead of allowing a show to end with a mysterious
    // missing replay. LiveKit itself remains independent.
    await assertFfmpegAvailable();

    // Preferred path: LiveKit sends the already-published program track to the
    // Echoo backend over a signed WebSocket. The browser keeps OPFS only as a
    // safety master and does not upload raw PCM during or after a healthy show.
    if (isLiveKitServerRecordingEnabled()) {
      try {
        let trackSid = String(broadcast.programTrackSid || '');
        if (!trackSid) {
          const publisher = await waitForCreatorProgramAudio(
            broadcast._id,
            req.userId,
            { maxAttempts: 4, initialDelayMs: 150, delayStepMs: 150 }
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

    if (!broadcast.qualityChunkingStartedAt || broadcast.qualityChunkingCompletedAt) {
      const existingCount = await BroadcastAudioChunk.countDocuments({ broadcastId: broadcast._id });
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
    // Server-side replay finalization: the bounded chunks already received
    // become the canonical MP3. No giant client upload is ever required.
    // Failures here never fail the close itself — the local recovery master
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
    if (!['starting', 'live', 'ending'].includes(broadcast.status) && !(broadcast.status === 'completed' && broadcast.qualityChunkingStartedAt && !broadcast.qualityChunkingCompletedAt)) {
      return res.status(409).json({ error: { code: 'INVALID_BROADCAST_STATE', message: 'This broadcast is not accepting live recording chunks.' } });
    }
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: { code: 'NO_CHUNK', message: 'A recording chunk is required.' } });
    }
    if (!validWavUpload(req.file)) {
      return res.status(400).json({ error: { code: 'INVALID_CHUNK_AUDIO', message: 'Quality chunks must be valid RIFF/WAVE audio.' } });
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
      await ensureQualityJob(broadcastId, existing);
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

    // Send the same authenticated, pre-Opus master PCM that is kept for
    // quality transcription to the optional MP3 and FLAC encoders. Encoder
    // failures are isolated: the durable chunk remains accepted and LiveKit is
    // not affected.
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
