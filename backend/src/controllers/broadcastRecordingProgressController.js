import Broadcast from '../models/Broadcast.js';

// Server-authoritative progress survives browser reloads. Only the creator can
// inspect segment bookkeeping. Never return private paths or raw audio data.
export async function getBroadcastRecordingProgress(req, res, next) {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.broadcastId,
      creator: req.userId,
      isDeleted: false,
    }).select('status replayStatus endedAt serverRecording.status serverRecording.segments');
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'BROADCAST_NOT_FOUND', message: 'Broadcast not found.' },
      });
    }
    const segments = broadcast.serverRecording?.segments || {};
    const completedSegments = Math.max(0, Number(segments.completedSegments) || 0);
    const segmentSeconds = Math.max(1, Number(segments.segmentSeconds) || 600);
    return res.status(200).set('Cache-Control', 'no-store').json({
      data: {
        broadcastId: String(broadcast._id),
        broadcastStatus: broadcast.status,
        replayStatus: broadcast.replayStatus,
        serverRecorderStatus: broadcast.serverRecording?.status || 'idle',
        segmentStatus: segments.status || 'idle',
        completedSegments,
        protectedSeconds: completedSegments * segmentSeconds,
        segmentBytes: Math.max(0, Number(segments.segmentBytes) || 0),
        updatedAt: segments.updatedAt || null,
        error: segments.status === 'degraded' ? segments.error : null,
        // A sealed backup segment is NOT an independently verified full replay.
        fullReplaySaved: broadcast.replayStatus === 'ready',
      },
    });
  } catch (error) {
    next(error);
  }
}
