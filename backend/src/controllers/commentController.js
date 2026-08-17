import Comment from '../models/Comment.js';
import Audio from '../models/Audio.js';

// Add comment to audio
export async function addComment(req, res, next) {
  try {
    const { content, parentCommentId } = req.body;
    const { audioId } = req.params;

    if (!content) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Comment content is required' }
      });
    }

    // Check if audio exists
    const audio = await Audio.findById(audioId);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    // If parent comment, verify it exists
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Parent comment not found' }
        });
      }
    }

    const comment = new Comment({
      content,
      author: req.userId,
      audioId,
      parentCommentId: parentCommentId || null,
    });

    await comment.save();

    // Increment comment count on audio
    await audio.incrementComments();

    // Populate author info
    await comment.populate('author', 'username displayName avatar');

    return res.status(201).json({
      data: comment,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Get comments for audio
export async function getComments(req, res, next) {
  try {
    const { audioId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const comments = await Comment.find({
      audioId,
      parentCommentId: null, // Get top-level comments only
      isDeleted: false,
    })
      .populate('author', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get replies for each comment
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        const replies = await Comment.find({
          parentCommentId: comment._id,
          isDeleted: false,
        })
          .populate('author', 'username displayName avatar')
          .sort({ createdAt: 1 })
          .limit(10);

        return {
          ...comment.toObject(),
          replies,
        };
      })
    );

    const total = await Comment.countDocuments({
      audioId,
      parentCommentId: null,
      isDeleted: false,
    });

    return res.status(200).json({
      data: commentsWithReplies,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Update comment
export async function updateComment(req, res, next) {
  try {
    const { content } = req.body;
    const { commentId } = req.params;

    if (!content) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Comment content is required' }
      });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment not found' }
      });
    }

    // Check ownership
    if (comment.author.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this comment' }
      });
    }

    comment.content = content;
    await comment.save();

    return res.status(200).json({
      data: comment,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Delete comment
export async function deleteComment(req, res, next) {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment not found' }
      });
    }

    // Check ownership (allow admin to delete any comment)
    if (comment.author.toString() !== req.userId.toString() && !req.userRoles.includes('admin')) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to delete this comment' }
      });
    }

    comment.isDeleted = true;
    await comment.save();

    // Decrement comment count on audio
    const audio = await Audio.findById(comment.audioId);
    if (audio) {
      await audio.decrementComments();
    }

    return res.status(200).json({
      data: { message: 'Comment deleted successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

// Like comment
export async function likeComment(req, res, next) {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Comment not found' }
      });
    }

    // Check if user already liked
    const alreadyLiked = comment.likes.some(id => id.toString() === req.userId.toString());
    
    if (alreadyLiked) {
      // Unlike
      comment.likes = comment.likes.filter(id => id.toString() !== req.userId.toString());
      await comment.decrementLikes();
    } else {
      // Like
      comment.likes.push(req.userId);
      await comment.incrementLikes();
    }

    await comment.save();

    return res.status(200).json({
      data: { likeCount: comment.likeCount, liked: !alreadyLiked },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
