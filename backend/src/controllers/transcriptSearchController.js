import mongoose from 'mongoose';
import Audio from '../models/Audio.js';
import Broadcast from '../models/Broadcast.js';
import Follow from '../models/Follow.js';
import StationFollow from '../models/StationFollow.js';
import TranscriptSegment from '../models/TranscriptSegment.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const MAX_SCAN = 500;

const errorWith = (status, code, message) => Object.assign(new Error(message), {
  status,
  code,
});

const encodeCursor = (segment) => Buffer.from(JSON.stringify({
  startMs: Number(segment.startMs) || 0,
  id: String(segment._id || segment.id),
})).toString('base64url');

const decodeCursor = (value) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!mongoose.isValidObjectId(parsed.id) || !Number.isFinite(Number(parsed.startMs))) {
      throw new Error('invalid cursor');
    }
    return {
      startMs: Math.max(0, Number(parsed.startMs)),
      id: new mongoose.Types.ObjectId(parsed.id),
    };
  } catch {
    throw errorWith(400, 'INVALID_CURSOR', 'Transcript cursor is invalid');
  }
};

const idOf = (value) => String(value?._id || value?.id || value || '');

const isCanonicalPublicAudio = (audio) => Boolean(
  audio?.isPublic === true &&
  audio?.visibility === 'public' &&
  audio?.publicationStatus === 'published'
);

const canReadFollowersVisibility = ({ creatorId, stationId, creatorFollows, stationFollows }) =>
  Boolean(
    (creatorId && creatorFollows.has(String(creatorId))) ||
    (stationId && stationFollows.has(String(stationId)))
  );

const canReadReplay = ({ audio, userId, broadcast, creatorFollows, stationFollows }) => {
  if (!audio || audio.isDeleted) return false;
  const ownerId = idOf(audio.artist);
  if (ownerId && ownerId === String(userId)) return true;
  if (audio.publicationStatus !== 'published') return false;
  if (isCanonicalPublicAudio(audio)) return true;
  if (audio.visibility !== 'followers') return false;
  return canReadFollowersVisibility({
    creatorId: ownerId,
    stationId: broadcast?.station,
    creatorFollows,
    stationFollows,
  });
};

const canReadPublishedTranscript = ({ broadcast, userId, creatorFollows, stationFollows }) => {
  if (!broadcast) return true;
  const ownerId = idOf(broadcast.creator);
  if (ownerId && ownerId === String(userId)) return true;
  if (broadcast.status !== 'completed' || broadcast.assetStatus?.transcript !== 'published') return false;
  const visibility = broadcast.assetVisibility?.transcript || 'private';
  if (visibility === 'public') return true;
  if (visibility !== 'followers') return false;
  return canReadFollowersVisibility({
    creatorId: ownerId,
    stationId: broadcast.station,
    creatorFollows,
    stationFollows,
  });
};

export async function searchReplayTranscriptsSecure(req, res, next) {
  try {
    const search = String(req.query.search || '').trim();
    if (search.length < 2 || search.length > 120) {
      throw errorWith(400, 'INVALID_SEARCH', 'Transcript search must contain 2 to 120 characters');
    }

    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(req.query.limit || DEFAULT_LIMIT, 10) || DEFAULT_LIMIT)
    );
    const cursor = decodeCursor(req.query.cursor);
    const scanLimit = Math.min(MAX_SCAN, Math.max(limit + 1, limit * 5));
    const match = {
      $text: { $search: search },
      audioId: { $type: 'objectId' },
      isFinal: true,
      isHidden: false,
      publicationStatus: 'published',
    };
    if (cursor) {
      match.$or = [
        { startMs: { $gt: cursor.startMs } },
        { startMs: cursor.startMs, _id: { $gt: cursor.id } },
      ];
    }

    const rawRows = await TranscriptSegment.find(match)
      .sort({ startMs: 1, _id: 1 })
      .limit(scanLimit + 1)
      .lean();
    const hasUnscannedRows = rawRows.length > scanLimit;
    const scannedRows = hasUnscannedRows ? rawRows.slice(0, scanLimit) : rawRows;

    const audioIds = [...new Set(scannedRows.map((row) => idOf(row.audioId)).filter(Boolean))];
    const audios = audioIds.length
      ? await Audio.find({ _id: { $in: audioIds }, isDeleted: false })
        .select('_id artist isPublic visibility publicationStatus sourceBroadcast title coverArt duration isDeleted')
        .lean()
      : [];
    const audioMap = new Map(audios.map((audio) => [idOf(audio), audio]));

    const broadcastIds = [...new Set(audios.map((audio) => idOf(audio.sourceBroadcast)).filter(Boolean))];
    const broadcasts = broadcastIds.length
      ? await Broadcast.find({ _id: { $in: broadcastIds }, isDeleted: false })
        .select('_id creator station status assetStatus assetVisibility isDeleted')
        .lean()
      : [];
    const broadcastMap = new Map(broadcasts.map((broadcast) => [idOf(broadcast), broadcast]));

    const relevantCreatorIds = [...new Set([
      ...audios.map((audio) => idOf(audio.artist)),
      ...broadcasts.map((broadcast) => idOf(broadcast.creator)),
    ].filter(Boolean))];
    const relevantStationIds = [...new Set(broadcasts.map((broadcast) => idOf(broadcast.station)).filter(Boolean))];

    const [creatorRelationships, stationRelationships] = await Promise.all([
      relevantCreatorIds.length
        ? Follow.find({
          follower: req.userId,
          following: { $in: relevantCreatorIds },
          status: 'accepted',
        }).select('following').lean()
        : [],
      relevantStationIds.length
        ? StationFollow.find({
          follower: req.userId,
          station: { $in: relevantStationIds },
        }).select('station').lean()
        : [],
    ]);
    const creatorFollows = new Set(creatorRelationships.map((item) => idOf(item.following)));
    const stationFollows = new Set(stationRelationships.map((item) => idOf(item.station)));

    const allowedRows = scannedRows.filter((row) => {
      const audio = audioMap.get(idOf(row.audioId));
      if (!audio) return false;
      const broadcast = audio.sourceBroadcast
        ? broadcastMap.get(idOf(audio.sourceBroadcast)) || null
        : null;
      return canReadReplay({
        audio,
        userId: req.userId,
        broadcast,
        creatorFollows,
        stationFollows,
      }) && canReadPublishedTranscript({
        broadcast,
        userId: req.userId,
        creatorFollows,
        stationFollows,
      });
    });

    const hasMoreAllowedInScan = allowedRows.length > limit;
    const pageRows = hasMoreAllowedInScan ? allowedRows.slice(0, limit) : allowedRows;
    const data = pageRows.map((row) => {
      const replay = audioMap.get(idOf(row.audioId));
      return {
        ...row,
        id: idOf(row),
        broadcastId: idOf(row.broadcastId),
        audioId: idOf(row.audioId),
        sessionId: row.sessionId ? idOf(row.sessionId) : null,
        startTime: Number(row.startMs || 0) / 1000,
        endTime: Number(row.endMs || 0) / 1000,
        replay: {
          id: idOf(replay),
          title: replay?.title || 'Echoo replay',
          coverArt: replay?.coverArt || null,
          duration: Number(replay?.duration) || 0,
        },
      };
    });

    let nextCursor = null;
    if (hasMoreAllowedInScan && pageRows.length) {
      nextCursor = encodeCursor(pageRows[pageRows.length - 1]);
    } else if (hasUnscannedRows && scannedRows.length) {
      // Advance past inaccessible rows too. Using the last returned row here
      // would repeatedly rescan hidden/private matches and could stall paging.
      nextCursor = encodeCursor(scannedRows[scannedRows.length - 1]);
    }

    return res.status(200).json({
      data,
      pagination: {
        limit,
        hasMore: Boolean(nextCursor),
        nextCursor,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export default { searchReplayTranscriptsSecure };
