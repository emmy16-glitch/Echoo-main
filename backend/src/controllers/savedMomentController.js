import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import SavedMoment from '../models/SavedMoment.js';
import TranscriptSegment from '../models/TranscriptSegment.js';

const validId = (value) => Boolean(value && mongoose.isValidObjectId(value));

const populatedMoments = (filter) => SavedMoment.find(filter)
  .sort({ createdAt: -1, _id: -1 })
  .populate('audioId', 'title coverArt coverArtMode coverArtVariant duration fileUrl artist sourceBroadcast isPublic isDeleted')
  .populate('broadcastId', 'title coverArt status replayAudio station creator isPublic isDeleted')
  .populate('creatorId', 'username displayName avatar creatorProfile.artistName creatorProfile.organizationName creatorProfile.isVerified')
  .populate('stationId', 'name coverArt branding category');

export async function listSavedMoments(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const cursor = validId(req.query.cursor) ? req.query.cursor : null;
    const filter = { userId: req.userId, ...(cursor ? { _id: { $lt: cursor } } : {}) };
    const rows = await populatedMoments(filter).limit(limit + 1);
    const visible = rows.filter((moment) => {
      const audio = moment.audioId;
      const broadcast = moment.broadcastId;
      return (audio && audio.isPublic && !audio.isDeleted) || (broadcast && broadcast.isPublic && !broadcast.isDeleted);
    });
    const hasMore = visible.length > limit;
    const data = hasMore ? visible.slice(0, limit) : visible;
    return res.status(200).json({
      data,
      pagination: { limit, hasMore, nextCursor: hasMore ? String(data.at(-1)?._id || '') : null },
      timestamp: new Date().toISOString(),
    });
  } catch (error) { next(error); }
}

export async function createSavedMoment(req, res, next) {
  try {
    const { audioId, broadcastId, transcriptSegmentId } = req.body || {};
    if (!validId(audioId) && !validId(broadcastId)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid audioId or broadcastId is required' } });
    }

    const [audio, broadcast, segment] = await Promise.all([
      validId(audioId) ? Audio.findOne({ _id: audioId, isPublic: true, isDeleted: false }) : null,
      validId(broadcastId) ? Broadcast.findOne({ _id: broadcastId, isPublic: true, isDeleted: false }) : null,
      validId(transcriptSegmentId) ? TranscriptSegment.findById(transcriptSegmentId) : null,
    ]);
    const sourceBroadcast = broadcast || (audio?.sourceBroadcast ? await Broadcast.findById(audio.sourceBroadcast) : null);
    if (!audio && !sourceBroadcast) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audio or broadcast not found' } });
    }
    if (segment && sourceBroadcast && String(segment.broadcastId) !== String(sourceBroadcast._id)) {
      return res.status(400).json({ error: { code: 'SEGMENT_MISMATCH', message: 'Transcript moment does not belong to this broadcast' } });
    }
    const timestampMs = Math.max(0, Math.round(Number(req.body?.timestampMs ?? segment?.startMs) || 0));
    const moment = await SavedMoment.findOneAndUpdate(
      { userId: req.userId, audioId: audio?._id || null, broadcastId: sourceBroadcast?._id || null, timestampMs },
      {
        $set: {
          creatorId: audio?.artist || sourceBroadcast.creator,
          stationId: sourceBroadcast?.station || null,
          transcriptSegmentId: segment?._id || null,
          transcriptSnippet: String(req.body?.transcriptSnippet || segment?.text || '').trim().slice(0, 1200),
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({ data: moment, timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
}

export async function deleteSavedMoment(req, res, next) {
  try {
    if (!validId(req.params.momentId)) {
      return res.status(400).json({ error: { code: 'INVALID_MOMENT_ID', message: 'Invalid saved moment ID' } });
    }
    const removed = await SavedMoment.findOneAndDelete({ _id: req.params.momentId, userId: req.userId });
    if (!removed) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Saved moment not found' } });
    return res.status(200).json({ data: { id: req.params.momentId }, timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
}
