import Audio from '../models/Audio.js';
import Follow from '../models/Follow.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';

async function notifyFollowersOfRelease(creator, audio) {
  if (!audio?.isPublic) return;

  try {
    const relationships = await Follow.find({
      following: creator._id,
      status: 'accepted',
    }).select('follower');

    const followerIds = relationships.map((item) => item.follower).filter(Boolean);
    if (!followerIds.length) return;

    const recipients = await User.find({
      _id: { $in: followerIds },
      isActive: true,
      'preferences.notifications.newReleases': { $ne: false },
    }).select('_id');

    const creatorName =
      creator.displayName ||
      creator.creatorProfile?.artistName ||
      creator.creatorProfile?.organizationName ||
      creator.username ||
      'A creator you follow';

    await Promise.all(
      recipients.map((recipient) =>
        createNotification(
          recipient._id,
          'new_release',
          `New audio from ${creatorName}`.slice(0, 200),
          `${audio.title} is now available to listen to on Echoo.`.slice(0, 500),
          `/listen/creator/${creator._id}`,
          {
            creatorId: String(creator._id),
            audioId: String(audio._id),
          }
        )
      )
    );
  } catch (error) {
    // Publishing must succeed even if optional notification fan-out fails.
    console.warn('New release notifications:', error.message);
  }
}

export async function uploadAudio(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No audio file uploaded' }
      });
    }

    const { title, description, genre, tags, isPublic } = req.body;

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = JSON.parse(tags);
      } catch {
        parsedTags = String(tags)
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    }

    const audio = new Audio({
      title: title || req.file.originalname,
      description: description || '',
      artist: req.userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      fileUrl: `/uploads/audio/${req.file.filename}`,
      fileKey: req.file.filename,
      mimeType: req.file.mimetype,
      genre: genre || 'Other',
      tags: parsedTags,
      isPublic: isPublic === 'true' || isPublic === true,
    });

    await audio.save();
    await notifyFollowersOfRelease(req.user, audio);

    return res.status(201).json({
      data: audio,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Upload error:', error);
    next(error);
  }
}

export async function getAudio(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const filter = { isDeleted: false };

    if (req.query.public === 'true') {
      filter.isPublic = true;
    }
    if (req.query.genre) {
      filter.genre = req.query.genre;
    }
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }
    if (req.query.userId) {
      filter.artist = req.query.userId;
    }

    const audio = await Audio.find(filter)
      .populate('artist', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Audio.countDocuments(filter);

    return res.status(200).json({
      data: audio,
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

export async function getAudioById(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id)
      .populate('artist', 'username displayName bio avatar');

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    if (!audio.isPublic && audio.artist._id.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this audio' }
      });
    }

    return res.status(200).json({
      data: audio,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAudio(req, res, next) {
  try {
    const { title, description, genre, tags, isPublic } = req.body;

    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    if (audio.artist.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this audio' }
      });
    }

    const wasPublic = Boolean(audio.isPublic);

    if (title) audio.title = title;
    if (description !== undefined) audio.description = description;
    if (genre) audio.genre = genre;
    if (tags) {
      if (typeof tags === 'string') {
        audio.tags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      } else {
        audio.tags = tags;
      }
    }
    if (isPublic !== undefined) audio.isPublic = isPublic === true || isPublic === 'true';

    await audio.save();

    // A previously private upload becoming public is effectively a new release.
    if (!wasPublic && audio.isPublic) {
      await notifyFollowersOfRelease(req.user, audio);
    }

    return res.status(200).json({
      data: audio,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAudio(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    if (audio.artist.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this audio' }
      });
    }

    audio.isDeleted = true;
    await audio.save();

    return res.status(200).json({
      data: { message: 'Audio deleted successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function incrementPlays(req, res, next) {
  try {
    const audio = await Audio.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    await audio.incrementPlays();

    return res.status(200).json({
      data: { playCount: audio.playCount },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}

export async function toggleLike(req, res, next) {
  try {
    const audio = await Audio.findOne({
      _id: req.params.id,
      isDeleted: false,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' }
      });
    }

    await audio.incrementLikes();

    return res.status(200).json({
      data: { likeCount: audio.likeCount },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
}
