import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';

const BLOCKING_BROADCAST_STATUSES = [
  'draft',
  'scheduled',
  'failed',
  'starting',
  'live',
  'ending',
];

const managedStationLogoPath = (coverArt) => {
  const value = String(coverArt || '');
  if (!value.startsWith('/uploads/stations/')) return null;
  return path.join(
    process.cwd(),
    'uploads',
    'stations',
    path.basename(value)
  );
};

// Deleting a Station must not strand a retryable/scheduled Broadcast that still
// points to it. Historical completed/cancelled broadcasts may retain the soft-
// deleted station reference for audit/history purposes.
export async function requireStationDeletionSafe(req, res, next) {
  try {
    const { stationId } = req.params;
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({
        error: { code: 'INVALID_STATION_ID', message: 'Invalid station ID' },
      });
    }

    const station = await Station.findOne({
      _id: stationId,
      isDeleted: false,
    }).select('_id owner coverArt');

    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' },
      });
    }

    if (String(station.owner) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' },
      });
    }

    const blockingBroadcast = await Broadcast.findOne({
      station: station._id,
      isDeleted: false,
      status: { $in: BLOCKING_BROADCAST_STATUSES },
    })
      .sort({ startTime: 1, createdAt: 1 })
      .select('_id title status');

    if (blockingBroadcast) {
      return res.status(409).json({
        error: {
          code: 'STATION_HAS_PENDING_BROADCAST',
          message:
            'Cancel or delete scheduled/draft broadcasts, or finish the active broadcast, before deleting this station.',
          broadcastId: String(blockingBroadcast._id),
          broadcastStatus: blockingBroadcast.status,
        },
      });
    }

    const logoPath = managedStationLogoPath(station.coverArt);
    if (logoPath) {
      res.once('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        fs.promises.unlink(logoPath).catch((error) => {
          if (error?.code !== 'ENOENT') {
            console.warn(
              'Deleted station logo cleanup warning:',
              error?.message || error
            );
          }
        });
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

export default requireStationDeletionSafe;
