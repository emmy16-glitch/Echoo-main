import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import Playlist from '../models/Playlist.js';
import Broadcast from '../models/Broadcast.js';
import SavedMoment from '../models/SavedMoment.js';
import TranscriptSegment from '../models/TranscriptSegment.js';
import Follow from '../models/Follow.js';
import User from '../models/User.js';
import { createNotification } from './notificationController.js';
import { createGeneratedAudioCover } from '../utils/audioCover.js';
import { canAccessReplayAudio } from '../services/assetAccessService.js';
import { archiveRecordingAudio } from '../services/audioArchiveService.js';
import { trimAudioFile } from '../services/audioTrimService.js';
import { sendGeneratedCover } from '../utils/generatedCoverResponse.js';

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

export async function getAudioCover(req, res, next) {
  try {
    const audio = await Audio.findOne({
      _id: req.params.id,
      isDeleted: false,
      isPublic: true,
    }).select('coverArt');

    if (!audio || !sendGeneratedCover(res, audio.coverArt)) {
      return res.status(404).json({
        error: { code: 'COVER_NOT_FOUND', message: 'Audio cover not found' },
      });
    }

    return undefined;
  } catch (error) {
    return next(error);
  }
}

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

const removeIncomingUploadFiles = async (audioFile, coverFile) => {
  await Promise.all([
    removeLocalFile(audioFile?.path),
    removeLocalFile(coverFile?.path),
  ]);
};

const populatedAudioById = (id) => Audio.findById(id)
  .populate(
    'artist',
    'username displayName avatar creatorProfile.artistName creatorProfile.organizationName userType'
  )
  .populate(
    'sourceBroadcast',
    'title description startedAt endedAt station creator assetStatus assetVisibility generatedHighlights generatedChapters'
  );

const reconcileExistingReplay = async ({ sourceBroadcast, existingAudio, audioFile, coverFile, req, res }) => {
  await removeIncomingUploadFiles(audioFile, coverFile);
  await Broadcast.updateOne(
    { _id: sourceBroadcast._id },
    {
      $set: {
        replayAudio: existingAudio._id,
        recordingUrl: String(existingAudio._id),
        'assetStatus.audio': 'ready',
        'assetVisibility.audio': existingAudio.visibility || 'private',
      },
    }
  );
  await Promise.all([
    TranscriptSegment.updateMany(
      { broadcastId: sourceBroadcast._id, isFinal: true, audioId: null },
      { $set: { audioId: existingAudio._id } }
    ),
    SavedMoment.updateMany(
      { broadcastId: sourceBroadcast._id, audioId: null },
      { $set: { audioId: existingAudio._id } }
    ),
  ]);
  req.audioUploadCommitted = true;
  const responseAudio = await populatedAudioById(existingAudio._id).catch(() => existingAudio);
  return res.status(200).json({
    data: responseAudio || existingAudio,
    reconciled: true,
    timestamp: new Date().toISOString(),
  });
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

    const { title, description, genre, tags, isPublic, duration, broadcastId } = req.body;
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

    let sourceBroadcast = null;
    if (broadcastId) {
      if (!mongoose.isValidObjectId(broadcastId)) {
        const error = new Error('Invalid broadcast ID');
        error.status = 400;
        error.code = 'INVALID_BROADCAST_ID';
        throw error;
      }
      sourceBroadcast = await Broadcast.findOne({
        _id: broadcastId,
        creator: req.userId,
        isDeleted: false,
        status: 'completed',
      });
      if (!sourceBroadcast) {
        const error = new Error('The completed broadcast could not be linked to this replay.');
        error.status = 409;
        error.code = 'BROADCAST_NOT_READY_FOR_REPLAY';
        throw error;
      }

      // The broadcast ID is the replay idempotency key. A client may retry
      // after the server committed an upload but its response was lost; in
      // that case discard the retry bytes and return the canonical replay.
      const existingReplay = await Audio.findOne({
        sourceBroadcast: sourceBroadcast._id,
        artist: req.userId,
        isDeleted: false,
      });
      if (existingReplay) {
        return await reconcileExistingReplay({
          sourceBroadcast,
          existingAudio: existingReplay,
          audioFile,
          coverFile,
          req,
          res,
        });
      }
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
      isPublic: sourceBroadcast ? false : (isPublic === 'true' || isPublic === true),
      visibility: sourceBroadcast ? 'private' : ((isPublic === 'true' || isPublic === true) ? 'public' : 'private'),
      publicationStatus: sourceBroadcast ? 'draft' : ((isPublic === 'true' || isPublic === true) ? 'published' : 'draft'),
      publishedAt: sourceBroadcast ? null : ((isPublic === 'true' || isPublic === true) ? new Date() : null),
      sourceBroadcast: sourceBroadcast?._id || null,
    });

    try {
      await audio.save();
    } catch (saveError) {
      if (sourceBroadcast && saveError?.code === 11000) {
        const existingReplay = await Audio.findOne({
          sourceBroadcast: sourceBroadcast._id,
          artist: req.userId,
          isDeleted: false,
        });
        if (existingReplay) {
          return await reconcileExistingReplay({
            sourceBroadcast,
            existingAudio: existingReplay,
            audioFile,
            coverFile,
            req,
            res,
          });
        }
      }
      throw saveError;
    }

    if (sourceBroadcast) {
      const previousReplayAudio = sourceBroadcast.replayAudio || null;
      const previousRecordingUrl = sourceBroadcast.recordingUrl || null;
      try {
        if (previousReplayAudio) {
          const error = new Error('This broadcast already has a replay recording.');
          error.status = 409;
          error.code = 'REPLAY_ALREADY_EXISTS';
          throw error;
        }
        sourceBroadcast.replayAudio = audio._id;
        sourceBroadcast.recordingUrl = String(audio._id);
        sourceBroadcast.assetStatus.audio = 'ready';
        sourceBroadcast.assetVisibility.audio = 'private';
        await sourceBroadcast.save();
        await TranscriptSegment.updateMany(
          { broadcastId: sourceBroadcast._id, isFinal: true },
          { $set: { audioId: audio._id } }
        );
        await SavedMoment.updateMany(
          { broadcastId: sourceBroadcast._id, audioId: null },
          { $set: { audioId: audio._id } }
        );
        req.app.get('io')?.to(`broadcast:${sourceBroadcast._id}:creator`).emit('replay:ready', {
          broadcastId: String(sourceBroadcast._id),
          audioId: String(audio._id),
        });
      } catch (linkError) {
        await Broadcast.updateOne(
          { _id: sourceBroadcast._id, replayAudio: audio._id },
          {
            $set: {
              replayAudio: previousReplayAudio,
              recordingUrl: previousRecordingUrl,
            },
          }
        ).catch(() => null);
        await TranscriptSegment.updateMany(
          { broadcastId: sourceBroadcast._id, audioId: audio._id },
          { $set: { audioId: previousReplayAudio } }
        ).catch(() => null);
        await SavedMoment.updateMany(
          { broadcastId: sourceBroadcast._id, audioId: audio._id },
          { $set: { audioId: previousReplayAudio } }
        ).catch(() => null);
        await Audio.deleteOne({ _id: audio._id }).catch(() => {});
        throw linkError;
      }
    }

    if (audio.isPublic) {
      req.app.get('io')?.emit('catalog:changed', {
        entity: 'audio',
        action: 'published',
        audioId: String(audio._id),
      });
    }

    // Replay recordings (and only replays — uploaded music keeps its original
    // encoding): normalise the giant WAV master to MP3 automatically
    // (server canonical copy; cloud upload too when S3 is configured).
    // Best-effort by contract — failures keep the local file and never fail
    // the upload. Runs before the committed flag so the saved doc already
    // carries the final fileUrl/fileSize.
    if (sourceBroadcast && audioFile?.path) {
      await archiveRecordingAudio({ audio, localPath: audioFile.path });
    }
    // From this point the media bytes and Mongo record belong together. The
    // upload error middleware must not delete files merely because a secondary
    // populate/notification step failed after the authoritative save.
    req.audioUploadCommitted = true;

    await notifyFollowersOfRelease(req.user, audio);

    let responseAudio = audio;
    try {
      responseAudio = await populatedAudioById(audio._id) || audio;
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
    const audio = await Audio.findById(req.params.id)
      .populate(
        'artist',
        'username displayName bio avatar creatorProfile.artistName creatorProfile.organizationName userType'
      )
      .populate({
        path: 'sourceBroadcast',
        select: 'title description startedAt endedAt station creator listenerCount peakListeners assetStatus assetVisibility generatedHighlights generatedChapters',
        populate: { path: 'station', select: 'name category coverArt' },
      });

    if (!audio || audio.isDeleted) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Audio not found' },
      });
    }

    if (!await canAccessReplayAudio(audio, req.userId)) {
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

export async function trimAudio(req, res, next) {
  let outputPath = '';
  try {
    const audio = await Audio.findOne({ _id: req.params.id, isDeleted: false });
    if (!audio) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audio not found' } });
    }
    if (String(audio.artist) !== String(req.userId)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not own this audio' } });
    }

    const originalFilename = path.basename(String(audio.filename || audio.fileKey || ''));
    const sourcePath = safeLocalMediaPath('audio', originalFilename);
    const result = await trimAudioFile({
      sourcePath,
      startSeconds: req.body?.startSeconds,
      endSeconds: req.body?.endSeconds,
      sourceDuration: audio.duration,
    });
    outputPath = result.outputPath;

    // The compare on filename prevents concurrent trims from silently
    // overwriting one another. The original remains untouched until this
    // authoritative document update succeeds.
    const updated = await Audio.findOneAndUpdate(
      { _id: audio._id, artist: req.userId, isDeleted: false, filename: originalFilename },
      {
        $set: {
          filename: result.outputFilename,
          fileKey: result.outputFilename,
          fileSize: result.fileSize,
          duration: result.duration,
          'lastTrim.startSeconds': result.range.start,
          'lastTrim.endSeconds': result.range.end,
          'lastTrim.sourceDuration': Number(audio.duration) || null,
          'lastTrim.trimmedAt': new Date(),
        },
      },
      { new: true, runValidators: true }
    );
    if (!updated) {
      const conflict = new Error('This recording changed while it was being trimmed. Reload and try again.');
      conflict.status = 409;
      conflict.code = 'TRIM_CONFLICT';
      throw conflict;
    }
    outputPath = '';
    if (sourcePath !== result.outputPath) await removeLocalFile(sourcePath);

    return res.status(200).json({
      data: updated,
      processing: 'server',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (outputPath) await removeLocalFile(outputPath);
    return next(error);
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

    // Collections retain references, never copies. Remove a deleted recording
    // from every ordered collection without touching either collection itself.
    const affectedCollections = await Playlist.find({ 'tracks.trackId': audio._id });
    await Promise.all(affectedCollections.map(async (collection) => {
      collection.tracks = collection.tracks.filter(
        (entry) => String(entry.trackId) !== String(audio._id)
      );
      collection.trackCount = collection.tracks.length;
      await collection.save();
    }));

    const audioPath = safeLocalMediaPath(
      'audio',
      audio.filename || audio.fileKey
    );
    const coverPath =
      audio.coverArtMode === 'uploaded' && String(audio.coverArt || '').startsWith('/uploads/audio-covers/')
        ? safeLocalMediaPath('audio-covers', path.basename(audio.coverArt))
        : null;

    // Once the logical delete is durable, remove backing bytes best-effort.
    // Private object storage is cleaned as well so an already-issued signed
    // URL cannot keep serving a recording after the object itself is deleted.
    const cloudCleanup = audio.storage === 'cloud' && audio.cloudKey
      ? import('../services/audioArchiveService.js')
          .then(({ deleteCloudObject }) => deleteCloudObject(audio.cloudKey))
          .catch((cloudError) => {
            console.warn('[audio-delete] cloud cleanup warning:', cloudError?.message || cloudError);
          })
      : Promise.resolve();

    await Promise.all([
      removeLocalFile(audioPath),
      removeLocalFile(coverPath),
      cloudCleanup,
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
