import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

// Schedule a broadcast
export async function scheduleBroadcast(req, res, next) {
  try {
    const userId = req.userId;
    const { 
      title, 
      description, 
      stationId, 
      scheduledAt,
      scheduledType = 'live',
      scheduledAudioId = null,
      isPublic = true,
      tags = [],
      notes = '',
      coverArt = null,
    } = req.body;

    if (!title || !stationId || !scheduledAt) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Title, station, and scheduled time are required' }
      });
    }

    // Check if station exists and user owns it
    const station = await Station.findById(stationId);
    if (!station) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Station not found' }
      });
    }

    if (station.owner.toString() !== userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this station' }
      });
    }

    // Check for overlapping broadcasts
    const overlapping = await Broadcast.findOne({
      station: stationId,
      isDeleted: false,
      status: { $in: ['scheduled', 'starting', 'live'] },
      scheduledAt: {
        $gte: new Date(scheduledAt),
        $lt: new Date(new Date(scheduledAt).getTime() + 2 * 60 * 60 * 1000) // 2 hour window
      }
    });

    if (overlapping) {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'Broadcast time overlaps with existing scheduled broadcast' }
      });
    }

    // Calculate end time (default 1 hour)
    const startTime = new Date(scheduledAt);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

    const broadcast = new Broadcast({
      title,
      description: description || '',
      station: stationId,
      creator: userId,
      startTime,
      endTime,
      scheduledAt: startTime,
      scheduledType,
      scheduledAudioId: scheduledAudioId || null,
      isScheduled: true,
      isPublic,
      tags: tags || [],
      notes: notes || '',
      coverArt: coverArt || null,
      status: 'scheduled',
    });

    await broadcast.save();

    // Populate creator info
    await broadcast.populate('creator', 'username displayName avatar');
    await broadcast.populate('station', 'name slug');

    return res.status(201).json({
      data: {
        broadcast,
        message: 'Broadcast scheduled successfully',
        scheduledAt: startTime,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Schedule broadcast error:', error);
    next(error);
  }
}

// Get scheduled broadcasts (upcoming)
export async function getScheduledBroadcasts(req, res, next) {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, stationId } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const now = new Date();
    
    const filter = {
      creator: userId,
      isScheduled: true,
      isDeleted: false,
      status: 'scheduled',
      scheduledAt: { $gt: now },
    };

    if (stationId) {
      filter.station = stationId;
    }

    const broadcasts = await Broadcast.find(filter)
      .populate('station', 'name slug coverArt')
      .populate('scheduledAudioId', 'title duration')
      .sort({ scheduledAt: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Broadcast.countDocuments(filter);

    return res.status(200).json({
      data: {
        broadcasts: broadcasts.map(b => ({
          id: b._id,
          title: b.title,
          description: b.description,
          scheduledAt: b.scheduledAt,
          scheduledType: b.scheduledType,
          station: b.station,
          isPublic: b.isPublic,
          status: b.status,
          tags: b.tags,
          notes: b.notes,
          coverArt: b.coverArt,
          scheduledAudio: b.scheduledAudioId,
          createdAt: b.createdAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get scheduled broadcasts error:', error);
    next(error);
  }
}

// Cancel scheduled broadcast
export async function cancelScheduledBroadcast(req, res, next) {
  try {
    const userId = req.userId;
    const { broadcastId } = req.params;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isScheduled: true,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Scheduled broadcast not found' }
      });
    }

    if (broadcast.status !== 'scheduled') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Cannot cancel a broadcast that is already live or completed' }
      });
    }

    broadcast.status = 'cancelled';
    await broadcast.save();

    // Notify followers about cancellation (optional)
    // This would be implemented with notification service

    return res.status(200).json({
      data: {
        broadcast,
        message: 'Scheduled broadcast cancelled successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cancel scheduled broadcast error:', error);
    next(error);
  }
}

// Update scheduled broadcast
export async function updateScheduledBroadcast(req, res, next) {
  try {
    const userId = req.userId;
    const { broadcastId } = req.params;
    const { 
      title, 
      description, 
      scheduledAt,
      scheduledType,
      scheduledAudioId,
      isPublic,
      tags,
      notes,
      coverArt,
    } = req.body;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isScheduled: true,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Scheduled broadcast not found' }
      });
    }

    if (broadcast.status !== 'scheduled') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Cannot update a broadcast that is already live or completed' }
      });
    }

    if (title) broadcast.title = title;
    if (description !== undefined) broadcast.description = description;
    if (scheduledAt) {
      const newTime = new Date(scheduledAt);
      broadcast.scheduledAt = newTime;
      broadcast.startTime = newTime;
      broadcast.endTime = new Date(newTime.getTime() + 60 * 60 * 1000);
    }
    if (scheduledType) broadcast.scheduledType = scheduledType;
    if (scheduledAudioId !== undefined) broadcast.scheduledAudioId = scheduledAudioId;
    if (isPublic !== undefined) broadcast.isPublic = isPublic;
    if (tags) broadcast.tags = tags;
    if (notes !== undefined) broadcast.notes = notes;
    if (coverArt) broadcast.coverArt = coverArt;

    await broadcast.save();

    return res.status(200).json({
      data: {
        broadcast,
        message: 'Scheduled broadcast updated successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update scheduled broadcast error:', error);
    next(error);
  }
}
