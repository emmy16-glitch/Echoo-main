const idOf = (value) => String(value?.id || value?._id || value || '');

const uniqueText = (values) => [...new Set(
  values
    .flat()
    .map((value) => String(value || '').trim())
    .filter(Boolean)
)];

export const CHANNEL_LANGUAGE_NAMES = {
  en: 'English',
  pcm: 'Pidgin',
  yo: 'Yoruba',
  ha: 'Hausa',
};

export const buildChannelRows = ({
  stations = [],
  liveBroadcasts = [],
  currentUserId = '',
  ownedStationIds = [],
}) => {
  const userId = idOf(currentUserId);
  const ownedIds = new Set(ownedStationIds.map(idOf).filter(Boolean));
  const liveByStation = new Map();

  liveBroadcasts.forEach((broadcast) => {
    if (String(broadcast?.status || '').toLowerCase() !== 'live') return;
    const stationId = idOf(broadcast.stationId || broadcast.station);
    if (!stationId || liveByStation.has(stationId)) return;
    liveByStation.set(stationId, broadcast);
  });

  const byCreator = new Map();
  stations.forEach((station) => {
    if (!station || station.isPublic === false) return;
    const stationId = idOf(station);
    const ownerId = idOf(station.ownerId || station.owner);
    if (!stationId || ownedIds.has(stationId) || (userId && ownerId === userId)) return;

    const broadcast = liveByStation.get(stationId) || null;
    const row = {
      id: stationId,
      station,
      broadcast,
      ownerId,
      name: station.name || 'Echoo station',
      description:
        broadcast?.title && broadcast.title !== station.name
          ? broadcast.title
          : station.description || broadcast?.description || '',
      artwork:
        broadcast?.eventArtwork || broadcast?.coverArt || broadcast?.artwork || station.coverArt ||
        station.brandCover || station.logo || null,
      category: station.category || '',
      tags: uniqueText([
        station.category,
        Array.isArray(station.tags) ? station.tags : [],
        Array.isArray(broadcast?.tags) ? broadcast.tags : [],
      ]).slice(0, 3),
      isLive: Boolean(broadcast),
      listenerCount: broadcast
        ? Math.max(0, Number(broadcast.listenerCount) || 0)
        : Math.max(0, Number(station.listenerCount) || 0),
      languageCode: String(broadcast?.captionSettings?.language || '').toLowerCase(),
      liveStartedAt: broadcast?.startedAt || broadcast?.startTime || '',
      createdAt: station.createdAt || station.updatedAt || '',
      searchableText: uniqueText([
        station.name,
        station.description,
        station.category,
        station.tags || [],
        broadcast?.title,
        broadcast?.description,
        broadcast?.tags || [],
      ]).join(' ').toLowerCase(),
    };

    const creatorKey = ownerId || stationId;
    const previous = byCreator.get(creatorKey);
    if (
      !previous ||
      Number(row.isLive) > Number(previous.isLive) ||
      (row.isLive === previous.isLive && row.listenerCount > previous.listenerCount)
    ) {
      byCreator.set(creatorKey, row);
    }
  });

  return [...byCreator.values()];
};

export const filterAndSortChannels = (
  rows,
  {
    query = '',
    category = 'All',
    language = 'All',
    minimumAudience = 0,
    maximumAudience = Number.POSITIVE_INFINITY,
    status = 'live',
    sort = 'live',
  } = {}
) => {
  const normalizedQuery = String(query).trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (status === 'live' && !row.isLive) return false;
    if (category !== 'All' && row.category !== category) return false;
    if (language !== 'All' && row.languageCode !== language) return false;
    if (row.listenerCount < Number(minimumAudience || 0)) return false;
    if (row.listenerCount > Number(maximumAudience)) return false;
    return !normalizedQuery || row.searchableText.includes(normalizedQuery);
  });

  return [...filtered].sort((first, second) => {
    if (sort === 'listeners') return second.listenerCount - first.listenerCount;
    if (sort === 'newest') {
      return new Date(second.createdAt || 0) - new Date(first.createdAt || 0);
    }
    return (
      Number(second.isLive) - Number(first.isLive) ||
      second.listenerCount - first.listenerCount ||
      new Date(second.liveStartedAt || second.createdAt || 0) -
        new Date(first.liveStartedAt || first.createdAt || 0)
    );
  });
};

export const audienceCeiling = (rows) => {
  const maximum = Math.max(0, ...rows.map((row) => Number(row.listenerCount) || 0));
  if (maximum <= 10) return 10;
  const magnitude = 10 ** Math.max(1, String(Math.floor(maximum)).length - 1);
  return Math.ceil(maximum / magnitude) * magnitude;
};
