import { Platform } from 'react-native';

type CacheRecord<T> = {
  savedAt: number;
  value: T;
};

type CacheOptions = {
  maxAgeMs: number;
  staleAgeMs?: number;
  forceRefresh?: boolean;
};

type FileSystemModule = {
  documentDirectory?: string | null;
  makeDirectoryAsync: (fileUri: string, options?: { intermediates?: boolean }) => Promise<void>;
  readAsStringAsync: (fileUri: string) => Promise<string>;
  writeAsStringAsync: (fileUri: string, contents: string) => Promise<void>;
  deleteAsync: (fileUri: string, options?: { idempotent?: boolean }) => Promise<void>;
};

const memoryCache = new Map<string, CacheRecord<unknown>>();
const refreshes = new Map<string, Promise<unknown>>();
const webStore = new Map<string, string>();
const CACHE_DIR_NAME = 'echoo-api-cache';

async function loadFileSystem(): Promise<FileSystemModule | null> {
  if (Platform.OS === 'web') return null;
  return import('expo-file-system/legacy') as Promise<FileSystemModule>;
}

function hashKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function cachePath(key: string) {
  const FileSystem = await loadFileSystem();
  if (!FileSystem?.documentDirectory) return null;
  const directory = `${FileSystem.documentDirectory}${CACHE_DIR_NAME}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true }).catch(() => undefined);
  return `${directory}${hashKey(key)}.json`;
}

async function readDiskRecord<T>(key: string): Promise<CacheRecord<T> | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = webStore.get(key);
      return raw ? JSON.parse(raw) : null;
    }

    const FileSystem = await loadFileSystem();
    const path = await cachePath(key);
    if (!FileSystem || !path) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path));
  } catch {
    return null;
  }
}

async function writeDiskRecord<T>(key: string, record: CacheRecord<T>) {
  try {
    const serialized = JSON.stringify(record);
    if (Platform.OS === 'web') {
      webStore.set(key, serialized);
      return;
    }

    const FileSystem = await loadFileSystem();
    const path = await cachePath(key);
    if (FileSystem && path) await FileSystem.writeAsStringAsync(path, serialized);
  } catch {
    // Cache writes are best-effort and should never block listening.
  }
}

function isUsable(record: CacheRecord<unknown>, maxAgeMs: number) {
  return Date.now() - record.savedAt <= maxAgeMs;
}

function isStaleButUsable(record: CacheRecord<unknown>, staleAgeMs: number) {
  return Date.now() - record.savedAt <= staleAgeMs;
}

async function refreshCache<T>(key: string, loader: () => Promise<T>) {
  if (refreshes.has(key)) return refreshes.get(key) as Promise<T>;

  const refresh = loader()
    .then(async (value) => {
      const record = { savedAt: Date.now(), value };
      memoryCache.set(key, record);
      await writeDiskRecord(key, record);
      return value;
    })
    .finally(() => {
      refreshes.delete(key);
    });

  refreshes.set(key, refresh);
  return refresh;
}

export async function getCachedJson<T>(
  key: string,
  options: CacheOptions,
  loader: () => Promise<T>
): Promise<T> {
  const staleAgeMs = Math.max(options.maxAgeMs, options.staleAgeMs || options.maxAgeMs);
  const memory = memoryCache.get(key) as CacheRecord<T> | undefined;

  if (options.forceRefresh) {
    try {
      return await refreshCache(key, loader);
    } catch (error) {
      const disk = await readDiskRecord<T>(key);
      if (disk) return disk.value;
      if (memory) return memory.value;
      throw error;
    }
  }

  if (memory && isUsable(memory, options.maxAgeMs)) return memory.value;
  if (memory && isStaleButUsable(memory, staleAgeMs)) {
    void refreshCache(key, loader).catch(() => undefined);
    return memory.value;
  }

  const disk = await readDiskRecord<T>(key);
  if (disk) {
    memoryCache.set(key, disk);
    if (isUsable(disk, options.maxAgeMs)) return disk.value;
    if (isStaleButUsable(disk, staleAgeMs)) {
      void refreshCache(key, loader).catch(() => undefined);
      return disk.value;
    }
  }

  try {
    return await refreshCache(key, loader);
  } catch (error) {
    if (disk) return disk.value;
    if (memory) return memory.value;
    throw error;
  }
}

export async function peekCachedJson<T>(key: string): Promise<T | null> {
  const memory = memoryCache.get(key) as CacheRecord<T> | undefined;
  if (memory) return memory.value;

  const disk = await readDiskRecord<T>(key);
  if (!disk) return null;
  memoryCache.set(key, disk);
  return disk.value;
}

export async function deleteCachedJson(key: string) {
  memoryCache.delete(key);
  refreshes.delete(key);

  try {
    if (Platform.OS === 'web') {
      webStore.delete(key);
      return;
    }

    const FileSystem = await loadFileSystem();
    const path = await cachePath(key);
    if (FileSystem && path) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // Cache deletes are best-effort.
  }
}
