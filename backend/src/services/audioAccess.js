import Audio from '../models/Audio.js';

export const audioAccessFilter = (userId) => ({
  isDeleted: false,
  $or: [
    { isPublic: true },
    ...(userId ? [{ artist: userId }] : []),
  ],
});

export const isAudioAccessibleToUser = (audio, userId) => {
  if (!audio || audio.isDeleted) return false;
  if (audio.isPublic) return true;
  const artistId = audio.artist?._id || audio.artist;
  return Boolean(userId && artistId && String(artistId) === String(userId));
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
