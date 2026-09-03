import { apiRequest, buildMediaUrl } from './api.js';
import { buildGeneratedAudioCoverUrl } from '../audioCover/audioCover.js';

const idOf = (value) => value?.id || value?._id || value || null;

const normalizeRecording = (recording = {}) => ({
  ...recording,
  id: idOf(recording),
  coverArt: buildMediaUrl(recording.coverArt || recording.artwork || recording.image || null),
});

export const normalizeCollection = (collection = {}) => {
  const recordings = Array.isArray(collection.recordings) ? collection.recordings.map(normalizeRecording) : [];
  const creator = collection.creator && typeof collection.creator === 'object' ? collection.creator : null;
  return {
    ...collection,
    id: idOf(collection),
    stationId: idOf(collection.station) || collection.stationId || null,
    creatorId: idOf(creator) || collection.creatorId || null,
    recordings,
    broadcastCount: Number(collection.broadcastCount) || recordings.length,
    coverArt: buildMediaUrl(collection.coverArt || null) || recordings[0]?.coverArt || buildGeneratedAudioCoverUrl({
      title: collection.title || collection.name || 'Echoo Collection',
      artistName: creator?.displayName || creator?.username || 'Echoo Creator',
      genre: 'Collection',
    }),
  };
};

const collectionList = (response) => ({
  ...response,
  data: (Array.isArray(response?.data) ? response.data : []).map(normalizeCollection),
});

const collectionOne = (response) => ({ ...response, data: normalizeCollection(response?.data || {}) });

const request = (path, options) => apiRequest(path, options);

const collectionService = {
  getMine: async () => collectionList(await request('/collections/mine/all')),
  getSaved: async () => collectionList(await request('/collections/saved/mine')),
  getForStation: async (stationId) => collectionList(await request(`/collections/station/${encodeURIComponent(stationId)}`)),
  getById: async (collectionId) => collectionOne(await request(`/collections/${encodeURIComponent(collectionId)}`)),
  create: async (payload) => collectionOne(await request('/collections', { method: 'POST', body: JSON.stringify(payload) })),
  update: async (collectionId, payload) => collectionOne(await request(`/collections/${encodeURIComponent(collectionId)}`, { method: 'PATCH', body: JSON.stringify(payload) })),
  updateCover: async (collectionId, cover) => {
    const body = new FormData();
    body.append('cover', cover);
    return collectionOne(await request(`/collections/${encodeURIComponent(collectionId)}`, { method: 'PATCH', body, isFormData: true }));
  },
  delete: async (collectionId) => request(`/collections/${encodeURIComponent(collectionId)}`, { method: 'DELETE' }),
  addRecordings: async (collectionId, recordingIds) => collectionOne(await request(`/collections/${encodeURIComponent(collectionId)}/recordings`, { method: 'POST', body: JSON.stringify({ recordingIds }) })),
  removeRecording: async (collectionId, recordingId) => collectionOne(await request(`/collections/${encodeURIComponent(collectionId)}/recordings/${encodeURIComponent(recordingId)}`, { method: 'DELETE' })),
  reorder: async (collectionId, recordingIds) => collectionOne(await request(`/collections/${encodeURIComponent(collectionId)}/order`, { method: 'PATCH', body: JSON.stringify({ recordingIds }) })),
  save: async (collectionId) => request(`/collections/${encodeURIComponent(collectionId)}/save`, { method: 'POST' }),
  unsave: async (collectionId) => request(`/collections/${encodeURIComponent(collectionId)}/save`, { method: 'DELETE' }),
};

export default collectionService;
