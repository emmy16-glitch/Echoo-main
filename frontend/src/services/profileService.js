import { apiRequest, buildMediaUrl } from './api.js';
import batch2Service, {
  normalizeBroadcast as normalizeCanonicalBroadcast,
  normalizeStation as normalizeCanonicalStation,
} from './batch2Service.js';

const normalizeTrack = (track) => {
  if (!track) return null;
  return {
    ...track,
    id: track.id || track._id || null,
    fileUrl: buildMediaUrl(track.fileUrl || null),
    coverArt: buildMediaUrl(track.coverArt || null),
  };
};

const normalizeStation = (station) => normalizeCanonicalStation(station);

const normalizeBroadcast = (broadcast) => normalizeCanonicalBroadcast(broadcast);

const normalizeProfile = (profile) => {
  if (!profile) return null;

  return {
    ...profile,
    id: profile.id || profile._id || null,
    avatar: buildMediaUrl(
      profile.avatar || profile.creatorProfile?.organizationLogo || null
    ),
    content: Array.isArray(profile.content)
      ? profile.content.map(normalizeTrack).filter(Boolean)
      : [],
    stations: Array.isArray(profile.stations)
      ? profile.stations.map(normalizeStation).filter(Boolean)
      : [],
    liveBroadcast: normalizeBroadcast(profile.liveBroadcast),
    recentBroadcasts: Array.isArray(profile.recentBroadcasts)
      ? profile.recentBroadcasts.map(normalizeBroadcast).filter(Boolean)
      : [],
  };
};

const applyCanonicalStations = (profile, canonicalStations = []) => {
  if (!profile) return null;

  const stationMap = new Map(
    canonicalStations
      .filter((station) => station?.id)
      .map((station) => [String(station.id), station])
  );

  const stations = profile.stations.map(
    (station) => stationMap.get(String(station.id)) || station
  );

  const enrichBroadcast = (broadcast) => {
    if (!broadcast) return null;
    const station = stationMap.get(String(broadcast.stationId)) || null;
    const artwork = station?.brandCover || station?.coverArt || broadcast.coverArt || null;

    return {
      ...broadcast,
      station: station || broadcast.station,
      stationName: station?.name || broadcast.stationName,
      stationBranding: station?.branding || broadcast.stationBranding || null,
      coverArt: artwork,
      artwork,
      image: artwork,
    };
  };

  return {
    ...profile,
    stations,
    liveBroadcast: enrichBroadcast(profile.liveBroadcast),
    recentBroadcasts: profile.recentBroadcasts.map(enrichBroadcast).filter(Boolean),
  };
};

const profileService = {
  getProfile: async (identifier) => {
    const [response, stationsResult] = await Promise.all([
      apiRequest(
        `/profile/${encodeURIComponent(identifier)}`,
        {
          skipAuth: true,
          skipRefresh: true,
        }
      ),
      batch2Service.listStations({ page: 1, limit: 100 }).catch(() => ({ data: [] })),
    ]);

    const profile = normalizeProfile(response?.data);
    const canonicalStations = Array.isArray(stationsResult?.data)
      ? stationsResult.data
      : [];

    return {
      ...response,
      data: applyCanonicalStations(profile, canonicalStations),
    };
  },

  getMine: async () => {
    const response = await apiRequest('/profile/me');
    return {
      ...response,
      data: normalizeProfile(response?.data),
    };
  },

  normalizeProfile,
};

export default profileService;
