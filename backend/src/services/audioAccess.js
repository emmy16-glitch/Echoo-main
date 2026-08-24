import Audio from '../models/Audio.js';

const publicAudioClause = {
  isPublic: true,
  visibility: 'public',
  publicationStatus: 'published',
};

export const audioAccessFilter = (userId) => ({
  isDeleted: false,
  $or: [
    publicAudioClause,
    ...(userId ? [{ artist: userId }] : []),
  ],
});

export const isAudioAccessibleToUser = (audio, userId) => {
  if (!audio || audio.isDeleted) return false;
  const artistId = audio.artist?._id || audio.artist;
  if (userId && artistId && String(artistId) === String(userId)) return true;
  return Boolean(
    audio.isPublic === true &&
    audio.visibility === 'public' &&
    audio.publicationStatus === 'published'
  );
};

export const findAccessibleAudio = (audioId, userId, projection = null) => {
  const query = Audio.findOne({
    _id: audioId,
    ...audioAccessFilter(userId),
  });
  return projection ? query.select(projection) : query;
};

export default {
  audioAccessFilter,
  isAudioAccessibleToUser,
  findAccessibleAudio,
};
