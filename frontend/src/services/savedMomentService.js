import { apiRequest, buildMediaUrl } from './api.js';
import { buildGeneratedAudioCoverUrl } from '../audioCover/audioCover.js';

const idOf = (value) => value?.id || value?._id || value || null;

export const normalizeSavedMoment = (moment) => {
  if (!moment) return null;
  const audio = moment.audioId && typeof moment.audioId === 'object' ? moment.audioId : null;
  const broadcast = moment.broadcastId && typeof moment.broadcastId === 'object' ? moment.broadcastId : null;
  const station = moment.stationId && typeof moment.stationId === 'object' ? moment.stationId : null;
  const creator = moment.creatorId && typeof moment.creatorId === 'object' ? moment.creatorId : null;
  const replayId = idOf(audio) || idOf(broadcast?.replayAudio);
  const coverArt = buildMediaUrl(audio?.coverArt || broadcast?.coverArt || station?.coverArt) || (audio ? buildGeneratedAudioCoverUrl(audio) : null);
  return {
    ...moment,
    id: idOf(moment),
    audioId: replayId,
    broadcastId: idOf(broadcast) || idOf(moment.broadcastId),
    creatorId: idOf(creator) || idOf(moment.creatorId),
    stationId: idOf(station) || idOf(moment.stationId),
    title: audio?.title || broadcast?.title || station?.name || 'Saved moment',
    creatorName: creator?.displayName || creator?.creatorProfile?.artistName || creator?.creatorProfile?.organizationName || creator?.username || 'Echoo Creator',
    stationName: station?.name || 'Echoo',
    category: station?.category || audio?.genre || 'Audio',
    coverArt,
    timestampMs: Number(moment.timestampMs) || 0,
    transcriptSnippet: moment.transcriptSnippet || '',
    transcriptSegmentId: idOf(moment.transcriptSegmentId),
    status: broadcast?.status || (audio ? 'replay' : 'saved'),
    audio,
  };
};

const savedMomentService = {
  list: async ({ cursor = '', limit = 40 } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    const response = await apiRequest(`/saved-moments?${query}`);
    return { ...response, data: (response?.data || []).map(normalizeSavedMoment).filter(Boolean) };
  },
  create: async (payload) => {
    const response = await apiRequest('/saved-moments', { method: 'POST', body: JSON.stringify(payload) });
    return { ...response, data: normalizeSavedMoment(response?.data) };
  },
  remove: (momentId) => apiRequest(`/saved-moments/${encodeURIComponent(momentId)}`, { method: 'DELETE' }),
};

export default savedMomentService;
