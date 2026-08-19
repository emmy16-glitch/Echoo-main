import fs from 'fs';
import path from 'path';
import Audio from '../models/Audio.js';
import Follow from '../models/Follow.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import { createGeneratedAudioCover } from '../utils/audioCover.js';

const safeDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

const creatorDisplayName = (user) =>
  user?.creatorProfile?.artistName ||
  user?.creatorProfile?.organizationName ||
  user?.displayName ||
  user?.username ||
  'Echoo Creator';

const activeCreatorIds = () =>
  User.distinct('_id', {
    userType: 'creator',
    isActive: true,
  });

const safeLocalMediaPath = (folder, filename) => {
  const basename = path.basename(String(filename || ''));
  if (!basename) return null;
  return path.join(process.cwd(), 'uploads', folder, basename);
};

const removeLocalFile = async (absolutePath) => {
  if (!absolutePath) return;
  try {
    await fs.promises.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Audio media cleanup warning:', error?.message || error);
    }
  }
};

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

    const creatorName = creatorDisplayName(creator);

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
    console.warn('New release notifications:', error.message);
  }
}

export async function uploadAudio(req, res, next) {
  try {
    const audioFile = req.files?.audio?.[0] || req.file || null;
    const coverFile = req.files?.cover?.[0] || null;

    if (!audioFile) {
      return res.status(400).json({
        error: { code: 'NO_FILE', message: 'No audio file uploaded' },
      });
    }

    const { title, description, genre, tags, isPublic, duration } = req.body;
    const cleanTitle = String(title || audioFile.originalname || 'Untitled Audio').trim();
    const cleanGenre = genre || 'Other';

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

    if (!Array.isArray(parsedTags)) parsedTags = [];

    let coverArt;
    let coverArtMode;
    let coverArtVariant = 0;

    if (coverFile?.filename) {
      coverArt = `/uploads/audio-covers/${coverFile.filename}`;
      coverArtMode = 'uploaded';
    } else {
      const generated = createGeneratedAudioCover({
        title: cleanTitle,
        artistName: creatorDisplayName(req.user),
        genre: cleanGenre,
      });
      coverArt = generated.dataUrl;
      coverArtMode = 'generated';
      coverArtVariant = generated.variant;
    }

    const audio = new Audio({
      title: cleanTitle,
      description: description || '',
      artist: req.userId,
      filename: audioFile.filename,
      originalName: audioFile.originalname,
      fileSize: audioFile.size,
      fileUrl: `/uploads/audio/${audioFile.filename}`,
      fileKey: audioFile.filename,
      mimeType: audioFile.mimetype,
      duration: safeDuration(duration),
      coverArt,
      coverArtMode,
      coverArtVariant,
      genre: cleanGenre,
      tags: parsedTags,
      isPublic: isPublic === 'true' || isPublic === true,
    });

    await audio.save();

    // From this point the media bytes and Mongo record belong together. The
    // upload error middleware must not delete files merely because a secondary
    // populate/notification step failed after the authoritative save.
    req.audioUploadCommitted = true;

    await notifyFollowersOfRelease(req.user, audio);

    let responseAudio = audio;
    try {
      responseAudio = await Audio.findById(audio._id).populate(
        'artist',
        'username displayName avatar creatorProfile.artistName creatorProfile.organizationName userType'
      ) || audio;
    } catch (populateError) {
      console.warn(
        'Audio upload populate warning:',
        populateError?.message || populateError
      );
    }

    return res.status(201).json({
      data: responseAudio,
      timestamp: new Date().toISOString(),
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

    // This route is intentionally public discovery. It must never become a way
    // to enumerate unpublished Creator Audio by omitting ?public=true.
    const filter = {
      isDeleted: false,
      isPublic: true,
    };

    if (req.query.genre) filter.genre = req.query.genre;
    if (req.query.search) filter.$text = { $search: req.query.search };
    if (req.query.userId) {
      filter.artist = req.query.userId;
    } else {
      filter.artist = { $in: await activeCreatorIds() };
    }

    const audio = await Audio.find(filter)
      .populate(
        'artist',
        'username displayName avatar creatorProfile.artistName creatorProfile.organizationName userType'
      )
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
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAudioById(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id).populate(
      'artist',
      'username displayName bio avatar creatorProfile.artistName creatorProfile.organizationName userType'
    );

    if (!audio || audio.isDeleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    if (!audio.isPublic && audio.artist._id.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this audio' },
      });
    }

    return res.status(200).json({
      data: audio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function downloadAudio(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id);

    if (!audio || audio.isDeleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    const isOwner = audio.artist.toString() === req.userId.toString();
    if (!audio.isPublic && !isOwner) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this audio' },
      });
    }

    const storedFilename = path.basename(String(audio.filename || audio.fileKey || ''));
    const absolutePath = path.join(process.cwd(), 'uploads', 'audio', storedFilename);

    if (!storedFilename || !fs.existsSync(absolutePath)) {
      return res.status(404).json({
        error: {
          code: 'AUDIO_FILE_MISSING',
          message: 'The audio record exists, but its local media file is missing on this backend.',
        },
      });
    }

    // The download endpoint serves the exact stored bytes. Echoo does not
    // decode, normalize, recompress or transcode audio during a download.
    res.setHeader('Cache-Control', 'private, no-transform');
    if (audio.mimeType) res.setHeader('Content-Type', audio.mimeType);

    return res.download(
      absolutePath,
      audio.originalName || storedFilename,
      (downloadError) => {
        if (downloadError && !res.headersSent) next(downloadError);
      }
    );
  } catch (error) {
    next(error);
  }
}

export async function updateAudio(req, res, next) {
  try {
    const { title, description, genre, tags, isPublic } = req.body;

    const audio = await Audio.findById(req.params.id);
    if (!audio || audio.isDeleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    if (audio.artist.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this audio' },
      });
    }

    const wasPublic = Boolean(audio.isPublic);
    const titleChanged = title && String(title).trim() !== audio.title;
    const genreChanged = genre && genre !== audio.genre;

    if (title) audio.title = String(title).trim();
    if (description !== undefined) audio.description = description;
    if (genre) audio.genre = genre;
    if (tags) {
      if (typeof tags === 'string') {
        audio.tags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      } else if (Array.isArray(tags)) {
        audio.tags = tags;
      }
    }
    if (isPublic !== undefined) audio.isPublic = isPublic === true || isPublic === 'true';

    if ((titleChanged || genreChanged) && audio.coverArtMode !== 'uploaded') {
      const generated = createGeneratedAudioCover({
        title: audio.title,
        artistName: creatorDisplayName(req.user),
        genre: audio.genre,
        variant: audio.coverArtVariant,
      });
      audio.coverArt = generated.dataUrl;
      audio.coverArtMode = 'generated';
      audio.coverArtVariant = generated.variant;
    }

    await audio.save();

    if (!wasPublic && audio.isPublic) {
      await notifyFollowersOfRelease(req.user, audio);
    }

    return res.status(200).json({
      data: audio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteAudio(req, res, next) {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio || audio.isDeleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    if (audio.artist.toString() !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not own this audio' },
      });
    }

    audio.isDeleted = true;
    await audio.save();

    const audioPath = safeLocalMediaPath(
      'audio',
      audio.filename || audio.fileKey
    );
    const coverPath =
      audio.coverArtMode === 'uploaded' && String(audio.coverArt || '').startsWith('/uploads/audio-covers/')
        ? safeLocalMediaPath('audio-covers', path.basename(audio.coverArt))
        : null;

    // Once the logical delete is durable, remove local bytes best-effort. The
    // record remains as an audit/tombstone while old static URLs stop working.
    await Promise.all([
      removeLocalFile(audioPath),
      removeLocalFile(coverPath),
    ]);

    return res.status(200).json({
      data: { message: 'Audio deleted successfully' },
      timestamp: new Date().toISOString(),
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
      isPublic: true,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    await audio.incrementPlays();

    return res.status(200).json({
      data: { playCount: audio.playCount },
      timestamp: new Date().toISOString(),
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
      isPublic: true,
    });

    if (!audio) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    await audio.incrementLikes();

    return res.status(200).json({
      data: { likeCount: audio.likeCount },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
