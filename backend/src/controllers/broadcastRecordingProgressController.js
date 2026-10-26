import Broadcast from '../models/Broadcast.js';
import { inspectServerRecordingSegments } from '../services/serverRecordingSegments.js';

// Server-authoritative progress survives browser reloads. Only the creator can
// inspect segment bookkeeping. Never return private paths or raw audio data.
export async function getBroadcastRecordingProgress(req, res, next) {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('status replayStatus endedAt startedAt serverRecording.startedAt serverRecording.status serverRecording.segments');
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
        fullReplaySaved: broadcast.replayStatus === 'ready',
      },
    });
  } catch (error) {
    next(error);
  }
}
