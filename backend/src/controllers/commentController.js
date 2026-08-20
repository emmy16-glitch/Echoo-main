import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Audio from '../models/Audio.js';

const MAX_COMMENT_PAGE_SIZE = 100;

const validId = (value) => mongoose.isValidObjectId(value);

const invalidId = (res, field = 'audio') =>
  res.status(400).json({
    error: {
      code: field === 'comment' ? 'INVALID_COMMENT_ID' : 'INVALID_AUDIO_ID',
      message: `Invalid ${field} ID`,
    },
  });

const accessibleAudio = (audioId, userId = null) => {
  const filter = {
    _id: audioId,
    isDeleted: false,
  };

  if (userId) {
    filter.$or = [{ isPublic: true }, { artist: userId }];
  } else {
    filter.isPublic = true;
  }

  return Audio.findOne(filter);
};

const incrementCommentCountBestEffort = async (audio) => {
  if (!audio) return;
  try {
    await audio.incrementComments();
  } catch (error) {
    // The comment itself is authoritative. A denormalized counter failure must
    // never turn a successfully-created comment into a client-visible 500 that
    // encourages duplicate retries.
    console.warn('Audio comment-count increment warning:', error?.message || error);
  }
};

const decrementCommentCountBestEffort = async (audioId) => {
  try {
    const audio = await Audio.findOne({ _id: audioId, isDeleted: false });
    if (audio) await audio.decrementComments();
  } catch (error) {
    console.warn('Audio comment-count decrement warning:', error?.message || error);
  }
};

// Add comment to audio
export async function addComment(req, res, next) {
  try {
    const content = String(req.body?.content || '').trim();
    const parentCommentId = req.body?.parentCommentId || null;
    const { audioId } = req.params;

    if (!validId(audioId)) return invalidId(res, 'audio');
    if (!content) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Comment content is required' },
      });
    }

    const audio = await accessibleAudio(audioId, req.userId);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found or unavailable' },
      });
    }

    if (parentCommentId) {
      if (!validId(parentCommentId)) return invalidId(res, 'comment');

      // A reply must belong to the same audio item. Previously any existing
      // Comment ID could be used as a parent, corrupting threads across tracks.
      const parentComment = await Comment.findOne({
        _id: parentCommentId,
        audioId,
        isDeleted: false,
      }).select('_id');

      if (!parentComment) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Parent comment not found for this audio',
          },
        });
      }
    }

    const comment = await Comment.create({
      content,
      author: req.userId,
      audioId,
      parentCommentId,
    });

    await incrementCommentCountBestEffort(audio);
    await comment.populate('author', 'username displayName avatar');

    return res.status(201).json({
      data: comment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

// Get comments for currently-public audio only. This endpoint is intentionally
// unauthenticated, so a private/deleted audio ID must not become a comment leak.
export async function getComments(req, res, next) {
  try {
    const { audioId } = req.params;
    if (!validId(audioId)) return invalidId(res, 'audio');

    const audio = await accessibleAudio(audioId);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      MAX_COMMENT_PAGE_SIZE,
      Math.max(1, Number.parseInt(req.query.limit || '50', 10) || 50)
    );
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      Comment.find({
        audioId,
        parentCommentId: null,
        isDeleted: false,
      })
        .populate('author', 'username displayName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Comment.countDocuments({
        audioId,
        parentCommentId: null,
        isDeleted: false,
      }),
    ]);

    // Fetch replies in one query instead of one database request per parent.
    const parentIds = comments.map((comment) => comment._id);
    const replies = parentIds.length
      ? await Comment.find({
          audioId,
          parentCommentId: { $in: parentIds },
          isDeleted: false,
        })
          .populate('author', 'username displayName avatar')
          .sort({ createdAt: 1 })
      : [];

    const repliesByParent = new Map();
    for (const reply of replies) {
      const key = String(reply.parentCommentId);
      const list = repliesByParent.get(key) || [];
      if (list.length < 10) list.push(reply);
      repliesByParent.set(key, list);
    }

    const commentsWithReplies = comments.map((comment) => ({
      ...comment.toObject(),
      replies: repliesByParent.get(String(comment._id)) || [],
    }));

    return res.status(200).json({
      data: commentsWithReplies,
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

// Update comment
export async function updateComment(req, res, next) {
  try {
    const content = String(req.body?.content || '').trim();
    const { commentId } = req.params;

    if (!validId(commentId)) return invalidId(res, 'comment');
    if (!content) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Comment content is required' },
      });
    }

    const comment = await Comment.findOne({ _id: commentId, isDeleted: false });
    if (!comment) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment not found' },
      });
    }

    if (String(comment.author) !== String(req.userId)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this comment' },
      });
    }

    const audio = await accessibleAudio(comment.audioId, req.userId);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found or unavailable' },
      });
    }

    comment.content = content;
    await comment.save();

    return res.status(200).json({
      data: comment,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

// Delete comment
export async function deleteComment(req, res, next) {
  try {
    const { commentId } = req.params;
    if (!validId(commentId)) return invalidId(res, 'comment');

    const comment = await Comment.findOne({ _id: commentId, isDeleted: false });
    if (!comment) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment not found' },
      });
    }

    if (
      String(comment.author) !== String(req.userId) &&
      !req.userRoles?.includes('admin')
    ) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this comment',
        },
      });
    }

    comment.isDeleted = true;
    await comment.save();
    await decrementCommentCountBestEffort(comment.audioId);

    return res.status(200).json({
      data: { message: 'Comment deleted successfully' },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

// Like/unlike a comment while keeping `likes` and `likeCount` consistent under
// concurrent requests. The current audio visibility is checked first.
export async function likeComment(req, res, next) {
  try {
    const { commentId } = req.params;
    if (!validId(commentId)) return invalidId(res, 'comment');

    const comment = await Comment.findOne({ _id: commentId, isDeleted: false }).select(
      '_id audioId likes likeCount'
    );
    if (!comment) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment not found' },
      });
    }

    const audio = await accessibleAudio(comment.audioId, req.userId);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found or unavailable' },
      });
    }

    const userId = req.userId;
    const alreadyLiked = comment.likes.some((id) => String(id) === String(userId));
    let updated = null;

    if (alreadyLiked) {
      updated = await Comment.findOneAndUpdate(
        {
          _id: commentId,
          isDeleted: false,
          likes: userId,
          likeCount: { $gt: 0 },
        },
        {
          $pull: { likes: userId },
          $inc: { likeCount: -1 },
        },
        { new: true }
      );
    } else {
      updated = await Comment.findOneAndUpdate(
        {
          _id: commentId,
          isDeleted: false,
          likes: { $ne: userId },
        },
        {
          $addToSet: { likes: userId },
          $inc: { likeCount: 1 },
        },
        { new: true }
      );
    }

    // A simultaneous request may have already performed the same transition.
    // Return the authoritative current state rather than inventing a failure.
    if (!updated) {
      updated = await Comment.findOne({ _id: commentId, isDeleted: false });
    }
    if (!updated) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment not found' },
      });
    }

    const liked = updated.likes.some((id) => String(id) === String(userId));
    return res.status(200).json({
      data: { likeCount: Math.max(0, Number(updated.likeCount) || 0), liked },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
