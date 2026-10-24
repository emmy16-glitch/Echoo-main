import { apiRequest, buildMediaUrl } from './api.js';
import { buildGeneratedAudioCoverUrl } from '../audioCover/audioCover.js';
import {
  loadNavigationData,
  readNavigationData,
  invalidateNavigationData,
} from './navigationDataCache.js';

const idOf = (value) => value?.id || value?._id || value || null;

const normalizeRecording = (recording = {}) => ({
  ...recording,
  id: idOf(recording),
  coverArt: buildMediaUrl(recording.coverArt || recording.artwork || recording.image || null),
});

export const normalizeCollection = (collection = {}) => {
  const nestedTracks = Array.isArray(collection.tracks)
    ? collection.tracks.map((entry) => entry?.trackId || entry).filter((entry) => entry && typeof entry === 'object' && (entry.title || entry.fileUrl))
    : [];
  const recordings = (Array.isArray(collection.recordings) ? collection.recordings : nestedTracks).map(normalizeRecording);
  const countCandidate = [collection.broadcastCount, collection.trackCount, recordings.length]
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value > 0);
  const recordingCount = countCandidate ?? 0;
  const creator = collection.creator && typeof collection.creator === 'object' ? collection.creator : null;
  return {
    ...collection,
    id: idOf(collection),
    stationId: idOf(collection.station) || collection.stationId || null,
    creatorId: idOf(creator) || collection.creatorId || null,
    recordings,
    broadcastCount: recordingCount,
    trackCount: recordingCount,
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
const idOfCollection = (collection) => String(collection?.id || collection?._id || '');
const uniqueCollections = (items) => {
  const seen = new Set();
  return (items || []).filter((item) => {
    const id = idOfCollection(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};
const publicKey = (page, limit) => `listener-published-collections-${page}-${limit}`;
const detailKey = (id) => `listener-collection-${id}`;
const stationKey = (id) => `listener-station-collections-${id}`;
const cachedResponse = (key) => readNavigationData(key)?.data || null;
const loadCached = (key, loader, force = false) =>
  loadNavigationData(key, loader, { ttlMs: 90_000, force });

const collectionService = {
  getMine: async () => collectionList(await request('/collections/mine/all')),
  getSaved: async () => collectionList(await request('/collections/saved/mine')),
  peekPublic: ({ page = 1, limit = 40 } = {}) => cachedResponse(publicKey(page, limit)),
  peekById: (id) => cachedResponse(detailKey(id)),
  getPublic: async ({ page = 1, limit = 40, force = false } = {}) => {
    const key = publicKey(page, limit);
    return { data: await loadCached(key, async () => {
      let response;
      try {
        // The Collections API returns the correct visible recording count.
        response = await request(`/collections/public?page=${page}&limit=${limit}`);
      } catch (error) {
        // Older deployed backends may only expose the playlist series alias.
        if (Number(error?.status) !== 404) throw error;
        response = await request(`/playlists?mode=series&page=${page}&limit=${limit}`);
      }
      const all = collectionList(response).data;
      return uniqueCollections(all.filter((item) => item.mode === 'series' && item.isPublic === true));
    }, force) };
  },
  getForStation: async (stationId, { force = false } = {}) => ({
    data: await loadCached(stationKey(stationId), async () =>
      uniqueCollections(collectionList(await request(`/collections/station/${encodeURIComponent(stationId)}`)).data), force),
  }),
  getById: async (collectionId, { force = false } = {}) => ({
    data: await loadCached(detailKey(collectionId), async () =>
      collectionOne(await request(`/collections/${encodeURIComponent(collectionId)}`)).data, force),
  }),
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
  save: async (collectionId) => {
    const response = await request(`/collections/${encodeURIComponent(collectionId)}/save`, { method: 'POST' });
    invalidateNavigationData(detailKey(collectionId));
    return response;
  },
  unsave: async (collectionId) => {
    const response = await request(`/collections/${encodeURIComponent(collectionId)}/save`, { method: 'DELETE' });
    invalidateNavigationData(detailKey(collectionId));
    return response;
  },
};

export default collectionService;
