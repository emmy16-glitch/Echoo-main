import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Audio from '../models/Audio.js';

const MAX_COMMENT_PAGE_SIZE = 100;
const INLINE_REPLY_LIMIT = 10;

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

const decrementCommentCountBestEffort = async (audioId, amount = 1) => {
  const decrement = Math.max(1, Number.parseInt(String(amount), 10) || 1);

  try {
    // A root comment deletion may remove several direct replies. Use one atomic
    // pipeline update and clamp at zero instead of issuing N read/modify writes.
    await Audio.updateOne(
      { _id: audioId, isDeleted: false },
      [
        {
          $set: {
            commentCount: {
              $max: [
                0,
                {
                  $subtract: [
                    { $ifNull: ['$commentCount', 0] },
                    decrement,
                  ],
                },
              ],
            },
          },
        },
      ]
    );
  } catch (error) {
    console.warn('Audio comment-count decrement warning:', error?.message || error);
  }
};

// Add a root comment or one direct reply. Echoo intentionally supports one
// reply level; accepting replies-to-replies previously created comments that the
// read API could never display under the intended thread.
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

      const parentComment = await Comment.findOne({
        _id: parentCommentId,
        audioId,
        isDeleted: false,
      }).select('_id parentCommentId');

      if (!parentComment) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Parent comment not found for this audio',
          },
        });
      }

      if (parentComment.parentCommentId) {
        return res.status(400).json({
          error: {
            code: 'NESTED_REPLY_NOT_SUPPORTED',
            message: 'Reply to the original comment instead of replying to a reply.',
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

// Get root comments for currently-public audio. The response includes the first
// reply page inline and an honest replyCount; callers can page the complete
// direct-reply list through GET /comments/:commentId/replies.
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
    // We retain the full grouped count so the API never pretends that the ten
    // inline replies are the complete thread.
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
    const replyCounts = new Map();
    for (const reply of replies) {
      const key = String(reply.parentCommentId);
      replyCounts.set(key, (replyCounts.get(key) || 0) + 1);
      const list = repliesByParent.get(key) || [];
      if (list.length < INLINE_REPLY_LIMIT) list.push(reply);
      repliesByParent.set(key, list);
    }

    const commentsWithReplies = comments.map((comment) => {
      const key = String(comment._id);
      return {
        ...comment.toObject(),
        replies: repliesByParent.get(key) || [],
        replyCount: replyCounts.get(key) || 0,
      };
    });

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

export async function getCommentReplies(req, res, next) {
  try {
    const { commentId } = req.params;
    if (!validId(commentId)) return invalidId(res, 'comment');

    const parent = await Comment.findOne({
      _id: commentId,
      parentCommentId: null,
      isDeleted: false,
    }).select('_id audioId');

    if (!parent) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment thread not found' },
      });
    }

    const audio = await accessibleAudio(parent.audioId);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(
      MAX_COMMENT_PAGE_SIZE,
      Math.max(1, Number.parseInt(req.query.limit || '20', 10) || 20)
    );
    const filter = {
      audioId: parent.audioId,
      parentCommentId: parent._id,
      isDeleted: false,
    };

    const [replies, total] = await Promise.all([
      Comment.find(filter)
        .populate('author', 'username displayName avatar')
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Comment.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: replies,
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

    // A deleted root used to hide its replies from the read API while leaving
    // those records and Audio.commentCount behind. Keep one-level threads and
    // the denormalized count consistent by soft-deleting direct replies too.
    let deletedCount = 1;
    comment.isDeleted = true;
    await comment.save();

    if (!comment.parentCommentId) {
      const replies = await Comment.updateMany(
        {
          audioId: comment.audioId,
          parentCommentId: comment._id,
          isDeleted: false,
        },
        { $set: { isDeleted: true } }
      );
      deletedCount += Number(replies.modifiedCount) || 0;
    }

    await decrementCommentCountBestEffort(comment.audioId, deletedCount);

    return res.status(200).json({
      data: {
        message: 'Comment deleted successfully',
        deletedCount,
      },
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
