import { accountStorageKey, getActiveAccountId } from './accountStorage.js';

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'echooNavigationDataV1';
const memory = new Map();
const pending = new Map();
const listeners = new Map();

const storageKey = (key, scope = 'account') => {
  if (scope === 'public') return `${CACHE_PREFIX}:public:${key}`;
  const scoped = accountStorageKey(`${CACHE_PREFIX}:${key}`);
  return scoped || `${CACHE_PREFIX}:guest:${key}`;
};

const notify = (key, entry) => {
  for (const listener of listeners.get(key) || []) listener(entry);
};

export const readNavigationData = (key, { scope = 'account' } = {}) => {
  const resolved = storageKey(key, scope);
  if (memory.has(resolved)) return memory.get(resolved);
  try {
    const parsed = JSON.parse(localStorage.getItem(resolved) || 'null');
    if (!parsed || parsed.version !== CACHE_VERSION || !('data' in parsed)) {
      localStorage.removeItem(resolved);
      return null;
    }
    memory.set(resolved, parsed);
    return parsed;
  } catch {
    try { localStorage.removeItem(resolved); } catch { /* best effort */ }
    return null;
  }
};

export const writeNavigationData = (key, data, { scope = 'account', ttlMs = 60_000 } = {}) => {
  const resolved = storageKey(key, scope);
  const entry = {
    version: CACHE_VERSION,
    savedAt: Date.now(),
    expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0),
    data,
  };
  memory.set(resolved, entry);
  try { localStorage.setItem(resolved, JSON.stringify(entry)); } catch { /* memory cache still works */ }
  notify(resolved, entry);
  return entry;
};

export const isNavigationDataFresh = (entry, now = Date.now()) => (
  Boolean(entry) && Number(entry.expiresAt || 0) > now
);

export const loadNavigationData = async (
  key,
  loader,
  { scope = 'account', ttlMs = 60_000, force = false } = {}
) => {
  const resolved = storageKey(key, scope);
  const cached = readNavigationData(key, { scope });
  if (!force && isNavigationDataFresh(cached)) return cached.data;
  if (pending.has(resolved)) return pending.get(resolved);

  const request = Promise.resolve()
    .then(loader)
    .then((data) => {
      writeNavigationData(key, data, { scope, ttlMs });
      return data;
    })
    .finally(() => pending.delete(resolved));
  pending.set(resolved, request);
  return request;
};

export const subscribeNavigationData = (key, listener, { scope = 'account' } = {}) => {
  const resolved = storageKey(key, scope);
  const set = listeners.get(resolved) || new Set();
  set.add(listener);
  listeners.set(resolved, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(resolved);
  };
};

export const invalidateNavigationData = (keyPrefix = '', { scope = 'account' } = {}) => {
  const namespace = storageKey(keyPrefix, scope);
  const remove = [];
  for (const key of memory.keys()) if (key.startsWith(namespace)) remove.push(key);
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(namespace)) remove.push(key);
    }
  } catch { /* storage enumeration is best effort */ }
  for (const key of new Set(remove)) {
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* best effort */ }
    notify(key, null);
  }
};

export const clearPrivateNavigationData = () => {
  const accountId = getActiveAccountId();
  if (!accountId) return;
  const prefix = `${CACHE_PREFIX}:`;
  const suffix = `:${accountId}`;
  const remove = [];
  for (const key of memory.keys()) {
    if (key.startsWith(prefix) && key.endsWith(suffix)) remove.push(key);
  }
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix) && key.endsWith(suffix)) remove.push(key);
    }
  } catch { /* storage enumeration is best effort */ }
  for (const key of new Set(remove)) {
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* best effort */ }
    notify(key, null);
  }
};

export const navigationDataCacheDiagnostics = () => ({
  memoryEntries: memory.size,
  pendingRequests: pending.size,
});
