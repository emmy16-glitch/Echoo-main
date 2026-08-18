import batch6Service from './batch6Service.js';

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
  window.dispatchEvent(new CustomEvent('echoo-downloads-updated', { detail: items }));
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
    fileSize: Number(track.fileSize) || 0,
    coverArt: track.coverArt || null,
    fileUrl: track.fileUrl || null,
    cacheUrl: resolveUrl(track.fileUrl),
    downloadedAt: new Date().toISOString(),
  };
};

const findBackendRecord = async (trackId) => {
  const result = await batch6Service.getDownloads({ page:1, limit:100 });
  const records = Array.isArray(result?.data?.downloads) ? result.data.downloads : [];
  return records.find((item) => String(item.trackId) === String(trackId)) || null;
};

const markBackendDownloaded = async (track) => {
  if (!track?.id) return;
  try {
    let record = await findBackendRecord(track.id);
    if (!record) {
      const created = await batch6Service.requestDownload(track.id, 'medium');
      record = created?.data?.download || created?.data || null;
    }
    if (record?.id) {
      await batch6Service.updateDownloadProgress(record.id, {
        progress:100,
        downloadedSize:Number(track.fileSize) || 0,
        status:'completed',
      });
    }
  } catch (error) {
    const code = error?.code || error?.data?.error?.code || '';
    const message = String(error?.message || '').toLowerCase();
    if (code !== 'ALREADY_DOWNLOADED' && !message.includes('already')) {
      console.warn('Echoo download metadata sync:', error);
    }
  }
};

const removeBackendDownload = async (trackId) => {
  if (!trackId) return;
  try {
    const record = await findBackendRecord(trackId);
    if (record?.id) await batch6Service.deleteDownload(record.id);
  } catch (error) {
    console.warn('Echoo download metadata removal:', error);
  }
};

const clearBackendDownloads = async () => {
  try {
    const result = await batch6Service.getDownloads({ page:1, limit:100 });
    const records = Array.isArray(result?.data?.downloads) ? result.data.downloads : [];
    await Promise.allSettled(records.filter((item) => item?.id).map((item) => batch6Service.deleteDownload(item.id)));
  } catch (error) {
    console.warn('Echoo download metadata clear:', error);
  }
};

const downloadService = {
  getAll: () => readDownloads(),

  isDownloaded: (trackId) => readDownloads().some((item) => String(item.id) === String(trackId)),

  download: async (track) => {
    if (!track?.id) throw new Error('This track does not have an ID.');
    if (!track?.fileUrl) throw new Error('This track does not have an audio file.');
    if (!('caches' in window)) throw new Error('Offline storage is not supported in this browser.');

    const cacheUrl = resolveUrl(track.fileUrl);
    const response = await fetch(cacheUrl, { credentials:'omit' });
    if (!response.ok) {
      throw new Error(`Could not download audio. Server returned ${response.status}.`);
    }

    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheUrl, response.clone());

    const item = normalizeDownload(track);
    const current = readDownloads();
    const next = [item, ...current.filter((existing) => String(existing.id) !== String(item.id))];
    writeDownloads(next);

    // Backend metadata is useful across signed-in sessions, but a temporary API
    // failure must never invalidate a successfully cached offline file.
    await markBackendDownloaded(item);
    return item;
  },

  remove: async (trackId) => {
    const current = readDownloads();
    const target = current.find((item) => String(item.id) === String(trackId));

    if (target?.cacheUrl && 'caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(target.cacheUrl);
    }

    const next = current.filter((item) => String(item.id) !== String(trackId));
    writeDownloads(next);
    await removeBackendDownload(trackId);
    return next;
  },

  clear: async () => {
    if ('caches' in window) await caches.delete(CACHE_NAME);
    writeDownloads([]);
    await clearBackendDownloads();
    return [];
  },

  getPlayableUrl: async (trackId) => {
    const target = readDownloads().find((item) => String(item.id) === String(trackId));
    if (!target) throw new Error('Downloaded track not found.');
    if (!('caches' in window)) return target.fileUrl || null;

    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(target.cacheUrl);
    if (!response) return target.fileUrl || null;

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },
};

export default downloadService;
