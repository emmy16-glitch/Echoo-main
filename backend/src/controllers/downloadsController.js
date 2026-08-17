import Download from '../models/Download.js';
import Audio from '../models/Audio.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Request download
export async function requestDownload(req, res, next) {
  try {
    const userId = req.userId;
    const { trackId, quality = 'medium' } = req.body;

    if (!trackId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Track ID is required' }
      });
    }

    // Check if track exists
    const track = await Audio.findOne({
      _id: trackId,
      isDeleted: false,
    });

    if (!track) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Track not found' }
      });
    }

    // Check if track is public
    if (!track.isPublic) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'This track is not available for download' }
      });
    }

    // Check if already downloaded
    const existingDownload = await Download.findOne({
      userId,
      trackId,
      isDeleted: false,
    });

    if (existingDownload) {
      return res.status(400).json({
        error: { code: 'ALREADY_DOWNLOADED', message: 'Track already downloaded' }
      });
    }

    // Create download record
    const download = new Download({
      userId,
      trackId,
      quality,
      fileSize: track.fileSize,
      status: 'pending',
    });

    await download.save();

    return res.status(201).json({
      data: {
        download: {
          id: download._id,
          track: {
            id: track._id,
            title: track.title,
            artist: track.artist,
          },
          status: download.status,
          quality: download.quality,
          fileSize: download.fileSize,
        },
        message: 'Download requested successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Request download error:', error);
    next(error);
  }
}

// Get all downloads
export async function getDownloads(req, res, next) {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = { userId, isDeleted: false };

    if (status) {
      filter.status = status;
    }

    const downloads = await Download.find(filter)
      .populate('trackId', 'title duration artist genre fileUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Download.countDocuments(filter);

    return res.status(200).json({
      data: {
        downloads: downloads.map(d => ({
          id: d._id,
          track: d.trackId ? {
            id: d.trackId._id,
            title: d.trackId.title,
            duration: d.trackId.duration,
            genre: d.trackId.genre,
            artist: d.trackId.artist,
          } : null,
          status: d.status,
          progress: d.progress,
          fileSize: d.fileSize,
          downloadedSize: d.downloadedSize,
          quality: d.quality,
          createdAt: d.createdAt,
          expiresAt: d.expiresAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get downloads error:', error);
    next(error);
  }
}

// Get single download
export async function getDownload(req, res, next) {
  try {
    const userId = req.userId;
    const { downloadId } = req.params;

    const download = await Download.findOne({
      _id: downloadId,
      userId,
      isDeleted: false,
    }).populate('trackId', 'title duration artist genre fileUrl');

    if (!download) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Download not found' }
      });
    }

    return res.status(200).json({
      data: {
        id: download._id,
        track: download.trackId ? {
          id: download.trackId._id,
          title: download.trackId.title,
          duration: download.trackId.duration,
          genre: download.trackId.genre,
          artist: download.trackId.artist,
          fileUrl: download.trackId.fileUrl,
        } : null,
        status: download.status,
        progress: download.progress,
        fileSize: download.fileSize,
        downloadedSize: download.downloadedSize,
        quality: download.quality,
        createdAt: download.createdAt,
        expiresAt: download.expiresAt,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get download error:', error);
    next(error);
  }
}

// Update download progress
export async function updateDownloadProgress(req, res, next) {
  try {
    const userId = req.userId;
    const { downloadId } = req.params;
    const { progress, downloadedSize, status } = req.body;

    const download = await Download.findOne({
      _id: downloadId,
      userId,
      isDeleted: false,
    });

    if (!download) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Download not found' }
      });
    }

    if (progress !== undefined) download.progress = progress;
    if (downloadedSize !== undefined) download.downloadedSize = downloadedSize;
    if (status) download.status = status;

    if (progress === 100) {
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
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update download progress error:', error);
    next(error);
  }
}

// Delete download
export async function deleteDownload(req, res, next) {
  try {
    const userId = req.userId;
    const { downloadId } = req.params;

    const download = await Download.findOne({
      _id: downloadId,
      userId,
      isDeleted: false,
    });

    if (!download) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Download not found' }
      });
    }

    download.isDeleted = true;
    await download.save();

    return res.status(200).json({
      data: {
        message: 'Download removed successfully',
        deleted: true,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete download error:', error);
    next(error);
  }
}

// Get download stats
export async function getDownloadStats(req, res, next) {
  try {
    const userId = req.userId;

    const totalDownloads = await Download.countDocuments({
      userId,
      isDeleted: false,
    });

    const completedDownloads = await Download.countDocuments({
      userId,
      isDeleted: false,
      status: 'completed',
    });

    const pendingDownloads = await Download.countDocuments({
      userId,
      isDeleted: false,
      status: { $in: ['pending', 'downloading', 'paused'] },
    });

    // Get total download size
    const totalSize = await Download.aggregate([
      { $match: { userId, isDeleted: false, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$fileSize' } } },
    ]);

    return res.status(200).json({
      data: {
        totalDownloads,
        completedDownloads,
        pendingDownloads,
        totalSize: totalSize.length > 0 ? totalSize[0].total : 0,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get download stats error:', error);
    next(error);
  }
}
