import Broadcast from '../models/Broadcast.js';
import BroadcastProcessingJob from '../models/BroadcastProcessingJob.js';
import { retryRecordingFinalization } from '../services/broadcastProcessingService.js';
import Audio from '../models/Audio.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectServerRecordingSegments } from '../services/serverRecordingSegments.js';

// Server-authoritative progress survives browser reloads. Only the creator can
// inspect segment bookkeeping. Never return private paths or raw audio data.
export async function getBroadcastRecordingProgress(req, res, next) {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('status replayStatus replayAudio replayAudioId endedAt startedAt serverRecording.startedAt serverRecording.status serverRecording.segments');
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' },
      });
    }
    const segments = broadcast.serverRecording?.segments || {};
    const expectedSegments = Math.max(0, Number(segments.completedSegments) || 0);
    const segmentSeconds = Math.max(1, Number(segments.segmentSeconds) || 600);
    const checked = await inspectServerRecordingSegments({
      broadcastId: String(broadcast._id),
      attemptId: segments.attemptId,
      completedSegments: expectedSegments,
    });
    // An ephemeral disk can disappear during deploys while MongoDB survives.
    // Show only parts still present on disk, and alert the creator otherwise.
    const completedSegments = checked.completedSegments;
    const storageMissing = expectedSegments > 0 && !checked.verified;
    const started = new Date(broadcast.serverRecording?.startedAt || broadcast.startedAt || 0).getTime();
    const ended = new Date(broadcast.endedAt || Date.now()).getTime();
    // A short final segment is not a full ten minutes. Never claim more
    // protected playback time than the elapsed duration of the broadcast.
    const measuredMaximum = Number.isFinite(started) && started > 0 && Number.isFinite(ended)
      ? Math.max(0, Math.ceil((ended - started) / 1000))
      : Number.POSITIVE_INFINITY;
    // The MongoDB replayStatus alone is not proof that audio can still be
    // played. Validate that the private Audio record has a matching durable
    // local file (or a registered cloud archive) before reporting 100% saved.
    let verifiedReplaySaved = false;
    if (broadcast.replayStatus === 'ready' && (broadcast.replayAudioId || broadcast.replayAudio)) {
      const audio = await Audio.findById(broadcast.replayAudioId || broadcast.replayAudio)
        .select('filename fileSize storage cloudKey isDeleted').catch(() => null);
      if (audio && !audio.isDeleted) {
        const storedName = path.basename(String(audio.filename || ''));
        const filePath = storedName ? path.join(process.cwd(), 'uploads', 'audio', storedName) : '';
        const stat = filePath ? await fs.stat(filePath).catch(() => null) : null;
        verifiedReplaySaved = Boolean(
          (stat?.isFile() && stat.size >= Math.max(4096, Number(audio.fileSize) || 0)) ||
          (audio.storage === 'cloud' && audio.cloudKey)
        );
      }
    }
    const job = await BroadcastProcessingJob.findOne({
      broadcastId: broadcast._id, jobType: 'audio_finalization',
    }).select('status progress attempts maxAttempts availableAt error updatedAt').lean().catch(() => null);
    return res.status(200).set('Cache-Control', 'no-store').json({
      data: {
        broadcastId: String(broadcast._id),
        broadcastStatus: broadcast.status,
        startedAt: broadcast.serverRecording?.startedAt || broadcast.startedAt || null,
        endedAt: broadcast.endedAt || null,
        replayStatus: broadcast.replayStatus,
        serverRecorderStatus: broadcast.serverRecording?.status || 'idle',
        segmentStatus: storageMissing ? 'degraded' : (segments.status || 'idle'),
        reconstructionStatus: segments.recoveryStatus || 'idle',
        reconstructionError: segments.recoveryError || null,
        completedSegments,
        protectedSeconds: Math.min(completedSegments * segmentSeconds, measuredMaximum),
        segmentBytes: checked.segmentBytes,
        updatedAt: segments.updatedAt || null,
        error: storageMissing
          ? 'Previously recorded server segments are missing from storage. Check persistent disk and backups.'
          : segments.status === 'degraded' ? segments.error : null,
        // A sealed backup segment is NOT an independently verified full replay.
        fullReplaySaved: verifiedReplaySaved,
        replayFileUnavailable: broadcast.replayStatus === 'ready' && !verifiedReplaySaved,
        finalization: {
          status: verifiedReplaySaved ? 'completed' : (job?.status || 'idle'),
          attempts: Number(job?.attempts) || 0,
          // Never report 100% until the actual MP3 exists and is linked.
          percent: verifiedReplaySaved ? 100 : Math.min(99, Math.max(0, Number(job?.progress) || 0)),
          error: job?.status === 'failed' ? job.error || 'Recording finalization failed.' : null,
          updatedAt: job?.updatedAt || null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function retryBroadcastRecordingFinalization(req, res, next) {
  try {
    const id = String(req.params.broadcastId || '');
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      return res.status(400).json({ error: { code: 'INVALID_BROADCAST_ID', message: 'Invalid broadcast ID.' } });
    }
    const broadcast = await Broadcast.findOne({
      _id: id, creator: req.userId, isDeleted: false,
    }).select('_id status replayAudio replayAudioId');
    if (!broadcast) {
      return res.status(404).json({ error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' } });
    }
    if (broadcast.replayAudio || broadcast.replayAudioId) {
      return res.status(200).set('Cache-Control', 'no-store').json({
        data: { status: 'completed', broadcastId: id },
      });
    }
    if (!['completed', 'failed'].includes(broadcast.status)) {
      return res.status(409).json({ error: {
        code: 'BROADCAST_STILL_ACTIVE',
        message: 'Finish the broadcast before retrying recording finalization.',
      } });
    }
    const result = await retryRecordingFinalization(broadcast._id);
    return res.status(202).set('Cache-Control', 'no-store').json({
      data: { ...result, broadcastId: id, preservedExistingAudio: true },
    });
  } catch (error) { next(error); }
}
