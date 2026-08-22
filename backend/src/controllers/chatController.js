import mongoose from 'mongoose';
import ChatMessage from '../models/ChatMessage.js';
import Broadcast from '../models/Broadcast.js';
import User from '../models/User.js';

const ALLOWED_CHAT_REACTIONS = new Set(['👍', '❤️', '🔥', '👏', '😂', '🎉']);
const OPEN_CHAT_STATUSES = new Set(['live', 'scheduled']);
const MAX_CHAT_PAGE_SIZE = 100;

const chatError = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const requireValidId = (value, label = 'broadcast') => {
  if (!mongoose.isValidObjectId(value)) {
    throw chatError(400, `INVALID_${label.toUpperCase()}_ID`, `Invalid ${label} ID`);
  }
};

const requireBroadcastAccess = async (broadcastId, userId) => {
  requireValidId(broadcastId, 'broadcast');

  const broadcast = await Broadcast.findOne({
    _id: broadcastId,
    isDeleted: false,
  }).select('_id creator isPublic status mutedChatUsers');

  if (!broadcast) {
    throw chatError(404, 'NOT_FOUND', 'Broadcast not found');
  }

  const isOwner = String(broadcast.creator) === String(userId);
  if (!broadcast.isPublic && !isOwner) {
    // Socket.IO already enforced this rule, but the HTTP chat endpoints did not.
    // Keep private broadcast chat private even when somebody knows its ID.
    throw chatError(403, 'BROADCAST_PRIVATE', 'This broadcast is private');
  }

  return { broadcast, isOwner };
};

const requireOpenChat = (broadcast) => {
  if (!OPEN_CHAT_STATUSES.has(broadcast.status)) {
    throw chatError(409, 'INVALID_STATE', 'Chat is not available for this broadcast');
  }
};

const loadMessageWithAccess = async (messageId, userId) => {
  requireValidId(messageId, 'message');

  const message = await ChatMessage.findOne({
    _id: messageId,
    isDeleted: false,
  });
  if (!message) throw chatError(404, 'NOT_FOUND', 'Message not found');

  const access = await requireBroadcastAccess(message.broadcastId, userId);
  return { message, ...access };
};

// Send message
export async function sendMessage(req, res, next) {
  try {
    const { broadcastId } = req.params;
    const content = String(req.body?.content || '').trim();
    const userId = req.userId;

    if (!content) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Message content is required' },
      });
    }

    const { broadcast } = await requireBroadcastAccess(broadcastId, userId);
    requireOpenChat(broadcast);
    if ((broadcast.mutedChatUsers || []).some((id) => String(id) === String(userId))) {
      throw chatError(403, 'CHAT_MUTED', 'You have been muted in this live chat');
    }

    const user = await User.findOne({ _id: userId, isActive: true }).select(
      '_id username displayName avatar'
    );
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const recentMessages = await ChatMessage.countDocuments({
      userId,
      broadcastId,
      isDeleted: false,
      createdAt: { $gte: new Date(Date.now() - 5001) },
    });

    if (recentMessages >= 3) {
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many messages. Please slow down.',
        },
      });
    }

    const message = await ChatMessage.create({
      broadcastId,
      userId,
      username: user.username,
      displayName: user.displayName || user.username,
      avatar: user.avatar,
      content,
      type: 'message',
    });

    await message.populate('userId', 'username displayName avatar');

    const io = req.app.get('io');
    if (io) {
      io.to(`broadcast:${broadcastId}`).emit('chat:message', {
        ...message.toJSON(),
        sentAt: new Date().toISOString(),
      });
      io.to(`broadcast:${broadcastId}`).emit('message_received', message.toJSON());
    }

    return res.status(201).json({
      data: message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

// Get messages
export async function getMessages(req, res, next) {
  try {
    const { broadcastId } = req.params;
    await requireBroadcastAccess(broadcastId, req.userId);

    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      MAX_CHAT_PAGE_SIZE,
      Math.max(1, Number.parseInt(req.query.limit || '50', 10) || 50)
    );
    const skip = (page - 1) * limit;
    const filter = { broadcastId, isDeleted: false };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({
          error: { code: 'INVALID_DATE', message: 'before must be a valid date' },
        });
      }
      filter.createdAt = { $lt: before };
    }

    const [messages, total] = await Promise.all([
      ChatMessage.find(filter)
        .populate('userId', 'username displayName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ChatMessage.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

// Live-chat deletion is moderation: only the broadcast owner can remove messages.
export async function deleteMessage(req, res, next) {
  try {
    const { messageId } = req.params;
    const userId = req.userId;
    const { message, isOwner } = await loadMessageWithAccess(messageId, userId);

    if (!isOwner) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Only the broadcast creator can remove live-chat messages',
        },
      });
    }

    message.isDeleted = true;
    message.deletedBy = userId;
    message.isPinned = false;
    message.pinnedBy = null;
    message.pinnedAt = null;
    await message.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`broadcast:${message.broadcastId}`).emit('chat:messageDeleted', {
        messageId,
        deletedBy: userId,
      });
      io.to(`broadcast:${message.broadcastId}`).emit('message_deleted', { messageId, deletedBy: userId });
    }

    return res.status(200).json({
      data: { message: 'Message removed from live chat' },
      timestamp: new Date().toISOString(),
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
        error: { code: 'VALIDATION_ERROR', message: 'Unsupported chat reaction' },
      });
    }

    const { message, broadcast } = await loadMessageWithAccess(messageId, userId);
    requireOpenChat(broadcast);

    const existingReaction = message.reactions.find(
      (reaction) =>
        reaction.emoji === emoji && String(reaction.userId) === String(userId)
    );

    if (existingReaction) {
      message.reactions = message.reactions.filter(
        (reaction) =>
          !(reaction.emoji === emoji && String(reaction.userId) === String(userId))
      );
    } else {
      message.reactions.push({ emoji, userId });
    }

    await message.save();

    const io = req.app.get('io');
    if (io) {
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
      timestamp: new Date().toISOString(),
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
    const { message, broadcast, isOwner } = await loadMessageWithAccess(
      messageId,
      userId
    );

    if (!isOwner) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Only broadcast owner can pin messages' },
      });
    }
    requireOpenChat(broadcast);

    message.isPinned = !message.isPinned;
    message.pinnedBy = message.isPinned ? userId : null;
    message.pinnedAt = message.isPinned ? new Date() : null;
    await message.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`broadcast:${message.broadcastId}`).emit('chat:messagePinned', {
        messageId,
        isPinned: message.isPinned,
        pinnedBy: userId,
      });
      io.to(`broadcast:${message.broadcastId}`).emit('message_pinned', { messageId, isPinned: message.isPinned, pinnedBy: userId });
    }

    return res.status(200).json({
      data: { message, isPinned: message.isPinned },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function muteChatUser(req, res, next) {
  try {
    const { broadcastId, userId: targetUserId } = req.params;
    requireValidId(targetUserId, 'user');
    const { broadcast, isOwner } = await requireBroadcastAccess(broadcastId, req.userId);
    if (!isOwner) throw chatError(403, 'FORBIDDEN', 'Only the broadcast creator can mute chat users');
    if (String(targetUserId) === String(req.userId)) throw chatError(400, 'INVALID_TARGET', 'You cannot mute yourself');
    const isMuted = (broadcast.mutedChatUsers || []).some((id) => String(id) === String(targetUserId));
    await Broadcast.updateOne(
      { _id: broadcast._id },
      isMuted
        ? { $pull: { mutedChatUsers: targetUserId } }
        : { $addToSet: { mutedChatUsers: targetUserId } }
    );
    req.app.get('io')?.to(`broadcast:${broadcast._id}`).emit('chat:userMuted', {
      broadcastId: String(broadcast._id),
      userId: String(targetUserId),
      muted: !isMuted,
    });
    return res.status(200).json({ data: { userId: targetUserId, muted: !isMuted }, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

// Get pinned messages
export async function getPinnedMessages(req, res, next) {
  try {
    const { broadcastId } = req.params;
    await requireBroadcastAccess(broadcastId, req.userId);

    const messages = await ChatMessage.find({
      broadcastId,
      isPinned: true,
      isDeleted: false,
    })
      .populate('userId', 'username displayName avatar')
      .sort({ pinnedAt: -1 })
      .limit(100);

    return res.status(200).json({
      data: messages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

// Get chat stats
export async function getChatStats(req, res, next) {
  try {
    const { broadcastId } = req.params;
    await requireBroadcastAccess(broadcastId, req.userId);

    const [totalMessages, uniqueUsers, recentMessages] = await Promise.all([
      ChatMessage.countDocuments({ broadcastId, isDeleted: false }),
      ChatMessage.distinct('userId', { broadcastId, isDeleted: false }),
      ChatMessage.countDocuments({
        broadcastId,
        isDeleted: false,
        createdAt: { $gte: new Date(Date.now() - 3600000) },
      }),
    ]);

    return res.status(200).json({
      data: {
        totalMessages,
        uniqueUsers: uniqueUsers.length,
        recentMessages,
        activeNow: 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
