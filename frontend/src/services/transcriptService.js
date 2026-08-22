import { apiRequest } from './api.js';

const normalizeSegment = (segment) => segment ? ({
  ...segment,
  id: segment.id || segment._id || segment.providerSegmentId,
  broadcastId: typeof segment.broadcastId === 'object'
    ? segment.broadcastId?.id || segment.broadcastId?._id
    : segment.broadcastId,
  audioId: typeof segment.audioId === 'object'
    ? segment.audioId?.id || segment.audioId?._id
    : segment.audioId,
  startMs: Number(segment.startMs) || 0,
  endMs: Number(segment.endMs) || 0,
  sequence: Number(segment.sequence) || 0,
  isFinal: Boolean(segment.isFinal),
  status: segment.status || (segment.isFinal ? 'final' : 'partial'),
}) : null;

const normalizeList = (response) =>
  (Array.isArray(response?.data) ? response.data : [])
    .map(normalizeSegment)
    .filter(Boolean);

const transcriptService = {
  getReadiness: async () => apiRequest('/transcripts/readiness'),

  search: async ({ search, cursor = '', limit = 25 } = {}) => {
    const query = new URLSearchParams({ search: String(search || ''), limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    return apiRequest(`/transcripts/search?${query}`);
  },

  getBroadcast: async (broadcastId, { search = '', final = false, cursor = '', limit = 100 } = {}) => {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (final) query.set('final', 'true');
    if (cursor) query.set('cursor', cursor);
    if (limit) query.set('limit', String(limit));
    const response = await apiRequest(
      `/transcripts/broadcast/${encodeURIComponent(broadcastId)}${query.size ? `?${query}` : ''}`
    );
    return { ...response, data: normalizeList(response), pagination: response?.pagination || null, captionSettings: response?.captionSettings || null };
  },

  getAudio: async (audioId, { search = '', final = false, cursor = '', limit = 100 } = {}) => {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (final) query.set('final', 'true');
    if (cursor) query.set('cursor', cursor);
    if (limit) query.set('limit', String(limit));
    const response = await apiRequest(
      `/transcripts/audio/${encodeURIComponent(audioId)}${query.size ? `?${query}` : ''}`
    );
    return { ...response, data: normalizeList(response), pagination: response?.pagination || null };
  },

  upsertBroadcastSegment: async (broadcastId, segment) => {
    const response = await apiRequest(
      `/transcripts/broadcast/${encodeURIComponent(broadcastId)}/segments`,
      { method: 'POST', body: JSON.stringify(segment) }
    );
    return { ...response, data: normalizeSegment(response?.data) };
  },

  createSession: async (broadcastId, { language = 'en' } = {}) =>
    apiRequest(`/transcripts/broadcast/${encodeURIComponent(broadcastId)}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ language }),
    }),

  flushSession: async (sessionId) =>
    apiRequest(`/transcripts/sessions/${encodeURIComponent(sessionId)}/flush`, {
      method: 'POST',
    }),

  finalizeBroadcast: async (broadcastId) =>
    apiRequest(`/transcripts/broadcast/${encodeURIComponent(broadcastId)}/finalize`, {
      method: 'POST',
    }),

  moderateSegment: async (segmentId, action, values = {}) => {
    const response = await apiRequest(`/transcripts/segments/${encodeURIComponent(segmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, ...values }),
    });
    return { ...response, data: normalizeSegment(response?.data) };
  },

  updateSettings: async (broadcastId, settings) =>
    apiRequest(`/transcripts/broadcast/${encodeURIComponent(broadcastId)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),

  getMoments: async (broadcastId) =>
    apiRequest(`/transcripts/broadcast/${encodeURIComponent(broadcastId)}/moments`),

  saveMoment: async (broadcastId, moment) =>
    apiRequest(`/transcripts/broadcast/${encodeURIComponent(broadcastId)}/moments`, {
      method: 'POST',
      body: JSON.stringify(moment),
    }),

  deleteMoment: async (broadcastId, momentId) =>
    apiRequest(`/transcripts/broadcast/${encodeURIComponent(broadcastId)}/moments/${encodeURIComponent(momentId)}`, {
      method: 'DELETE',
    }),
};

export { normalizeSegment };
export default transcriptService;
