import Audio from '../models/Audio.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

// Get all content (with filters)
export async function getContent(req, res, next) {
  try {
    const userId = req.userId;
    const { 
      page = 1, 
      limit = 20, 
      status = 'all',
      search,
      sort = 'latest',
      type = 'all'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = { 
      artist: userId,
      isDeleted: false,
    };

    // Filter by status
    if (status === 'published') {
      filter.isPublic = true;
    } else if (status === 'draft') {
      filter.isPublic = false;
      filter.status = 'ready';
    } else if (status === 'scheduled') {
      filter.status = 'processing';
    }

    // Filter by type (audio vs broadcast)
    // For audio type, we use the Audio model
    // Broadcasts would be in a separate query

    // Search filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    // Sort options
    let sortOption = { createdAt: -1 };
    switch(sort) {
      case 'popular':
        sortOption = { playCount: -1 };
        break;
      case 'latest':
        sortOption = { createdAt: -1 };
        break;
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'title':
        sortOption = { title: 1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    // Get audio content
    const audioQuery = Audio.find(filter)
      .populate('artist', 'username displayName avatar')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    // If type is 'broadcast' only, we'd query Broadcast model
    // For now, return audio content with type indicator
    const audioContent = await audioQuery;

    const total = await Audio.countDocuments(filter);

    // Format content with type
    const content = audioContent.map(item => ({
      id: item._id,
      title: item.title,
      description: item.description,
      type: 'audio',
      duration: item.duration,
      genre: item.genre,
      fileUrl: item.fileUrl,
      playCount: item.playCount || 0,
      likeCount: item.likeCount || 0,
      status: item.isPublic ? 'published' : 'draft',
      isPublic: item.isPublic,
      tags: item.tags || [],
      coverArt: item.coverArt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      artist: item.artist ? {
        id: item.artist._id,
        username: item.artist.username,
        displayName: item.artist.displayName,
        avatar: item.artist.avatar,
      } : null,
    }));

    return res.status(200).json({
      data: {
        content,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
        filters: {
          status,
          type,
          sort,
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get content error:', error);
    next(error);
  }
}

// Get single content item
export async function getContentItem(req, res, next) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const audio = await Audio.findOne({
      _id: contentId,
      artist: userId,
      isDeleted: false,
    }).populate('artist', 'username displayName avatar bio');

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' }
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
        artist: audio.artist ? {
          id: audio.artist._id,
          username: audio.artist.username,
          displayName: audio.artist.displayName,
          avatar: audio.artist.avatar,
          bio: audio.artist.bio,
        } : null,
        createdAt: audio.createdAt,
        updatedAt: audio.updatedAt,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get content item error:', error);
    next(error);
  }
}

// Update content
export async function updateContent(req, res, next) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;
    const { 
      title, 
      description, 
      genre, 
      tags, 
      isPublic,
      coverArt,
      isDeleted 
    } = req.body;

    const audio = await Audio.findOne({
      _id: contentId,
      artist: userId,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' }
      });
    }

    // Update fields
    if (title !== undefined) audio.title = title;
    if (description !== undefined) audio.description = description;
    if (genre !== undefined) audio.genre = genre;
    if (tags !== undefined) {
      audio.tags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : tags;
    }
    if (isPublic !== undefined) audio.isPublic = isPublic;
    if (coverArt !== undefined) audio.coverArt = coverArt;
    if (isDeleted !== undefined) audio.isDeleted = isDeleted;

    await audio.save();

    // Update user's uploaded audio list if needed
    if (isPublic !== undefined) {
      // Could track published status in user model
    }

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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update content error:', error);
    next(error);
  }
}

// Delete content (soft delete)
export async function deleteContent(req, res, next) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const audio = await Audio.findOne({
      _id: contentId,
      artist: userId,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' }
      });
    }

    audio.isDeleted = true;
    await audio.save();

    return res.status(200).json({
      data: { 
        message: 'Content deleted successfully',
        id: contentId,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete content error:', error);
    next(error);
  }
}

// Publish content
export async function publishContent(req, res, next) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const audio = await Audio.findOne({
      _id: contentId,
      artist: userId,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' }
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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Publish content error:', error);
    next(error);
  }
}

// Unpublish content
export async function unpublishContent(req, res, next) {
  try {
    const { contentId } = req.params;
    const userId = req.userId;

    const audio = await Audio.findOne({
      _id: contentId,
      artist: userId,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Content not found' }
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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unpublish content error:', error);
    next(error);
  }
}

// Get content statistics
export async function getContentStats(req, res, next) {
  try {
    const userId = req.userId;

    const totalTracks = await Audio.countDocuments({
      artist: userId,
      isDeleted: false,
    });

    const publishedTracks = await Audio.countDocuments({
      artist: userId,
      isDeleted: false,
      isPublic: true,
    });

    const draftTracks = await Audio.countDocuments({
      artist: userId,
      isDeleted: false,
      isPublic: false,
    });

    const totalPlays = await Audio.aggregate([
      { $match: { artist: userId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$playCount' } } },
    ]);

    const totalLikes = await Audio.aggregate([
      { $match: { artist: userId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$likeCount' } } },
    ]);

    // Get recent content
    const recentContent = await Audio.find({
      artist: userId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title playCount likeCount createdAt isPublic');

    return res.status(200).json({
      data: {
        totalTracks,
        publishedTracks,
        draftTracks,
        totalPlays: totalPlays.length > 0 ? totalPlays[0].total : 0,
        totalLikes: totalLikes.length > 0 ? totalLikes[0].total : 0,
        recentContent: recentContent.map(item => ({
          id: item._id,
          title: item.title,
          plays: item.playCount || 0,
          likes: item.likeCount || 0,
          status: item.isPublic ? 'published' : 'draft',
          createdAt: item.createdAt,
        })),
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get content stats error:', error);
    next(error);
  }
}
