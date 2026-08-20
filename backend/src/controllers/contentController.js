import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import {
  boundedSearchText,
  escapeRegexLiteral,
} from '../utils/queryText.js';

const safePage = (value) => Math.max(1, Number.parseInt(value || '1', 10) || 1);
const safeLimit = (value) =>
  Math.min(100, Math.max(1, Number.parseInt(value || '20', 10) || 20));

const validContentId = (value) => mongoose.isValidObjectId(value);

const invalidContentId = (res) =>
  res.status(400).json({
    error: { code: 'INVALID_CONTENT_ID', message: 'Invalid content ID' },
  });

// Get creator-owned audio content with bounded filters.
export async function getContent(req, res, next) {
  try {
    const userId = req.userId;
    const page = safePage(req.query.page);
    const limit = safeLimit(req.query.limit);
    const status = String(req.query.status || 'all');
    const sort = String(req.query.sort || 'latest');
    const type = String(req.query.type || 'all');
    const skip = (page - 1) * limit;

    if (!['all', 'published', 'draft'].includes(status)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_CONTENT_STATUS',
          message: 'Content status must be all, published or draft',
        },
      });
    }

    // This resource is the creator's uploaded Audio library. Broadcasts have a
    // separate lifecycle/resource and must not be silently mislabeled as audio.
    if (!['all', 'audio'].includes(type)) {
      return res.status(400).json({
        error: {
          code: 'UNSUPPORTED_CONTENT_TYPE',
          message: 'This content endpoint currently supports audio only',
        },
      });
    }

    const filter = {
      artist: userId,
      isDeleted: false,
    };

    if (status === 'published') filter.isPublic = true;
    if (status === 'draft') filter.isPublic = false;

    if (req.query.search !== undefined) {
      const rawSearch = boundedSearchText(req.query.search, { maxLength: 120 });
      if (rawSearch) {
        const search = escapeRegexLiteral(rawSearch);
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } },
        ];
      }
    }

    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'popular':
        sortOption = { playCount: -1, createdAt: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'title':
        sortOption = { title: 1 };
        break;
      case 'latest':
      default:
        sortOption = { createdAt: -1 };
    }

    const [audioContent, total] = await Promise.all([
      Audio.find(filter)
        .populate('artist', 'username displayName avatar')
        .sort(sortOption)
        .skip(skip)
        .limit(limit),
      Audio.countDocuments(filter),
    ]);

    const content = audioContent.map((item) => ({
      id: item._id,
      title: item.title,
      description: item.description,
      type: 'audio',
      duration: item.duration,
      genre: item.genre,
      fileUrl: item.fileUrl,
      playCount: item.playCount || 0,
      likeCount: item.likeCount || 0,
      commentCount: item.commentCount || 0,
      status: item.isPublic ? 'published' : 'draft',
      isPublic: item.isPublic,
      tags: item.tags || [],
      coverArt: item.coverArt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      artist: item.artist
        ? {
            id: item.artist._id,
            username: item.artist.username,
            displayName: item.artist.displayName,
            avatar: item.artist.avatar,
          }
        : null,
    }));

    return res.status(200).json({
      data: {
        content,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        filters: { status, type, sort },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get content error:', error);
    next(error);
  }
}

export async function getContentItem(req, res, next) {
  try {
    const { contentId } = req.params;
    if (!validContentId(contentId)) return invalidContentId(res);

    const audio = await Audio.findOne({
      _id: contentId,
      artist: req.userId,
      isDeleted: false,
    }).populate('artist', 'username displayName avatar bio');

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    return res.status(200).json({
      data: {
        id: audio._id,
        title: audio.title,
        description: audio.description,
        type: 'audio',
        duration: audio.duration,
        genre: audio.genre,
        fileUrl: audio.fileUrl,
        fileSize: audio.fileSize,
        playCount: audio.playCount || 0,
        likeCount: audio.likeCount || 0,
        commentCount: audio.commentCount || 0,
        status: audio.isPublic ? 'published' : 'draft',
        isPublic: audio.isPublic,
        tags: audio.tags || [],
        coverArt: audio.coverArt,
        artist: audio.artist
          ? {
              id: audio.artist._id,
              username: audio.artist.username,
              displayName: audio.artist.displayName,
              avatar: audio.artist.avatar,
              bio: audio.artist.bio,
            }
          : null,
        createdAt: audio.createdAt,
        updatedAt: audio.updatedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get content item error:', error);
    next(error);
  }
}

export async function updateContent(req, res, next) {
  try {
    const { contentId } = req.params;
    if (!validContentId(contentId)) return invalidContentId(res);

    const audio = await Audio.findOne({
      _id: contentId,
      artist: req.userId,
      isDeleted: false,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    const { title, description, genre, tags, isPublic, coverArt } = req.body;
    if (title !== undefined) {
      const cleanTitle = String(title).trim();
      if (!cleanTitle) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Title cannot be empty' },
        });
      }
      audio.title = cleanTitle;
    }
    if (description !== undefined) audio.description = description;
    if (genre !== undefined) audio.genre = genre;
    if (tags !== undefined) {
      audio.tags = Array.isArray(tags)
        ? tags
        : String(tags).split(',').map((tag) => tag.trim()).filter(Boolean);
    }
    if (isPublic !== undefined) audio.isPublic = Boolean(isPublic);
    if (coverArt !== undefined) audio.coverArt = coverArt || null;

    // Soft deletion has a dedicated DELETE route. Generic PATCH must not be a
    // back door that can resurrect deleted records or bypass media cleanup.
    await audio.save();

    return res.status(200).json({
      data: {
        id: audio._id,
        title: audio.title,
        description: audio.description,
        genre: audio.genre,
        tags: audio.tags,
        isPublic: audio.isPublic,
        coverArt: audio.coverArt,
        status: audio.isPublic ? 'published' : 'draft',
        updatedAt: audio.updatedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Update content error:', error);
    next(error);
  }
}

export async function deleteContent(req, res, next) {
  try {
    const { contentId } = req.params;
    if (!validContentId(contentId)) return invalidContentId(res);

    const audio = await Audio.findOne({
      _id: contentId,
      artist: req.userId,
      isDeleted: false,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    audio.isDeleted = true;
    audio.isPublic = false;
    await audio.save();

    return res.status(200).json({
      data: {
        message: 'Content deleted successfully',
        id: contentId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Delete content error:', error);
    next(error);
  }
}

export async function publishContent(req, res, next) {
  try {
    const { contentId } = req.params;
    if (!validContentId(contentId)) return invalidContentId(res);

    const audio = await Audio.findOne({
      _id: contentId,
      artist: req.userId,
      isDeleted: false,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    audio.isPublic = true;
    await audio.save();

    return res.status(200).json({
      data: {
        id: audio._id,
        title: audio.title,
        status: 'published',
        message: 'Content published successfully',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Publish content error:', error);
    next(error);
  }
}

export async function unpublishContent(req, res, next) {
  try {
    const { contentId } = req.params;
    if (!validContentId(contentId)) return invalidContentId(res);

    const audio = await Audio.findOne({
      _id: contentId,
      artist: req.userId,
      isDeleted: false,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' },
      });
    }

    audio.isPublic = false;
    await audio.save();

    return res.status(200).json({
      data: {
        id: audio._id,
        title: audio.title,
        status: 'draft',
        message: 'Content unpublished successfully',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Unpublish content error:', error);
    next(error);
  }
}

export async function getContentStats(req, res, next) {
  try {
    const userId = req.userId;
    const artistObjectId = new mongoose.Types.ObjectId(userId);

    const [
      totalTracks,
      publishedTracks,
      draftTracks,
      aggregateTotals,
      recentContent,
    ] = await Promise.all([
      Audio.countDocuments({ artist: userId, isDeleted: false }),
      Audio.countDocuments({ artist: userId, isDeleted: false, isPublic: true }),
      Audio.countDocuments({ artist: userId, isDeleted: false, isPublic: false }),
      Audio.aggregate([
        { $match: { artist: artistObjectId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalPlays: { $sum: '$playCount' },
            totalLikes: { $sum: '$likeCount' },
          },
        },
      ]),
      Audio.find({ artist: userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title playCount likeCount createdAt isPublic'),
    ]);

    const totals = aggregateTotals[0] || {};

    return res.status(200).json({
      data: {
        totalTracks,
        publishedTracks,
        draftTracks,
        totalPlays: Number(totals.totalPlays) || 0,
        totalLikes: Number(totals.totalLikes) || 0,
        recentContent: recentContent.map((item) => ({
          id: item._id,
          title: item.title,
          plays: item.playCount || 0,
          likes: item.likeCount || 0,
          status: item.isPublic ? 'published' : 'draft',
          createdAt: item.createdAt,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get content stats error:', error);
    next(error);
  }
}
