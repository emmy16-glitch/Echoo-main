import Broadcast from '../models/Broadcast.js';

export async function enforceSingleLiveCreator(req, res, next) {
  try {
    const currentBroadcastId = String(req.params.broadcastId || '');

    const active = await Broadcast.findOne({
      creator: req.userId,
      isDeleted: false,
      status: { $in: ['starting', 'live', 'ending'] },
      _id: { $ne: currentBroadcastId },
    })
      .select('_id title status station')
      .lean();

    if (!active) {
      next();
      return;
    }

    return res.status(409).json({
      error: {
        code: 'CREATOR_ALREADY_LIVE',
        message: 'You already have an active live broadcast. End it before starting another.',
        activeBroadcastId: String(active._id),
        activeBroadcastTitle: active.title || 'Live broadcast',
        activeBroadcastStatus: active.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

export default enforceSingleLiveCreator;
