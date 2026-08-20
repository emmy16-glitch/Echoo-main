import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';

export async function enforceSingleLiveCreator(req, res, next) {
  try {
    const currentBroadcastId = String(req.params.broadcastId || '');

    // Let the controller return the canonical invalid-id response.
    if (!mongoose.isValidObjectId(currentBroadcastId)) {
      next();
      return;
    }

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

export async function requireUsableBroadcastStation(req, res, next) {
  try {
    const broadcastId = String(req.params.broadcastId || '');
    if (!mongoose.isValidObjectId(broadcastId)) return next();

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: req.userId,
      isDeleted: false,
    })
      .select('_id station')
      .lean();

    // The lifecycle controller owns the canonical not-found response.
    if (!broadcast) return next();

    const station = await Station.exists({
      _id: broadcast.station,
      owner: req.userId,
      isDeleted: false,
    });

    if (!station) {
      return res.status(409).json({
        error: {
          code: 'STATION_UNAVAILABLE',
          message: 'This broadcast belongs to a station that no longer exists. Choose an active station before going live.',
        },
      });
    }

    return next();
  } catch (error) {
    next(error);
  }
}

export default enforceSingleLiveCreator;
