import Recording from '../models/Recording.js';
import Broadcast from '../models/Broadcast.js';
import Audio from '../models/Audio.js';
import User from '../models/User.js';

// Get recordings for a creator
export async function getRecordings(req, res, next) {
  try {
    const userId = req.userId;
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = { creator: userId, isDeleted: false };

    if (status !== 'all') {
      filter.status = status;
    }

    const recordings = await Recording.find(filter)
      .populate('broadcastId', 'title startedAt')
      .populate('audioId', 'title duration genre')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Recording.countDocuments(filter);

    return res.status(200).json({
      data: {
        recordings: recordings.map(r => ({
          id: r._id,
          title: r.title || 'Untitled Recording',
          description: r.description || '',
          status: r.status,
          duration: r.duration,
          fileSize: r.fileSize,
          fileUrl: r.fileUrl,
          isPublic: r.isPublic,
          broadcast: r.broadcastId,
          audio: r.audioId,
          processingError: r.processingError,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
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
    console.error('Get recordings error:', error);
    next(error);
  }
}

// Publish recording
export async function publishRecording(req, res, next) {
  try {
    const userId = req.userId;
    const { recordingId } = req.params;
    const { title, description, isPublic = true } = req.body;

    const recording = await Recording.findOne({
      _id: recordingId,
      creator: userId,
      isDeleted: false,
    });

    if (!recording) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording not found' }
      });
    }

    if (recording.status === 'processing') {
      return res.status(400).json({
        error: { code: 'PROCESSING', message: 'Recording is still processing' }
      });
    }

    if (recording.status === 'failed') {
      return res.status(400).json({
        error: { code: 'FAILED', message: 'Recording failed processing' }
      });
    }

    // Update recording
    if (title) recording.title = title;
    if (description !== undefined) recording.description = description;
    recording.isPublic = isPublic;
    recording.status = 'published';
    recording.publishedAt = new Date();
    await recording.save();

    return res.status(200).json({
      data: {
        recording,
        message: 'Recording published successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Publish recording error:', error);
    next(error);
  }
}

// Unpublish recording
export async function unpublishRecording(req, res, next) {
  try {
    const userId = req.userId;
    const { recordingId } = req.params;

    const recording = await Recording.findOne({
      _id: recordingId,
      creator: userId,
      isDeleted: false,
    });

    if (!recording) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording not found' }
      });
    }

    if (recording.status !== 'published') {
      return res.status(400).json({
        error: { code: 'INVALID_STATE', message: 'Recording is not published' }
      });
    }

    recording.isPublic = false;
    recording.status = 'draft';
    await recording.save();

    return res.status(200).json({
      data: {
        recording,
        message: 'Recording unpublished successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unpublish recording error:', error);
    next(error);
  }
}

// Delete recording
export async function deleteRecording(req, res, next) {
  try {
    const userId = req.userId;
    const { recordingId } = req.params;

    const recording = await Recording.findOne({
      _id: recordingId,
      creator: userId,
      isDeleted: false,
    });

    if (!recording) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recording not found' }
      });
    }

    recording.isDeleted = true;
    await recording.save();

    // Also remove from related broadcast
    await Broadcast.findOneAndUpdate(
      { recordingId: recording._id },
      { recordingId: null }
    );

    return res.status(200).json({
      data: {
        message: 'Recording deleted successfully',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete recording error:', error);
    next(error);
  }
}
