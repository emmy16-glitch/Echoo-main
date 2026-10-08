import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isNavigationDataFresh,
  loadNavigationData,
  readNavigationData,
  subscribeNavigationData,
  writeNavigationData,
} from '../services/navigationDataCache.js';

export default function useNavigationResource({
  cacheKey,
  loader,
  fallback,
  scope = 'account',
  ttlMs = 60_000,
  enabled = true,
}) {
  const initial = useMemo(
    () => readNavigationData(cacheKey, { scope }),
    [cacheKey, scope]
  );
  const [data, setData] = useState(initial?.data ?? fallback);
  const [loading, setLoading] = useState(enabled && !initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ force = true, silent = Boolean(data) } = {}) => {
    if (!enabled) return data;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const next = await loadNavigationData(cacheKey, loader, { scope, ttlMs, force });
      setData(next);
      setError('');
      return next;
    } catch (loadError) {
      setError(loadError?.message || 'Echoo could not refresh this page.');
      throw loadError;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cacheKey, data, enabled, loader, scope, ttlMs]);

  useEffect(() => {
    const cached = readNavigationData(cacheKey, { scope });
    if (cached) {
      setData(cached.data);
      setLoading(false);
    } else {
      setData(fallback);
      setLoading(enabled);
    }
    setError('');
    if (!enabled) return undefined;

    let active = true;
    const unsubscribe = subscribeNavigationData(cacheKey, (entry) => {
      if (active && entry) setData(entry.data);
    }, { scope });
    if (!isNavigationDataFresh(cached)) {
      refresh({ force: true, silent: Boolean(cached) }).catch(() => {});
    }
    return () => { active = false; unsubscribe(); };
  }, [cacheKey, enabled, fallback, refresh, scope]);

  const mutate = useCallback((next) => {
    const value = typeof next === 'function' ? next(data) : next;
    writeNavigationData(cacheKey, value, { scope, ttlMs });
    setData(value);
    return value;
  }, [cacheKey, data, scope, ttlMs]);

  return { data, loading, refreshing, error, refresh, mutate };
}
