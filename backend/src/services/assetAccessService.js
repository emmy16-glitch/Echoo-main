import Broadcast from '../models/Broadcast.js';
import Follow from '../models/Follow.js';
import StationFollow from '../models/StationFollow.js';

export async function canAccessReplayAudio(audio, userId) {
  if (!audio || audio.isDeleted) return false;
  const ownerId = audio.artist?._id || audio.artist;
  if (userId && ownerId && String(ownerId) === String(userId)) return true;

  // Non-owners may only consume deliberately published assets. `isPublic` is a
  // legacy compatibility flag and must never override the canonical publication
  // and visibility fields on its own.
  if (audio.publicationStatus !== 'published') return false;

  const visibility = audio.visibility || (audio.isPublic ? 'public' : 'private');
  if (visibility === 'public') return audio.isPublic === true;
  if (visibility !== 'followers' || !userId || !ownerId) return false;

  const broadcast = audio.sourceBroadcast
    ? await Broadcast.findById(audio.sourceBroadcast).select('station creator')
    : null;
  const [creatorFollow, stationFollow] = await Promise.all([
    Follow.exists({ follower: userId, following: ownerId, status: 'accepted' }),
    broadcast?.station ? StationFollow.exists({ follower: userId, station: broadcast.station }) : null,
  ]);
  return Boolean(creatorFollow || stationFollow);
}

export default { canAccessReplayAudio };
