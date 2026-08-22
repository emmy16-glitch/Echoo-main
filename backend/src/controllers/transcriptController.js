import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import TranscriptSegment from '../models/TranscriptSegment.js';
import TranscriptSession from '../models/TranscriptSession.js';
import Follow from '../models/Follow.js';
import StationFollow from '../models/StationFollow.js';
import {
  finalizeConfirmedTranscript,
  persistTranscriptSegment,
} from '../services/transcriptPersistenceService.js';
import {
  flushTranscriptionSession,
  isTranscriptionConfigured,
} from '../services/transcriptionGateway.js';

const DEFAULT_TRANSCRIPT_RESULTS = 100;
const MAX_TRANSCRIPT_RESULTS = 200;

export async function getTranscriptionReadiness(req, res) {
  const configured = isTranscriptionConfigured();
  let providerReady = false;
  let status = configured ? 'checking' : 'unavailable';

  if (configured) {
    try {
      const healthUrl = new URL(env.whisperFlowUrl);
      healthUrl.protocol = healthUrl.protocol === 'wss:' ? 'https:' : 'http:';
      healthUrl.pathname = '/health/ready';
      healthUrl.search = '';
      healthUrl.hash = '';
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1800) });
      const payload = response.ok ? await response.json() : null;
      providerReady = Boolean(response.ok && payload?.ready);
      status = providerReady ? 'ready' : 'unavailable';
    } catch {
      status = 'unavailable';
    }
  }

  return res.status(200).json({
    data: {
      configured,
      providerReady,
      status,
      model: env.whisperModel,
      language: env.whisperLanguage,
    },
    timestamp: new Date().toISOString(),
  });
}

const transcriptError = (status, code, message) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const validId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw transcriptError(400, `INVALID_${label.toUpperCase()}_ID`, `Invalid ${label} ID`);
  }
};

const findAccessibleBroadcast = async (broadcastId, userId) => {
  validId(broadcastId, 'broadcast');
  const broadcast = await Broadcast.findOne({
    _id: broadcastId,
    isDeleted: false,
  }).select('_id creator station isPublic visibility assetVisibility assetStatus status replayAudio startedAt endedAt captionSettings savedMoments');
  if (!broadcast) throw transcriptError(404, 'NOT_FOUND', 'Broadcast not found');
  const isOwner = String(broadcast.creator) === String(userId);
  if (!isOwner) {
    const visibility = broadcast.assetVisibility?.transcript || 'private';
    let canAccess = visibility === 'public';
    if (visibility === 'followers') {
      const [creatorFollow, stationFollow] = await Promise.all([
        Follow.exists({ follower: userId, following: broadcast.creator, status: 'accepted' }),
        StationFollow.exists({ follower: userId, station: broadcast.station }),
      ]);
      canAccess = Boolean(creatorFollow || stationFollow);
    }
    if (!canAccess) throw transcriptError(403, 'FORBIDDEN', 'This transcript is not available to you');
  }
  return { broadcast, isOwner };
};

const encodeCursor = (segment) => Buffer.from(JSON.stringify({
  startMs: Number(segment.startMs) || 0,
  id: String(segment._id),
})).toString('base64url');

const decodeCursor = (value) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!mongoose.isValidObjectId(parsed.id) || !Number.isFinite(Number(parsed.startMs))) {
      throw new Error('invalid cursor');
    }
    return { startMs: Math.max(0, Number(parsed.startMs)), id: parsed.id };
  } catch {
    throw transcriptError(400, 'INVALID_CURSOR', 'Transcript cursor is invalid');
  }
};

const transcriptFilter = (base, query = {}) => {
  const filter = { ...base };
  const search = String(query.search || '').trim();
  if (search.length > 120) {
    throw transcriptError(400, 'SEARCH_TOO_LONG', 'Transcript search cannot exceed 120 characters');
  }
  if (search) filter.$text = { $search: search };
  if (query.final === 'true') filter.isFinal = true;
  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    filter.$or = [
      { startMs: { $gt: cursor.startMs } },
      { startMs: cursor.startMs, _id: { $gt: cursor.id } },
    ];
  }
  return filter;
};

const listSegments = async (filter, query = {}) => {
  const limit = Math.min(
    MAX_TRANSCRIPT_RESULTS,
    Math.max(1, Number.parseInt(query.limit || DEFAULT_TRANSCRIPT_RESULTS, 10) || DEFAULT_TRANSCRIPT_RESULTS)
  );
  const rows = await TranscriptSegment.find(filter)
    .sort({ startMs: 1, _id: 1 })
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return {
    data,
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore && data.length ? encodeCursor(data[data.length - 1]) : null,
    },
  };
};

export async function getBroadcastTranscript(req, res, next) {
  try {
    const { broadcast, isOwner } = await findAccessibleBroadcast(req.params.broadcastId, req.userId);
    if (!isOwner && (
      broadcast.status !== 'completed' ||
      broadcast.assetStatus?.transcript !== 'published'
    )) {
      throw transcriptError(403, 'TRANSCRIPT_NOT_PUBLISHED', 'The replay transcript has not been published');
    }
    const base = { broadcastId: req.params.broadcastId };
    if (!isOwner) {
      base.isHidden = false;
      base.isFinal = true;
      base.publicationStatus = 'published';
    }
    const result = await listSegments(
      transcriptFilter(base, req.query),
      req.query
    );
    return res.status(200).json({
      ...result,
      captionSettings: broadcast.captionSettings,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function moderateTranscriptSegment(req, res, next) {
  try {
    validId(req.params.segmentId, 'segment');
    const segment = await TranscriptSegment.findById(req.params.segmentId);
    if (!segment) throw transcriptError(404, 'NOT_FOUND', 'Transcript segment not found');
    const { broadcast, isOwner } = await findAccessibleBroadcast(segment.broadcastId, req.userId);
    if (!isOwner) throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can manage transcript lines');

    const update = { moderationUpdatedAt: new Date() };
    const action = String(req.body?.action || '').trim();
    if (action === 'highlight') update.isHighlighted = !segment.isHighlighted;
    else if (action === 'pin') update.isPinned = !segment.isPinned;
    else if (action === 'hide') update.isHidden = !segment.isHidden;
    else if (action === 'edit') {
      const text = String(req.body?.text || '').trim();
      const speaker = String(req.body?.speaker || segment.speaker || 'Speaker').trim();
      if (!text || text.length > 8000) throw transcriptError(400, 'VALIDATION_ERROR', 'Corrected transcript text is required');
      update.text = text;
      update.speaker = speaker.slice(0, 120) || 'Speaker';
      update.correctedAt = new Date();
      update.correctedBy = req.userId;
      update.isFinal = true;
      update.status = 'final';
      update.editHistory = [
        ...(segment.editHistory || []),
        {
          text: segment.text,
          speaker: segment.speaker || 'Speaker',
          version: Number(segment.revision) || 1,
          editedBy: req.userId,
          editedAt: new Date(),
        },
      ].slice(-50);
    } else {
      throw transcriptError(400, 'INVALID_ACTION', 'Unsupported transcript action');
    }

    const updated = await TranscriptSegment.findByIdAndUpdate(
      segment._id,
      { $set: update, $inc: { revision: 1 } },
      { returnDocument: 'after', runValidators: true }
    );
    const payload = updated.toJSON();
    const io = req.app.get('io');
    const creatorRoom = `broadcast:${broadcast._id}:creator`;
    io?.to(creatorRoom).emit('transcript:moderated', payload);
    if (action !== 'edit' || broadcast.captionSettings?.autoPublishCorrections !== false) {
      io?.to(creatorRoom).emit('transcript:segment', payload);
    }
    if (action === 'edit') {
      await Broadcast.updateOne({ _id: broadcast._id }, { $set: { 'assetStatus.transcript': 'editing' } });
      io?.to(creatorRoom).emit('transcript_corrected', payload);
    }
    if (action === 'highlight') io?.to(creatorRoom).emit('transcript_highlighted', payload);

    return res.status(200).json({ data: updated, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function updateCaptionSettings(req, res, next) {
  try {
    const { broadcast, isOwner } = await findAccessibleBroadcast(req.params.broadcastId, req.userId);
    if (!isOwner) throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can update captions');
    const current = broadcast.captionSettings?.toObject?.() || broadcast.captionSettings || {};
    const requestedDelay = Number(req.body?.delayMs);
    const nextSettings = {
      showToListeners: typeof req.body?.showToListeners === 'boolean' ? req.body.showToListeners : current.showToListeners !== false,
      language: String(req.body?.language || current.language || 'en').trim().slice(0, 16) || 'en',
      autoPublishCorrections: typeof req.body?.autoPublishCorrections === 'boolean'
        ? req.body.autoPublishCorrections
        : current.autoPublishCorrections !== false,
      delayMs: Number.isFinite(requestedDelay)
        ? Math.max(0, Math.min(10000, Math.round(requestedDelay)))
        : Number(current.delayMs) || 0,
    };
    broadcast.captionSettings = nextSettings;
    await broadcast.save();
    req.app.get('io')?.to(`broadcast:${broadcast._id}:creator`).emit('transcript:settings', {
      broadcastId: String(broadcast._id),
      ...nextSettings,
    });
    return res.status(200).json({ data: nextSettings, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function getSavedMoments(req, res, next) {
  try {
    const { broadcast, isOwner } = await findAccessibleBroadcast(req.params.broadcastId, req.userId);
    if (!isOwner) throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can view saved moments');
    return res.status(200).json({ data: broadcast.savedMoments || [], timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function createSavedMoment(req, res, next) {
  try {
    const { broadcast, isOwner } = await findAccessibleBroadcast(req.params.broadcastId, req.userId);
    if (!isOwner) throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can save moments');
    let segment = null;
    if (req.body?.segmentId) {
      validId(req.body.segmentId, 'segment');
      segment = await TranscriptSegment.findOne({ _id: req.body.segmentId, broadcastId: broadcast._id });
      if (!segment) throw transcriptError(404, 'NOT_FOUND', 'Transcript segment not found');
    }
    const startMs = Math.max(0, Math.round(Number(req.body?.startMs ?? segment?.startMs) || 0));
    const endMs = Math.max(startMs, Math.round(Number(req.body?.endMs ?? segment?.endMs) || startMs));
    const label = String(req.body?.label || segment?.text || 'Saved moment').trim().slice(0, 160);
    broadcast.savedMoments.push({
      segmentId: segment?._id || null,
      label: label || 'Saved moment',
      text: String(segment?.text || req.body?.text || '').trim().slice(0, 8000),
      startMs,
      endMs,
    });
    await broadcast.save();
    const moment = broadcast.savedMoments[broadcast.savedMoments.length - 1];
    req.app.get('io')?.to(`broadcast:${broadcast._id}:creator`).emit('transcript:momentSaved', {
      broadcastId: String(broadcast._id),
      moment,
    });
    return res.status(201).json({ data: moment, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function deleteSavedMoment(req, res, next) {
  try {
    validId(req.params.momentId, 'moment');
    const { broadcast, isOwner } = await findAccessibleBroadcast(req.params.broadcastId, req.userId);
    if (!isOwner) throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can remove saved moments');
    const before = broadcast.savedMoments.length;
    broadcast.savedMoments = broadcast.savedMoments.filter((moment) => String(moment._id) !== String(req.params.momentId));
    if (broadcast.savedMoments.length === before) throw transcriptError(404, 'NOT_FOUND', 'Saved moment not found');
    await broadcast.save();
    return res.status(200).json({ data: { id: req.params.momentId }, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function getAudioTranscript(req, res, next) {
  try {
    validId(req.params.audioId, 'audio');
    const audio = await Audio.findOne({ _id: req.params.audioId, isDeleted: false })
      .select('_id artist isPublic visibility publicationStatus sourceBroadcast');
    if (!audio) throw transcriptError(404, 'NOT_FOUND', 'Audio not found');
    const isOwner = String(audio.artist) === String(req.userId);
    if (!isOwner && audio.publicationStatus !== 'published') {
      throw transcriptError(403, 'FORBIDDEN', 'You do not have access to this transcript');
    }
    if (!isOwner && audio.sourceBroadcast) {
      const { broadcast } = await findAccessibleBroadcast(audio.sourceBroadcast, req.userId);
      if (broadcast.assetStatus?.transcript !== 'published') {
        throw transcriptError(403, 'TRANSCRIPT_NOT_PUBLISHED', 'The replay transcript has not been published');
      }
    }
    if (!isOwner && !audio.sourceBroadcast && !audio.isPublic) throw transcriptError(403, 'FORBIDDEN', 'You do not have access to this transcript');
    const result = await listSegments(
      transcriptFilter({
        audioId: audio._id,
        ...(isOwner ? {} : { publicationStatus: 'published', isFinal: true, isHidden: false }),
      }, req.query),
      req.query
    );
    return res.status(200).json({ ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function searchReplayTranscripts(req, res, next) {
  try {
    const search = String(req.query.search || '').trim();
    if (search.length < 2 || search.length > 120) {
      throw transcriptError(400, 'INVALID_SEARCH', 'Transcript search must contain 2 to 120 characters');
    }
    const limit = Math.min(
      MAX_TRANSCRIPT_RESULTS,
      Math.max(1, Number.parseInt(req.query.limit || 25, 10) || 25)
    );
    const cursor = decodeCursor(req.query.cursor);
    const match = {
      $text: { $search: search },
      audioId: { $type: 'objectId' },
      isFinal: true,
      publicationStatus: 'published',
    };
    if (cursor) {
      match.$or = [
        { startMs: { $gt: cursor.startMs } },
        { startMs: cursor.startMs, _id: { $gt: new mongoose.Types.ObjectId(cursor.id) } },
      ];
    }
    const rows = await TranscriptSegment.aggregate([
      { $match: match },
      {
        $lookup: {
          from: Audio.collection.name,
          localField: 'audioId',
          foreignField: '_id',
          as: 'replay',
        },
      },
      { $unwind: '$replay' },
      {
        $match: {
          'replay.isDeleted': false,
          $or: [
            { 'replay.isPublic': true, 'replay.publicationStatus': 'published' },
            { 'replay.artist': new mongoose.Types.ObjectId(req.userId) },
          ],
        },
      },
      { $sort: { startMs: 1, _id: 1 } },
      { $limit: limit + 1 },
      {
        $project: {
          broadcastId: 1,
          audioId: 1,
          sessionId: 1,
          providerSegmentId: 1,
          sequence: 1,
          startMs: 1,
          endMs: 1,
          speaker: 1,
          text: 1,
          isFinal: 1,
          status: 1,
          confidence: 1,
          language: 1,
          replay: {
            id: '$replay._id',
            title: '$replay.title',
            coverArt: '$replay.coverArt',
            duration: '$replay.duration',
          },
        },
      },
    ]);
    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      ...row,
      id: String(row._id),
      startTime: Number(row.startMs || 0) / 1000,
      endTime: Number(row.endMs || 0) / 1000,
      replay: { ...row.replay, id: String(row.replay.id) },
    }));
    const last = data[data.length - 1];
    return res.status(200).json({
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && last
          ? Buffer.from(JSON.stringify({ startMs: last.startMs, id: last.id })).toString('base64url')
          : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function upsertBroadcastTranscriptSegment(req, res, next) {
  try {
    const { broadcast, isOwner } = await findAccessibleBroadcast(
      req.params.broadcastId,
      req.userId
    );
    if (!isOwner) {
      throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can publish transcript segments');
    }
    if (!['starting', 'live', 'ending'].includes(broadcast.status)) {
      throw transcriptError(409, 'INVALID_STATE', 'This broadcast is not accepting live transcript segments');
    }

    const segment = await persistTranscriptSegment({
      broadcastId: broadcast._id,
      sessionId: req.body?.sessionId || null,
      input: req.body,
      io: req.app.get('io'),
    });

    return res.status(200).json({ data: segment, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function finalizeBroadcastTranscript(req, res, next) {
  try {
    const { broadcast, isOwner } = await findAccessibleBroadcast(
      req.params.broadcastId,
      req.userId
    );
    if (!isOwner) {
      throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can finalize this transcript');
    }
    const data = await finalizeConfirmedTranscript({
      broadcastId: broadcast._id,
      io: req.app.get('io'),
    });
    return res.status(200).json({ data, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}

export async function createTranscriptSession(req, res, next) {
  try {
    const { broadcast, isOwner } = await findAccessibleBroadcast(
      req.params.broadcastId,
      req.userId
    );
    if (!isOwner) {
      throw transcriptError(403, 'FORBIDDEN', 'Only the broadcast creator can start transcription');
    }
    if (!['starting', 'live', 'ending'].includes(broadcast.status)) {
      throw transcriptError(409, 'INVALID_STATE', 'This broadcast is not accepting transcription sessions');
    }
    if (!isTranscriptionConfigured()) {
      return res.status(200).json({
        data: { configured: false, session: null },
        timestamp: new Date().toISOString(),
      });
    }

    const activeSession = await TranscriptSession.findOne({
      broadcastId: broadcast._id,
      creatorId: req.userId,
      state: { $in: ['starting', 'connecting', 'connected', 'reconnecting'] },
    }).sort({ createdAt: -1 });
    if (activeSession) {
      return res.status(200).json({
        data: { configured: true, session: activeSession.toJSON() },
        timestamp: new Date().toISOString(),
      });
    }

    const latest = await TranscriptSegment.findOne({ broadcastId: broadcast._id })
      .sort({ endMs: -1, _id: -1 })
      .select('endMs');
    const wallClockOffset = broadcast.startedAt
      ? Math.max(0, Date.now() - new Date(broadcast.startedAt).getTime())
      : 0;
    const offsetMs = Math.max(Number(latest?.endMs) || 0, wallClockOffset);
    const session = await TranscriptSession.create({
      broadcastId: broadcast._id,
      creatorId: req.userId,
      state: 'starting',
      status: 'active',
      provider: 'whisper-flow',
      model: String(process.env.WHISPER_MODEL || 'faster-whisper-large-v3-turbo').trim().slice(0, 80) || 'faster-whisper-large-v3-turbo',
      offsetMs,
      captureOffset: offsetMs,
      startedAt: new Date(),
      language: String(
        req.body?.language || broadcast.captionSettings?.language || process.env.WHISPER_LANGUAGE || 'en'
      ).trim().slice(0, 16) || 'en',
    });
    await Broadcast.updateOne(
      { _id: broadcast._id, isDeleted: false },
      { $set: { transcriptState: 'connecting', 'assetStatus.transcript': 'processing' } }
    );

    return res.status(201).json({
      data: { configured: true, session: session.toJSON() },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function flushTranscriptSession(req, res, next) {
  try {
    validId(req.params.sessionId, 'session');
    const session = await TranscriptSession.findOne({
      _id: req.params.sessionId,
      creatorId: req.userId,
    });
    if (!session) throw transcriptError(404, 'NOT_FOUND', 'Transcript session not found');
    const data = await flushTranscriptionSession(session._id, { reason: 'creator-requested' });
    return res.status(200).json({ data, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}
