import Broadcast from '../models/Broadcast.js';
import Station from '../models/Station.js';
import User from '../models/User.js';
import ChatMessage from '../models/ChatMessage.js';

// Get live studio state
export async function getLiveStudioState(req, res, next) {
  try {
    const userId = req.userId;
    const { broadcastId } = req.params;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isDeleted: false,
    })
      .populate('station', 'name description coverArt')
      .populate('creator', 'username displayName avatar');

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    // Get chat messages count
    const chatCount = await ChatMessage.countDocuments({
      broadcastId,
      isDeleted: false,
    });

    // Get listener count (simulated)
    const listenerCount = broadcast.listenerCount || 0;

    // Get station info
    const station = await Station.findById(broadcast.station);

    return res.status(200).json({
      data: {
        broadcast: {
          id: broadcast._id,
          title: broadcast.title,
          description: broadcast.description,
          status: broadcast.status,
          startTime: broadcast.startTime,
          endTime: broadcast.endTime,
          duration: broadcast.duration,
          isPublic: broadcast.isPublic,
          coverArt: broadcast.coverArt,
        },
        station: station ? {
          id: station._id,
          name: station.name,
          description: station.description,
          coverArt: station.coverArt,
          isLive: station.isLive,
        } : null,
        creator: {
          id: broadcast.creator._id,
          username: broadcast.creator.username,
          displayName: broadcast.creator.displayName,
          avatar: broadcast.creator.avatar,
        },
        stats: {
          listenerCount,
          chatCount,
          peakListeners: broadcast.peakListeners || 0,
        },
        controls: {
          isLive: broadcast.status === 'live',
          canStart: broadcast.status === 'scheduled' || broadcast.status === 'draft',
          canEnd: broadcast.status === 'live',
          canEdit: broadcast.status !== 'live' && broadcast.status !== 'completed',
        },
        streamInfo: {
          streamKey: broadcast.streamKey || null,
          streamUrl: broadcast.streamUrl || null,
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get live studio state error:', error);
    next(error);
  }
}

// Get broadcast stats
export async function getBroadcastStats(req, res, next) {
  try {
    const userId = req.userId;
    const { broadcastId } = req.params;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    // Get chat messages
    const totalMessages = await ChatMessage.countDocuments({
      broadcastId,
      isDeleted: false,
    });

    const uniqueUsers = await ChatMessage.distinct('userId', {
      broadcastId,
      isDeleted: false,
    });

    // Get listening data (simulated)
    const listeningData = {
      current: broadcast.listenerCount || 0,
      peak: broadcast.peakListeners || 0,
      average: Math.round((broadcast.listenerCount || 0) / 2),
    };

    // Get engagement data
    const engagement = {
      messagesPerMinute: totalMessages > 0 ? Math.round(totalMessages / (broadcast.duration || 60)) : 0,
      uniqueUsers: uniqueUsers.length,
      totalMessages,
    };

    return res.status(200).json({
      data: {
        listening: listeningData,
        engagement,
        duration: broadcast.duration || 0,
        status: broadcast.status,
        startedAt: broadcast.startTime,
        endedAt: broadcast.endTime,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get broadcast stats error:', error);
    next(error);
  }
}

// Update stream settings
export async function updateStreamSettings(req, res, next) {
  try {
    const userId = req.userId;
    const { broadcastId } = req.params;
    const { title, description, coverArt, streamKey, streamUrl } = req.body;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    if (broadcast.status === 'live' || broadcast.status === 'completed') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Cannot update settings while live or completed' }
      });
    }

    if (title) broadcast.title = title;
    if (description !== undefined) broadcast.description = description;
    if (coverArt) broadcast.coverArt = coverArt;
    if (streamKey) broadcast.streamKey = streamKey;
    if (streamUrl) broadcast.streamUrl = streamUrl;

    await broadcast.save();

    return res.status(200).json({
      data: {
        broadcast: {
          id: broadcast._id,
          title: broadcast.title,
          description: broadcast.description,
          coverArt: broadcast.coverArt,
          streamKey: broadcast.streamKey,
          streamUrl: broadcast.streamUrl,
        },
        message: 'Stream settings updated successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update stream settings error:', error);
    next(error);
  }
}

// Generate stream key
export async function generateStreamKey(req, res, next) {
  try {
    const userId = req.userId;
    const { broadcastId } = req.params;

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      creator: userId,
      isDeleted: false,
    });

    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    // Generate new stream key
    const crypto = await import('crypto');
    const newStreamKey = crypto.randomBytes(32).toString('hex');

    broadcast.streamKey = newStreamKey;
    await broadcast.save();

    return res.status(200).json({
      data: {
        streamKey: newStreamKey,
        message: 'New stream key generated successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Generate stream key error:', error);
    next(error);
  }
}

// Get live chat messages
export async function getLiveChat(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await ChatMessage.find({
      broadcastId,
      isDeleted: false,
    })
      .populate('userId', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ChatMessage.countDocuments({
      broadcastId,
      isDeleted: false,
    });

    return res.status(200).json({
      data: {
        messages: messages.reverse(),
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
    console.error('Get live chat error:', error);
    next(error);
  }
}

// Send chat message (reuses existing chat functionality)
// This is handled by the chat controller

// Get listener history
export async function getListenerHistory(req, res, next) {
  try {
    const userId = req.userId;
    const { broadcastId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get unique users who chatted
    const uniqueUsers = await ChatMessage.distinct('userId', {
      broadcastId,
      isDeleted: false,
    });

    // Get user details for these listeners
    const listeners = await User.find({
      _id: { $in: uniqueUsers },
    })
      .select('username displayName avatar')
      .skip(skip)
      .limit(parseInt(limit));

    const total = uniqueUsers.length;

    return res.status(200).json({
      data: {
        listeners: listeners.map(u => ({
          id: u._id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar,
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
    console.error('Get listener history error:', error);
    next(error);
  }
}
