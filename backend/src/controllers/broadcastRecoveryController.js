import { recoverBroadcastForReplay } from '../services/broadcastRecoveryService.js';

export async function recoverBroadcast(req, res, next) {
  try {
    const result = await recoverBroadcastForReplay({
      broadcastId: req.params.broadcastId,
      userId: req.userId,
    });
    return res.status(200).json({
      data: {
        broadcastId: String(result.broadcast._id),
        status: result.broadcast.status,
        outcome: result.outcome,
        audioId: result.audioId || null,
        readyForUpload: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export default { recoverBroadcast };
