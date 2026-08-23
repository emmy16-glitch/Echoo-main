import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import TranscriptSegment from '../models/TranscriptSegment.js';
import {
  getBroadcastProcessing,
  markBroadcastReplayDiscarded,
} from '../services/broadcastProcessingService.js';

const VISIBILITIES = new Set(['public', 'followers', 'private']);

const errorWith = (status, code, message) => Object.assign(new Error(message), { status, code });

const ownedBroadcast = async (broadcastId, userId) => {
  if (!mongoose.isValidObjectId(broadcastId)) throw errorWith(400, 'INVALID_BROADCAST_ID', 'Invalid broadcast ID');
  const broadcast = await Broadcast.findOne({ _id: broadcastId, creator: userId, isDeleted: false });
  if (!broadcast) throw errorWith(404, 'NOT_FOUND', 'Broadcast not found');
  return broadcast;
};

export async function getProcessingStatus(req, res, next) {
  try {
    await ownedBroadcast(req.params.broadcastId, req.userId);
    const data = await getBroadcastProcessing(req.params.broadcastId);
    return res.status(200).json({ data, timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
}

export async function updateAssetVisibility(req, res, next) {
  try {
    const broadcast = await ownedBroadcast(req.params.broadcastId, req.userId);
    const audio = String(req.body?.audio || broadcast.assetVisibility?.audio || 'private');
    const transcript = String(req.body?.transcript || broadcast.assetVisibility?.transcript || 'private');
    if (!VISIBILITIES.has(audio) || !VISIBILITIES.has(transcript)) {
      throw errorWith(400, 'INVALID_VISIBILITY', 'Visibility must be public, followers, or private');
    }
    broadcast.assetVisibility = { audio, transcript };
    broadcast.visibility = audio;
    // Processing controls run after the live session. Keep completed-broadcast
    // discovery synchronized with the replay visibility instead of leaving a
    // private replay discoverable because the live event used to be public.
    if (broadcast.status === 'completed') {
      broadcast.isPublic = audio === 'public';
    }
    await broadcast.save();
    if (broadcast.replayAudio) {
      await Audio.updateOne({ _id: broadcast.replayAudio, artist: req.userId }, {
        $set: { visibility: audio, isPublic: audio === 'public' },
      });
    }
    return res.status(200).json({ data: broadcast.assetVisibility, timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
}

export async function discardReplay(req, res, next) {
  try {
    const broadcast = await ownedBroadcast(req.params.broadcastId, req.userId);
    if (broadcast.status !== 'completed') {
      throw errorWith(409, 'BROADCAST_NOT_COMPLETED', 'Replay discard is only available after a completed broadcast');
    }
    if (broadcast.replayAudio) {
      throw errorWith(409, 'REPLAY_ALREADY_SAVED', 'This broadcast already has a saved replay');
    }

    await markBroadcastReplayDiscarded(broadcast._id);
    const updated = await Broadcast.findById(broadcast._id);
    return res.status(200).json({
      data: updated,
      message: 'Local replay recording discarded.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) { next(error); }
}

export async function publishReplay(req, res, next) {
  try {
    const broadcast = await ownedBroadcast(req.params.broadcastId, req.userId);
    if (broadcast.assetStatus?.audio !== 'ready' || !broadcast.replayAudio) {
      throw errorWith(409, 'AUDIO_NOT_READY', 'The replay recording is still being finalized');
    }
    const visibility = String(req.body?.visibility || broadcast.assetVisibility?.audio || 'public');
    if (!VISIBILITIES.has(visibility)) throw errorWith(400, 'INVALID_VISIBILITY', 'Invalid replay visibility');
    const audio = await Audio.findOneAndUpdate(
      { _id: broadcast.replayAudio, artist: req.userId, isDeleted: false },
      { $set: { visibility, publicationStatus: 'published', publishedAt: new Date(), isPublic: visibility === 'public' } },
      { returnDocument: 'after' }
    );
    if (!audio) throw errorWith(404, 'REPLAY_NOT_FOUND', 'Replay audio not found');
    broadcast.visibility = visibility;
    broadcast.assetVisibility.audio = visibility;
    broadcast.isPublic = visibility === 'public';
    await broadcast.save();
    req.app.get('io')?.emit('catalog:changed', { entity: 'audio', action: 'published', audioId: String(audio._id) });
    return res.status(200).json({ data: { broadcast, audio }, timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
}

export async function beginTranscriptReview(req, res, next) {
  try {
    const broadcast = await ownedBroadcast(req.params.broadcastId, req.userId);
    if (!['ready_for_review', 'editing'].includes(broadcast.assetStatus?.transcript)) {
      throw errorWith(409, 'TRANSCRIPT_NOT_READY', 'The transcript is not ready for editing');
    }
    broadcast.assetStatus.transcript = 'editing';
    await broadcast.save();
    return res.status(200).json({ data: broadcast, timestamp: new Date().toISOString() });
  } catch (error) { next(error); }
}

export async function publishTranscript(req, res, next) {
  try {
    const broadcast = await ownedBroadcast(req.params.broadcastId, req.userId);
    if (!['ready_for_review', 'editing', 'published'].includes(broadcast.assetStatus?.transcript)) {
      throw errorWith(409, 'TRANSCRIPT_NOT_READY', 'The transcript is not ready to publish');
    }
    if (!broadcast.replayAudio) {
      throw errorWith(409, 'REPLAY_NOT_READY', 'Publish the replay recording first');
    }

    const replay = await Audio.findOne({
      _id: broadcast.replayAudio,
      artist: req.userId,
      isDeleted: false,
    }).select('_id publicationStatus');
    if (!replay || replay.publicationStatus !== 'published') {
      throw errorWith(409, 'REPLAY_NOT_PUBLISHED', 'Publish the replay recording before publishing its transcript');
    }

    const visibility = String(req.body?.visibility || broadcast.assetVisibility?.transcript || 'public');
    if (!VISIBILITIES.has(visibility)) throw errorWith(400, 'INVALID_VISIBILITY', 'Invalid transcript visibility');
    const now = new Date();
    await TranscriptSegment.updateMany(
      { broadcastId: broadcast._id, isFinal: true, isHidden: false },
      { $set: { publicationStatus: 'published', publishedAt: now, audioId: broadcast.replayAudio } }
    );
    broadcast.assetStatus.transcript = 'published';
    broadcast.assetVisibility.transcript = visibility;
    await broadcast.save();
    req.app.get('io')?.emit('catalog:changed', { entity: 'transcript', action: 'published', broadcastId: String(broadcast._id) });
    return res.status(200).json({ data: broadcast, timestamp: now.toISOString() });
  } catch (error) { next(error); }
}
