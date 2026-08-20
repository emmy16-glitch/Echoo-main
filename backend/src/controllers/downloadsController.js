import mongoose from 'mongoose';
import Download from '../models/Download.js';
import Audio from '../models/Audio.js';

const DOWNLOAD_STATUSES = new Set([
  'pending',
  'downloading',
  'completed',
  'failed',
  'paused',
]);
const DOWNLOAD_QUALITIES = new Set(['low', 'medium', 'high']);

const invalidId = (res, label) =>
  res.status(400).json({
    error: {
      code: `INVALID_${label.toUpperCase()}_ID`,
      message: `Invalid ${label} ID`,
    },
  });

const publicTrackLookupStages = () => [
  {
    $lookup: {
      from: 'echoo_audios',
      localField: 'trackId',
      foreignField: '_id',
      as: 'track',
    },
  },
  { $unwind: '$track' },
  {
    $match: {
      'track.isDeleted': false,
      'track.isPublic': true,
    },
  },
];

const publicTrackProjection = {
  _id: 1,
  userId: 1,
  trackId: 1,
  status: 1,
  progress: 1,
  fileSize: 1,
  downloadedSize: 1,
  quality: 1,
  createdAt: 1,
  expiresAt: 1,
  'track._id': 1,
  'track.title': 1,
  'track.duration': 1,
  'track.artist': 1,
  'track.genre': 1,
};

const formatDownload = (download) => ({
  id: download._id,
  track: download.track
    ? {
        id: download.track._id,
        title: download.track.title,
        duration: download.track.duration,
        genre: download.track.genre,
        artist: download.track.artist,
      }
    : null,
  trackId: download.track?._id || download.trackId,
  status: download.status,
  progress: Number(download.progress) || 0,
  fileSize: Number(download.fileSize) || 0,
  downloadedSize: Number(download.downloadedSize) || 0,
  quality: download.quality,
  createdAt: download.createdAt,
  expiresAt: download.expiresAt,
});

// Request download metadata. Browser Cache Storage owns the actual offline bytes.
export async function requestDownload(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId } = req.body;
    const quality = String(req.body?.quality || 'medium');

    if (!trackId || !mongoose.isValidObjectId(trackId)) {
      return invalidId(res, 'track');
    }
    if (!DOWNLOAD_QUALITIES.has(quality)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_DOWNLOAD_QUALITY',
          message: 'Download quality must be low, medium or high',
        },
      });
    }

    const track = await Audio.findOne({
      _id: trackId,
      isDeleted: false,
      isPublic: true,
    }).select('_id title artist fileSize');

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Public track not found' },
      });
    }

    // The compound unique index includes soft-deleted rows. Reusing that row is
    // required for a listener to download the same track again after removing it.
    let download = await Download.findOne({ userId, trackId });
    if (download && !download.isDeleted) {
      return res.status(400).json({
        error: { code: 'ALREADY_DOWNLOADED', message: 'Track already downloaded' },
      });
    }

    if (download) {
      download.isDeleted = false;
      download.quality = quality;
      download.fileSize = Number(track.fileSize) || 0;
      download.downloadedSize = 0;
      download.progress = 0;
      download.status = 'pending';
      download.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await download.save();
    } else {
      try {
        download = await Download.create({
          userId,
          trackId,
          quality,
          fileSize: track.fileSize,
          status: 'pending',
        });
      } catch (error) {
        if (error?.code === 11000) {
          return res.status(409).json({
            error: {
              code: 'ALREADY_DOWNLOADED',
              message: 'A download record already exists for this track',
            },
          });
        }
        throw error;
      }
    }

    return res.status(201).json({
      data: {
        download: {
          id: download._id,
          trackId: track._id,
          track: {
            id: track._id,
            title: track.title,
            artist: track.artist,
          },
          status: download.status,
          progress: download.progress,
          quality: download.quality,
          fileSize: download.fileSize,
        },
        message: 'Download requested successfully',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Request download error:', error);
    next(error);
  }
}

// Get all download metadata whose source audio is still public and available.
export async function getDownloads(req, res, next) {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '20', 10) || 20));
    const status = req.query.status ? String(req.query.status) : '';

    if (status && !DOWNLOAD_STATUSES.has(status)) {
      return res.status(400).json({
        error: { code: 'INVALID_DOWNLOAD_STATUS', message: 'Invalid download status' },
      });
    }

    const match = { userId, isDeleted: false };
    if (status) match.status = status;

    const [result] = await Download.aggregate([
      { $match: match },
      ...publicTrackLookupStages(),
      {
        $facet: {
          items: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: publicTrackProjection },
          ],
          count: [{ $count: 'value' }],
        },
      },
    ]);

    const items = result?.items || [];
    const total = result?.count?.[0]?.value || 0;

    return res.status(200).json({
      data: {
        downloads: items.map(formatDownload),
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
    console.error('Get downloads error:', error);
    next(error);
  }
}

// Get single download
export async function getDownload(req, res, next) {
  try {
    const { downloadId } = req.params;
    if (!mongoose.isValidObjectId(downloadId)) return invalidId(res, 'download');

    const [download] = await Download.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(downloadId),
          userId: new mongoose.Types.ObjectId(req.userId),
          isDeleted: false,
        },
      },
      ...publicTrackLookupStages(),
      { $project: publicTrackProjection },
      { $limit: 1 },
    ]);

    if (!download) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Download not found or track unavailable' },
      });
    }

    return res.status(200).json({
      data: formatDownload(download),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get download error:', error);
    next(error);
  }
}

// Update download progress
export async function updateDownloadProgress(req, res, next) {
  try {
    const { downloadId } = req.params;
    if (!mongoose.isValidObjectId(downloadId)) return invalidId(res, 'download');

    const download = await Download.findOne({
      _id: downloadId,
      userId: req.userId,
      isDeleted: false,
    });

    if (!download) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Download not found' },
      });
    }

    const trackAvailable = await Audio.exists({
      _id: download.trackId,
      isDeleted: false,
      isPublic: true,
    });
    if (!trackAvailable) {
      return res.status(404).json({
        error: { code: 'TRACK_UNAVAILABLE', message: 'This track is no longer publicly available' },
      });
    }

    const { progress, downloadedSize, status } = req.body;

    if (progress !== undefined) {
      const value = Number(progress);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return res.status(400).json({
          error: { code: 'INVALID_PROGRESS', message: 'progress must be between 0 and 100' },
        });
      }
      download.progress = value;
    }

    if (downloadedSize !== undefined) {
      const value = Number(downloadedSize);
      const max = Math.max(0, Number(download.fileSize) || 0);
      if (!Number.isFinite(value) || value < 0 || (max > 0 && value > max)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_DOWNLOADED_SIZE',
            message: 'downloadedSize must be non-negative and cannot exceed fileSize',
          },
        });
      }
      download.downloadedSize = value;
    }

    if (status !== undefined) {
      const nextStatus = String(status);
      if (!DOWNLOAD_STATUSES.has(nextStatus)) {
        return res.status(400).json({
          error: { code: 'INVALID_DOWNLOAD_STATUS', message: 'Invalid download status' },
        });
      }
      download.status = nextStatus;
    }

    if (Number(download.progress) >= 100 || download.status === 'completed') {
      download.progress = 100;
      download.status = 'completed';
    }

    await download.save();

    return res.status(200).json({
      data: {
        download: {
          id: download._id,
          status: download.status,
          progress: download.progress,
          downloadedSize: download.downloadedSize,
        },
        message: 'Download progress updated',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Update download progress error:', error);
    next(error);
  }
}

// Delete download
export async function deleteDownload(req, res, next) {
  try {
    const { downloadId } = req.params;
    if (!mongoose.isValidObjectId(downloadId)) return invalidId(res, 'download');

    const download = await Download.findOne({
      _id: downloadId,
      userId: req.userId,
      isDeleted: false,
    });

    if (!download) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Download not found' },
      });
    }

    download.isDeleted = true;
    download.status = 'pending';
    download.progress = 0;
    download.downloadedSize = 0;
    await download.save();

    return res.status(200).json({
      data: { message: 'Download removed successfully', deleted: true },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Delete download error:', error);
    next(error);
  }
}

// Get download stats for sources that are still public.
export async function getDownloadStats(req, res, next) {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    const [stats] = await Download.aggregate([
      { $match: { userId, isDeleted: false } },
      ...publicTrackLookupStages(),
      {
        $group: {
          _id: null,
          totalDownloads: { $sum: 1 },
          completedDownloads: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          pendingDownloads: {
            $sum: {
              $cond: [
                { $in: ['$status', ['pending', 'downloading', 'paused']] },
                1,
                0,
              ],
            },
          },
          totalSize: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$fileSize', 0] },
          },
        },
      },
    ]);

    return res.status(200).json({
      data: {
        totalDownloads: stats?.totalDownloads || 0,
        completedDownloads: stats?.completedDownloads || 0,
        pendingDownloads: stats?.pendingDownloads || 0,
        totalSize: stats?.totalSize || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get download stats error:', error);
    next(error);
  }
}
