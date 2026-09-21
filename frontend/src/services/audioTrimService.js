import { apiRequest } from './api.js';

export const validateAudioTrimRange = ({ startSeconds, endSeconds, duration = 0 }) => {
  const start = Number(startSeconds);
  const end = Number(endSeconds);
  const knownDuration = Number(duration) || 0;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new Error('Choose a trim end that is later than the trim start.');
  }
  if (knownDuration > 0 && end > knownDuration + 0.25) {
    throw new Error('The trim end is beyond this recording.');
  }
  return { startSeconds: start, endSeconds: end };
};

export const trimSavedAudio = async (audioId, range) => {
  if (!audioId) throw new Error('Audio ID is missing.');
  const validated = validateAudioTrimRange(range);
  return apiRequest(`/audio/${encodeURIComponent(audioId)}/trim`, {
    method: 'POST',
    body: JSON.stringify(validated),
  });
};

export default { trimSavedAudio, validateAudioTrimRange };
