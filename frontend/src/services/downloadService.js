const STORAGE_KEY = 'echooDownloads';
const CACHE_NAME = 'echoo-offline-audio-v1';

const readDownloads = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeDownloads = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const resolveUrl = (value) => {
  if (!value) return null;

  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
};

const normalizeDownload = (track) => {
  if (!track) return null;

  return {
    id: track.id || track._id || null,
    title: track.title || 'Untitled Audio',
    artistName: track.artistName || track.subtitle || 'Echoo Audio',
    genre: track.genre || 'Audio',
    duration: Number(track.duration) || 0,
    coverArt: track.coverArt || null,
    fileUrl: track.fileUrl || null,
    cacheUrl: resolveUrl(track.fileUrl),
    downloadedAt: new Date().toISOString(),
  };
};

const downloadService = {
  getAll: () => readDownloads(),

  isDownloaded: (trackId) => {
    return readDownloads().some(
      (item) => String(item.id) === String(trackId)
    );
  },

  download: async (track) => {
    if (!track?.id) {
      throw new Error('This track does not have an ID.');
    }

    if (!track?.fileUrl) {
      throw new Error('This track does not have an audio file.');
    }

    if (!('caches' in window)) {
      throw new Error('Offline storage is not supported in this browser.');
    }

    const cacheUrl = resolveUrl(track.fileUrl);
    const response = await fetch(cacheUrl, { credentials: 'include' });

    if (!response.ok) {
      throw new Error(
        `Could not download audio. Server returned ${response.status}.`
      );
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheUrl, response.clone());

    const item = normalizeDownload(track);
    const current = readDownloads();
    const withoutExisting = current.filter(
      (existing) => String(existing.id) !== String(item.id)
    );
    const next = [item, ...withoutExisting];
    writeDownloads(next);
    return item;
  },

  remove: async (trackId) => {
    const current = readDownloads();
    const target = current.find(
      (item) => String(item.id) === String(trackId)
    );

    if (target?.cacheUrl && 'caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(target.cacheUrl);
    }

    const next = current.filter(
      (item) => String(item.id) !== String(trackId)
    );
    writeDownloads(next);
    return next;
  },

  clear: async () => {
    if ('caches' in window) {
      await caches.delete(CACHE_NAME);
    }
    writeDownloads([]);
    return [];
  },

  getPlayableUrl: async (trackId) => {
    const target = readDownloads().find(
      (item) => String(item.id) === String(trackId)
    );

    if (!target) {
      throw new Error('Downloaded track not found.');
    }

    if (!('caches' in window)) {
      return target.fileUrl || null;
    }

    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(target.cacheUrl);

    if (!response) {
      return target.fileUrl || null;
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};

export default downloadService;
