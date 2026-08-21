import { apiRequest, buildMediaUrl } from './api.js';
import { buildGeneratedStationBrandCoverUrl } from '../stationBranding/stationBranding.js';

const queryString = (values = {}) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : '';
};

const normalizeId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.id || value._id || null;
};

const normalizeOwner = (owner) => {
  if (!owner) {
    return { id: null, username: '', displayName: '', avatar: null };
  }
  if (typeof owner === 'string') {
    return { id: owner, username: '', displayName: '', avatar: null };
  }

  return {
    ...owner,
    id: owner.id || owner._id || null,
    username: owner.username || '',
    displayName: owner.displayName || owner.fullname || owner.username || '',
    avatar: buildMediaUrl(owner.avatar || owner.profileImage || null),
  };
};

const versionManagedStationLogo = (url, updatedAt) => {
  if (!url || !updatedAt) return url;
  if (!String(url).includes('/uploads/stations/')) return url;

  const version = new Date(updatedAt).getTime();
  if (!Number.isFinite(version)) return url;

  return `${url}${String(url).includes('?') ? '&' : '?'}v=${version}`;
};

export const normalizeStation = (station) => {
  if (!station) return null;

  const owner = normalizeOwner(station.owner);
  const rawStoredArt = buildMediaUrl(
    station.logo || station.coverArt || station.artwork || station.image || null
  );
  const storedIsGeneratedSvg = Boolean(
    rawStoredArt && String(rawStoredArt).startsWith('data:image/svg+xml')
  );
  const inferredMode = rawStoredArt && !storedIsGeneratedSvg
    ? 'custom'
    : station.branding?.mode || 'generated';
  const customLogo = inferredMode === 'custom'
    ? versionManagedStationLogo(rawStoredArt, station.updatedAt)
    : null;
  const storedGeneratedCover = inferredMode === 'generated' && storedIsGeneratedSvg
    ? rawStoredArt
    : null;
  const branding = {
    mode: inferredMode,
    variant: Number.isInteger(Number(station.branding?.variant))
      ? Number(station.branding.variant)
      : undefined,
    version: Number(station.branding?.version) || 1,
  };

  const baseStation = {
    ...station,
    id: station.id || station._id || null,
    _id: station._id || station.id || null,
    owner,
    ownerId: owner.id,
    ownerName: owner.displayName || owner.username || 'Echoo Creator',
    creatorId: owner.id,
    creatorName: owner.displayName || owner.username || 'Echoo Creator',
    name: station.name || 'Untitled Station',
    title: station.name || 'Untitled Station',
    description: station.description || '',
    category: station.category || 'Other',
    branding,
    logo: customLogo,
    customLogo,
    isLive: Boolean(station.isLive),
    listenerCount: Number(station.listenerCount) || 0,
    listeners: Number(station.listenerCount) || 0,
    followerCount: Number(station.followerCount) || 0,
    followers: Number(station.followerCount) || 0,
    isPublic: station.isPublic !== false,
    tags: Array.isArray(station.tags) ? station.tags : [],
  };

  const generatedCover = buildGeneratedStationBrandCoverUrl(baseStation);
  const brandCover = customLogo || storedGeneratedCover || generatedCover;

  return {
    ...baseStation,
    brandCover,
    coverArt: brandCover,
    artwork: brandCover,
    image: brandCover,
  };
};

export const normalizeBroadcast = (broadcast) => {
  if (!broadcast) return null;

  const stationObject =
    typeof broadcast.station === 'object' ? broadcast.station : null;
  const creatorObject =
    typeof broadcast.creator === 'object' ? broadcast.creator : null;
  const stationId = normalizeId(broadcast.station) || broadcast.stationId || null;
  const creatorId = normalizeId(broadcast.creator) || broadcast.creatorId || null;
  const normalizedStation = stationObject ? normalizeStation(stationObject) : null;
  const coverArt =
    normalizedStation?.brandCover ||
    buildMediaUrl(broadcast.coverArt || null);
  const status = broadcast.status || 'scheduled';

  return {
    ...broadcast,
    id: broadcast.id || broadcast._id || null,
    _id: broadcast._id || broadcast.id || null,
    title: broadcast.title || 'Untitled Broadcast',
    description: broadcast.description || '',
    station: normalizedStation || broadcast.station,
    stationId,
    stationName: stationObject?.name || broadcast.stationName || 'Echoo Station',
    stationSlug: stationObject?.slug || null,
    stationBranding: normalizedStation?.branding || broadcast.stationBranding || null,
    creatorId,
    creatorName:
      creatorObject?.displayName ||
      creatorObject?.username ||
      broadcast.creatorName ||
      'Echoo Creator',
    creatorAvatar: buildMediaUrl(creatorObject?.avatar || null),
    coverArt,
    artwork: coverArt,
    image: coverArt,
    status,
    isLive: status === 'live',
    isUpcoming: status === 'scheduled',
    listenerCount: Number(broadcast.listenerCount) || 0,
    listeners: Number(broadcast.listenerCount) || 0,
    peakListeners: Number(broadcast.peakListeners) || 0,
    startTime: broadcast.startTime || broadcast.startAt || null,
    endTime: broadcast.endTime || null,
    startAt: broadcast.startTime || broadcast.startAt || null,
    type: broadcast.type || 'live',
    duration: Number(broadcast.duration) || 0,
    isPublic: broadcast.isPublic !== false,
    tags: Array.isArray(broadcast.tags) ? broadcast.tags : [],
  };
};

const normalizeStationList = (response) => {
  const data = response?.data;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.stations)
      ? data.stations
      : [];
  return list.map(normalizeStation).filter(Boolean);
};

const normalizeBroadcastList = (response) => {
  const data = response?.data;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.broadcasts)
      ? data.broadcasts
      : [];
  return list.map(normalizeBroadcast).filter(Boolean);
};

const stationFormData = (payload = {}) => {
  const form = new FormData();

  if (payload.name !== undefined) form.append('name', payload.name || '');
  if (payload.description !== undefined) form.append('description', payload.description || '');
  if (payload.category !== undefined) form.append('category', payload.category || 'Other');
  if (payload.tags !== undefined) {
    form.append('tags', JSON.stringify(Array.isArray(payload.tags) ? payload.tags : []));
  }
  if (payload.isPublic !== undefined) form.append('isPublic', String(payload.isPublic !== false));
  if (payload.removeLogo !== undefined) form.append('removeLogo', String(Boolean(payload.removeLogo)));
  if (payload.brandingMode !== undefined) form.append('brandingMode', payload.brandingMode || 'generated');
  if (payload.brandingVariant !== undefined) form.append('brandingVariant', String(payload.brandingVariant));

  if (payload.brandingMode === 'generated') {
    const generatedCoverArt = payload.generatedCoverArt || buildGeneratedStationBrandCoverUrl({
      id: payload.id || `station-${payload.brandingVariant ?? 0}`,
      name: payload.name || 'Echoo Station',
      category: payload.category || 'Other',
      branding: {
        mode: 'generated',
        variant: Number(payload.brandingVariant) || 0,
        version: 1,
      },
    });
    form.append('generatedCoverArt', generatedCoverArt);
  }

  const logoFile = payload.logoFile;
  if (logoFile && typeof logoFile === 'object' && typeof logoFile.name === 'string') {
    form.append('logo', logoFile, logoFile.name);
  }

  return form;
};

const refreshWrittenStation = async (writtenResponse, payload = {}) => {
  const written = normalizeStation(writtenResponse?.data);
  if (!written?.id) {
    throw new Error('Echoo did not return the saved station.');
  }

  const refreshedResponse = await apiRequest('/stations/mine/all');
  const refreshedStations = normalizeStationList(refreshedResponse);
  const canonical = refreshedStations.find(
    (station) => String(station.id) === String(written.id)
  );

  if (!canonical) {
    throw new Error('The station saved, but Echoo could not reload it from the backend.');
  }

  if (payload.logoFile && !canonical.logo) {
    throw new Error(
      'The station details saved, but the logo was not stored. Restart the Echoo backend and try the logo upload again.'
    );
  }

  if (payload.brandingMode === 'generated' && canonical.branding?.mode !== 'generated') {
    throw new Error('Echoo could not switch this station back to its generated brand.');
  }

  if (payload.removeLogo && canonical.logo) {
    throw new Error('Echoo could not remove the station logo. Please try again.');
  }

  return canonical;
};

const sanitizeBroadcastPayload = (payload = {}) => {
  const next = { ...payload };
  if (typeof next.coverArt === 'string' && next.coverArt.startsWith('data:image/svg+xml')) {
    next.coverArt = null;
  }
  return next;
};

const batch2Service = {
  listStations: async (options = {}) => {
    const response = await apiRequest(
      `/stations${queryString({
        page: options.page || 1,
        limit: options.limit || 100,
        category: options.category,
        search: options.search,
        featured: options.featured,
        live: options.live,
      })}`,
      {
        skipAuth: true,
        skipRefresh: true,
        ...(options.cache ? { cache: options.cache } : {}),
      }
    );
    return { ...response, data: normalizeStationList(response) };
  },

  getMyStations: async () => {
    const response = await apiRequest('/stations/mine/all');
    return { ...response, data: normalizeStationList(response) };
  },

  getStation: async (stationId) => {
    const response = await apiRequest(
      `/stations/${encodeURIComponent(stationId)}`,
      {
        skipAuth: true,
        skipRefresh: true,
        cache: 'no-store',
      }
    );
    return { ...response, data: normalizeStation(response?.data) };
  },

  createStation: async (payload) => {
    const response = await apiRequest('/stations', {
      method: 'POST',
      body: stationFormData(payload),
      isFormData: true,
    });
    const canonical = await refreshWrittenStation(response, payload);
    return { ...response, data: canonical };
  },

  updateStation: async (stationId, payload) => {
    const response = await apiRequest(
      `/stations/${encodeURIComponent(stationId)}`,
      {
        method: 'PATCH',
        body: stationFormData(payload),
        isFormData: true,
      }
    );
    const canonical = await refreshWrittenStation(response, payload);
    return { ...response, data: canonical };
  },

  deleteStation: async (stationId) =>
    apiRequest(`/stations/${encodeURIComponent(stationId)}`, {
      method: 'DELETE',
    }),

  listBroadcasts: async (options = {}) => {
    const response = await apiRequest(
      `/broadcasts${queryString({
        page: options.page || 1,
        limit: options.limit || 100,
        stationId: options.stationId,
        status: options.status,
        startDate: options.startDate,
        endDate: options.endDate,
        search: options.search,
        type: options.type,
        isRecurring: options.isRecurring,
      })}`,
      {
        skipAuth: true,
        skipRefresh: true,
        ...(options.cache ? { cache: options.cache } : {}),
      }
    );
    return { ...response, data: normalizeBroadcastList(response) };
  },

  getCreatorBroadcasts: async () => {
    const response = await apiRequest('/broadcasts/mine/all');
    return { ...response, data: normalizeBroadcastList(response) };
  },

  createBroadcast: async (payload) => {
    const response = await apiRequest('/broadcasts', {
      method: 'POST',
      body: JSON.stringify(sanitizeBroadcastPayload(payload)),
    });
    return { ...response, data: normalizeBroadcast(response?.data) };
  },

  updateBroadcast: async (broadcastId, payload) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(sanitizeBroadcastPayload(payload)),
      }
    );
    return { ...response, data: normalizeBroadcast(response?.data) };
  },

  cancelBroadcast: async (broadcastId) => {
    const response = await apiRequest(
      `/broadcasts/${encodeURIComponent(broadcastId)}/cancel`,
      { method: 'POST' }
    );
    return { ...response, data: normalizeBroadcast(response?.data) };
  },

  deleteBroadcast: async (broadcastId) =>
    apiRequest(`/broadcasts/${encodeURIComponent(broadcastId)}`, {
      method: 'DELETE',
    }),

  getUpcomingBroadcasts: async (stationId) => {
    const response = await apiRequest(
      `/broadcasts/station/${encodeURIComponent(stationId)}/upcoming`,
      { skipAuth: true, skipRefresh: true }
    );
    return { ...response, data: normalizeBroadcastList(response) };
  },

  getLiveBroadcast: async (stationId) => {
    const response = await apiRequest(
      `/broadcasts/station/${encodeURIComponent(stationId)}/live`,
      { skipAuth: true, skipRefresh: true }
    );
    return { ...response, data: normalizeBroadcast(response?.data) };
  },
};

export default batch2Service;
