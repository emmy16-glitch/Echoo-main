import mongoose from 'mongoose';
import User from '../models/User.js';
import Audio from '../models/Audio.js';
import Playlist from '../models/Playlist.js';

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function invalidTrackId(res) {
  return res.status(400).json({
    error: { code: 'INVALID_TRACK_ID', message: 'Invalid track ID' },
  });
}

export async function saveTrack(req, res, next) {
  try {
    const { trackId } = req.params;
    if (!validId(trackId)) return invalidTrackId(res);

    const track = await Audio.findOne({
      _id: trackId,
      isDeleted: false,
      isPublic: true,
    }).select('_id');

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Public track not found' },
      });
    }

    const result = await User.findByIdAndUpdate(
      req.userId,
      { $addToSet: { savedAudio: track._id } },
      { new: true }
    ).select('_id savedAudio');

    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    return res.status(200).json({
      data: {
        message: 'Track saved successfully',
        trackId: String(track._id),
        saved: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function unsaveTrack(req, res, next) {
  try {
    const { trackId } = req.params;
    if (!validId(trackId)) return invalidTrackId(res);

    const result = await User.findByIdAndUpdate(
      req.userId,
      { $pull: { savedAudio: trackId } },
      { new: true }
    ).select('_id');

    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    return res.status(200).json({
      data: {
        message: 'Track removed from library',
        trackId,
        saved: false,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSavedTracks(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const user = await User.findById(req.userId).select('savedAudio');
    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const savedIds = Array.isArray(user.savedAudio) ? user.savedAudio : [];
    const total = await Audio.countDocuments({
      _id: { $in: savedIds },
      isDeleted: false,
      isPublic: true,
    });

    const tracks = await Audio.find({
      _id: { $in: savedIds },
      isDeleted: false,
      isPublic: true,
    })
      .populate('artist', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        'title description duration genre fileUrl coverArt playCount likeCount artist createdAt'
      );

    return res.status(200).json({
      data: {
        tracks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function checkSaved(req, res, next) {
  try {
    const { trackId } = req.params;
    if (!validId(trackId)) return invalidTrackId(res);

    const user = await User.findOne({
      _id: req.userId,
      savedAudio: trackId,
    }).select('_id');

    return res.status(200).json({
      data: {
        saved: Boolean(user),
        trackId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getLibraryStats(req, res, next) {
  try {
    const user = await User.findById(req.userId).select(
      'savedAudio listeningHistory'
    );

    if (!user) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    const [savedTracks, playlists] = await Promise.all([
      Audio.countDocuments({
        _id: { $in: user.savedAudio || [] },
        isDeleted: false,
        isPublic: true,
      }),
      Playlist.countDocuments({
        owner: req.userId,
        isDeleted: false,
      }),
    ]);

    return res.status(200).json({
      data: {
        savedTracks,
        playlists,
        totalSaved: savedTracks + playlists,
        listeningHistory: Array.isArray(user.listeningHistory)
          ? user.listeningHistory.length
          : 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
