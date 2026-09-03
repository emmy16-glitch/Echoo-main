import batch6Service from './batch6Service.js';
import audioService from './audioService.js';
import { accountStorageKey, getActiveAccountId } from './accountStorage.js';

const STORAGE_KEY = 'echooDownloads';
const CACHE_NAME = 'echoo-offline-audio-v1';
const OFFLINE_CACHE_PREFIX = '/__echoo-offline-audio/';
const OFFLINE_DB_NAME = 'echoo-offline-audio-v1';
const OFFLINE_DB_STORE = 'audio';
const OFFLINE_DB_VERSION = 1;

let offlineDbPromise = null;

// Offline media is private listener data. Browser Cache and IndexedDB are
// shared by every account that uses this browser, so every key must be scoped
// to the authenticated Echoo user instead of only to the track.
const requireCurrentUserId = () => {
  const userId = getActiveAccountId();
  if (!userId) throw new Error('Sign in to manage offline downloads.');
  return userId;
};

const downloadsStorageKey = () => accountStorageKey(STORAGE_KEY);

const offlineCacheName = () => `${CACHE_NAME}:${requireCurrentUserId()}`;
const offlineRecordId = (trackId) => `${requireCurrentUserId()}:${String(trackId)}`;

const readDownloads = () => {
  try {
    const storageKey = downloadsStorageKey();
    if (!storageKey) return [];
    const saved = localStorage.getItem(storageKey);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeDownloads = (items) => {
  const storageKey = downloadsStorageKey();
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(items));
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

const offlineCacheUrl = (trackId) =>
  resolveUrl(`${OFFLINE_CACHE_PREFIX}${encodeURIComponent(String(trackId || ''))}`);

const cacheStorageAvailable = () =>
  typeof window !== 'undefined' && 'caches' in window;

const indexedDbAvailable = () =>
  typeof indexedDB !== 'undefined';

const openOfflineDb = () => {
  if (!indexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }

  if (offlineDbPromise) return offlineDbPromise;

  offlineDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OFFLINE_DB_STORE)) {
        database.createObjectStore(OFFLINE_DB_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        offlineDbPromise = null;
      };
      resolve(database);
    };

    request.onerror = () => {
      offlineDbPromise = null;
      reject(request.error || new Error('Could not open offline audio storage.'));
    };

    request.onblocked = () => {
      offlineDbPromise = null;
      reject(new Error('Offline audio storage is blocked by another browser tab.'));
    };
  });

  return offlineDbPromise;
};

const putIndexedDbBlob = async (trackId, blob) => {
  const database = await openOfflineDb();

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_DB_STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error || new Error('Could not save offline audio.')
    );
    transaction.onabort = () => reject(
      transaction.error || new Error('Offline audio save was cancelled.')
    );

    transaction.objectStore(OFFLINE_DB_STORE).put({
      id: offlineRecordId(trackId),
      blob,
      size: Number(blob?.size) || 0,
      storedAt: Date.now(),
    });
  });
};

const getIndexedDbBlob = async (trackId) => {
  if (!indexedDbAvailable()) return null;
  const database = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_DB_STORE, 'readonly');
    const request = transaction.objectStore(OFFLINE_DB_STORE).get(offlineRecordId(trackId));

    request.onsuccess = () => {
      const value = request.result;
      resolve(value?.blob instanceof Blob ? value.blob : null);
    };
    request.onerror = () => reject(
      request.error || new Error('Could not read offline audio.')
    );
  });
};

const deleteIndexedDbBlob = async (trackId) => {
  if (!indexedDbAvailable()) return;
  const database = await openOfflineDb();

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_DB_STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error || new Error('Could not remove offline audio.')
    );
    transaction.objectStore(OFFLINE_DB_STORE).delete(offlineRecordId(trackId));
  });
};

const clearIndexedDbAudio = async () => {
  if (!indexedDbAvailable()) return;
  const database = await openOfflineDb();
  const prefix = `${requireCurrentUserId()}:`;

  await new Promise((resolve, reject) => {
    const transaction = database.transaction(OFFLINE_DB_STORE, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(
      transaction.error || new Error('Could not clear offline audio.')
    );
    const store = transaction.objectStore(OFFLINE_DB_STORE);
    const request = store.openCursor();
    request.onerror = () => reject(request.error || new Error('Could not clear offline audio.'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (String(cursor.key).startsWith(prefix)) cursor.delete();
      cursor.continue();
    };
  });
};

const normalizeDownload = (track) => {
  if (!track) return null;
  const id = track.id || track._id || null;
  return {
    id,
    title: track.title || 'Untitled Audio',
    artistName: track.artistName || track.subtitle || 'Echoo Audio',
    genre: track.genre || 'Audio',
    duration: Number(track.duration) || 0,
    fileSize: Number(track.fileSize) || 0,
    coverArt: track.coverArt || null,
    // Never persist a temporary signed stream token in localStorage. Offline
    // bytes are indexed by an Echoo-local stable cache key instead.
    cacheUrl: offlineCacheUrl(id),
    storageMode: track.storageMode || null,
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

const persistOfflineResponse = async (item, response) => {
  let cacheError = null;

  if (cacheStorageAvailable()) {
    try {
      const cache = await caches.open(offlineCacheName());
      await cache.put(item.cacheUrl, response.clone());
      return {
        ...item,
        storageMode: 'cache',
        fileSize:
          Number(response.headers.get('content-length')) ||
          Number(item.fileSize) ||
          0,
      };
    } catch (error) {
      cacheError = error;
      console.warn(
        '[Echoo Downloads] Cache Storage unavailable; trying IndexedDB:',
        error?.message || error
      );
    }
  }

  if (indexedDbAvailable()) {
    try {
      const blob = await response.blob();
      if (!blob?.size) throw new Error('The downloaded audio file was empty.');
      await putIndexedDbBlob(item.id, blob);
      return {
        ...item,
        storageMode: 'indexeddb',
        fileSize: Number(blob.size) || Number(item.fileSize) || 0,
      };
    } catch (error) {
      console.warn(
        '[Echoo Downloads] IndexedDB offline storage failed:',
        error?.message || error
      );
      throw new Error(
        'This browser could not save the audio for offline listening. Check that site storage is allowed and private/incognito mode is off.',
        { cause: error }
      );
    }
  }

  if (cacheError) {
    throw new Error(
      'This browser blocked offline storage. Check site storage permissions or use a normal browser tab.'
    );
  }

  throw new Error(
    'Offline storage is not available in this browser. Try a current Chrome, Edge, Firefox, or Safari browser outside private mode.'
  );
};

const downloadService = {
  getAll: () => readDownloads(),

  isDownloaded: (trackId) => readDownloads().some((item) => String(item.id) === String(trackId)),

  download: async (track) => {
    if (!track?.id) throw new Error('This track does not have an ID.');

    // Always mint a fresh protected playback URL at download time instead of
    // trusting a possibly old token embedded in track metadata.
    const { streamUrl } = await audioService.getStreamUrl(track.id);
    const response = await fetch(streamUrl, { credentials:'omit' });
    if (!response.ok) {
      throw new Error(`Could not download audio. Server returned ${response.status}.`);
    }

    const item = normalizeDownload(track);
    const storedItem = await persistOfflineResponse(item, response);

    const current = readDownloads();
    const next = [storedItem, ...current.filter((existing) => String(existing.id) !== String(storedItem.id))];
    writeDownloads(next);

    // Backend metadata is useful across signed-in sessions, but a temporary API
    // failure must never invalidate a successfully stored offline file.
    await markBackendDownloaded(storedItem);
    return storedItem;
  },

  remove: async (trackId) => {
    const current = readDownloads();
    const target = current.find((item) => String(item.id) === String(trackId));
    const cleanupTasks = [];

    if (cacheStorageAvailable()) {
      cleanupTasks.push((async () => {
        const cache = await caches.open(offlineCacheName());
        if (target?.cacheUrl) await cache.delete(target.cacheUrl);
        // Also clear the stable cache key in case this is a pre-migration record.
        await cache.delete(offlineCacheUrl(trackId));
      })());
    }

    if (indexedDbAvailable()) {
      cleanupTasks.push(deleteIndexedDbBlob(trackId));
    }

    if (cleanupTasks.length) await Promise.allSettled(cleanupTasks);

    const next = current.filter((item) => String(item.id) !== String(trackId));
    writeDownloads(next);
    await removeBackendDownload(trackId);
    return next;
  },

  clear: async () => {
    const cleanupTasks = [];
    if (cacheStorageAvailable()) cleanupTasks.push(caches.delete(offlineCacheName()));
    if (indexedDbAvailable()) cleanupTasks.push(clearIndexedDbAudio());
    if (cleanupTasks.length) await Promise.allSettled(cleanupTasks);

    writeDownloads([]);
    await clearBackendDownloads();
    return [];
  },

  getPlayableUrl: async (trackId) => {
    if (!trackId) throw new Error('Downloaded track does not have an ID.');
    const target = readDownloads().find((item) => String(item.id) === String(trackId));

    if (target && cacheStorageAvailable()) {
      try {
        const cache = await caches.open(offlineCacheName());
        const preferredKey = target.cacheUrl || offlineCacheUrl(trackId);
        let response = preferredKey ? await cache.match(preferredKey) : null;

        // Migration path for records written before stable cache keys existed.
        if (!response && preferredKey !== offlineCacheUrl(trackId)) {
          response = await cache.match(offlineCacheUrl(trackId));
        }

        if (response) {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      } catch (error) {
        console.warn(
          '[Echoo Downloads] Cache Storage playback failed; checking IndexedDB:',
          error?.message || error
        );
      }
    }

    if (target && indexedDbAvailable()) {
      try {
        const blob = await getIndexedDbBlob(trackId);
        if (blob?.size) return URL.createObjectURL(blob);
      } catch (error) {
        console.warn(
          '[Echoo Downloads] IndexedDB playback failed:',
          error?.message || error
        );
      }
    }

    // Backend download rows can exist without a browser-local copy (for example
    // after a fresh login, cleared site storage, or another device). In that
    // case, obtain a fresh protected stream rather than failing before playback.
    const { streamUrl } = await audioService.getStreamUrl(trackId);
    return streamUrl;
  },
};

export default downloadService;
