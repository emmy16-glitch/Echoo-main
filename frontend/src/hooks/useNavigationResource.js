import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  allowExpired = true,
}) {
  const initial = useMemo(
    () => readNavigationData(cacheKey, { scope }),
    [cacheKey, scope]
  );
  const usableInitial = initial && (allowExpired || isNavigationDataFresh(initial)) ? initial : null;
  const [data, setData] = useState(usableInitial?.data ?? fallback);
  const dataRef = useRef(usableInitial?.data ?? fallback);
  const [loading, setLoading] = useState(enabled && !usableInitial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ force = true, silent = Boolean(dataRef.current) } = {}) => {
    if (!enabled) return dataRef.current;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const next = await loadNavigationData(cacheKey, loader, { scope, ttlMs, force });
      dataRef.current = next;
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
  }, [cacheKey, enabled, loader, scope, ttlMs]);

  useEffect(() => {
    const cached = readNavigationData(cacheKey, { scope });
    const usableCached = cached && (allowExpired || isNavigationDataFresh(cached)) ? cached : null;
    if (usableCached) {
      dataRef.current = usableCached.data;
      setData(usableCached.data);
      setLoading(false);
    } else {
      dataRef.current = fallback;
      setData(fallback);
      setLoading(enabled);
    }
    setError('');
    if (!enabled) return undefined;

    let active = true;
    const unsubscribe = subscribeNavigationData(cacheKey, (entry) => {
      if (active && entry) {
        dataRef.current = entry.data;
        setData(entry.data);
      }
    }, { scope });
    if (!isNavigationDataFresh(cached)) {
      refresh({ force: true, silent: Boolean(usableCached) }).catch(() => {});
    }
    return () => { active = false; unsubscribe(); };
  }, [allowExpired, cacheKey, enabled, fallback, refresh, scope]);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const revalidate = () => {
      window.clearTimeout(timer);
      // A small deterministic spread prevents every mounted page resource
      // from retrying in the same task after a connection interruption.
      const delay = Math.min(480, [...cacheKey].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 480);
      timer = window.setTimeout(() => {
        refresh({ force: true, silent: Boolean(dataRef.current) }).catch(() => {});
      }, delay);
    };
    window.addEventListener('echoo:network-restored', revalidate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('echoo:network-restored', revalidate);
    };
  }, [cacheKey, enabled, refresh]);

  const mutate = useCallback((next) => {
    const value = typeof next === 'function' ? next(dataRef.current) : next;
    writeNavigationData(cacheKey, value, { scope, ttlMs });
    dataRef.current = value;
    setData(value);
    return value;
  }, [cacheKey, scope, ttlMs]);

  return { data, loading, refreshing, error, refresh, mutate };
}
