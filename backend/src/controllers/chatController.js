import ChatMessage from '../models/ChatMessage.js';
import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';

const ALLOWED_CHAT_REACTIONS = new Set(['👍', '❤️', '🔥', '👏', '😂', '🎉']);

// Send message
export async function sendMessage(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const { content } = req.body;
    const userId = req.userId;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message content is required' }
      });
    }

    // Check if broadcast exists and is live
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    if (broadcast.status !== 'live' && broadcast.status !== 'scheduled') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Chat is not available for this broadcast' }
      });
    }

    // Get user info
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' }
      });
    }

    // Check for spam (simple rate limit - would be more sophisticated in production)
    const recentMessages = await ChatMessage.countDocuments({
      userId,
      broadcastId,
      createdAt: { $gte: new Date(Date.now() - 5001) }, // Last 5 seconds
    });

    if (recentMessages >= 3) {
      return res.status(429).json({
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many messages. Please slow down.' }
      });
    }

    const message = new ChatMessage({
      broadcastId,
      userId,
      username: user.username,
      displayName: user.displayName || user.username,
      avatar: user.avatar,
      content: content.trim(),
      type: 'message',
    });

    await message.save();

    // Populate user info for response
    await message.populate('userId', 'username displayName avatar');

    // Emit via Socket.IO if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`broadcast:${broadcastId}`).emit('chat:message', {
        ...message.toJSON(),
        sentAt: new Date().toISOString(),
      });
    }

    return res.status(201).json({
      data: message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get messages
export async function getMessages(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const { page = 1, limit = 50, before } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = { broadcastId, isDeleted: false };

    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(filter)
      .populate('userId', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ChatMessage.countDocuments(filter);

    return res.status(200).json({
      data: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Delete message (moderation)
export async function deleteMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Message not found' }
      });
    }

    // Check if user is the message author or broadcast owner
    const broadcast = await Broadcast.findById(message.broadcastId);
    const isOwner = broadcast && broadcast.creator.toString() === userId.toString();
    const isAuthor = message.userId.toString() === userId.toString();

    if (!isOwner && !isAuthor) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to delete this message' }
      });
    }

    message.isDeleted = true;
    message.deletedBy = userId;
    await message.save();

    // Emit delete event via Socket.IO
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`broadcast:${message.broadcastId}`).emit('chat:messageDeleted', {
        messageId,
        deletedBy: userId,
      });
    }

    return res.status(200).json({
      data: { message: 'Message deleted successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Add or remove a quick reaction on a live-chat message.
export async function addReaction(req, res, next) {
  try {
    const { messageId } = req.params;
    const emoji = String(req.body?.emoji || '').trim();
    const userId = req.userId;

    if (!ALLOWED_CHAT_REACTIONS.has(emoji)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Unsupported chat reaction',
        },
      });
    }

    const message = await ChatMessage.findOne({
      _id: messageId,
      isDeleted: false,
    });
    if (!message) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Message not found' }
      });
    }

    const broadcast = await Broadcast.findById(message.broadcastId).select('status');
    if (!broadcast) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Broadcast not found' }
      });
    }

    if (!['live', 'scheduled'].includes(broadcast.status)) {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Chat reactions are closed for this broadcast' }
      });
    }

    const existingReaction = message.reactions.find(
      (reaction) =>
        reaction.emoji === emoji &&
        String(reaction.userId) === String(userId)
    );

    if (existingReaction) {
      message.reactions = message.reactions.filter(
        (reaction) => !(
          reaction.emoji === emoji &&
          String(reaction.userId) === String(userId)
        )
      );
    } else {
      message.reactions.push({ emoji, userId });
    }

    await message.save();

    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`broadcast:${message.broadcastId}`).emit('chat:reaction', {
        messageId,
        reactions: message.reactions,
        emoji,
        userId,
        action: existingReaction ? 'removed' : 'added',
      });
    }

    return res.status(200).json({
      data: {
        messageId,
        reactions: message.reactions,
        reactionCount: message.reactions.length,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Pin message
export async function pinMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await ChatMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Message not found' }
      });
    }

    // Check if user is broadcast owner
    const broadcast = await Broadcast.findById(message.broadcastId);
    if (!broadcast || broadcast.creator.toString() !== userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only broadcast owner can pin messages' }
      });
    }

    message.isPinned = !message.isPinned;
    message.pinnedBy = message.isPinned ? userId : null;
    message.pinnedAt = message.isPinned ? new Date() : null;
    await message.save();

    // Emit pin event via Socket.IO
    if (req.app.get('io')) {
      const io = req.app.get('io');
      io.to(`broadcast:${message.broadcastId}`).emit('chat:messagePinned', {
        messageId,
        isPinned: message.isPinned,
        pinnedBy: userId,
      });
    }

    return res.status(200).json({
      data: {
        message,
        isPinned: message.isPinned,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get pinned messages
export async function getPinnedMessages(req, res, next) {
  try {
    const { broadcastId } = req.params;

    const messages = await ChatMessage.find({
      broadcastId,
      isPinned: true,
      isDeleted: false,
    })
      .populate('userId', 'username displayName avatar')
      .sort({ pinnedAt: -1 });

    return res.status(200).json({
      data: messages,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get chat stats
export async function getChatStats(req, res, next) {
  try {
    const { broadcastId } = req.params;

    const totalMessages = await ChatMessage.countDocuments({
      broadcastId,
      isDeleted: false,
    });

    const uniqueUsers = await ChatMessage.distinct('userId', {
      broadcastId,
      isDeleted: false,
    });

    const recentMessages = await ChatMessage.find({
      broadcastId,
      isDeleted: false,
      createdAt: { $gte: new Date(Date.now() - 3600000) }, // Last hour
    }).countDocuments();

    return res.status(200).json({
      data: {
        totalMessages,
        uniqueUsers: uniqueUsers.length,
        recentMessages,
        activeNow: 0, // Would come from WebSocket presence
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
