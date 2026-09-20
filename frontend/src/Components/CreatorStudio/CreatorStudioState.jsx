/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import batch2Service from '../../services/batch2Service';
import studioService from '../../services/studioService';
import realtimeService from '../../services/realtimeService';

const CreatorStudioStateContext = createContext(null);

const asList = (value) => (Array.isArray(value) ? value : []);

const readProfileComplete = (user = {}) =>
  Boolean(user?.profileCompleted) || localStorage.getItem('echooProfileCompleted') === 'true';

const STUDIO_CACHE_KEY = 'echooCreatorStudioCacheV1';
const STUDIO_CACHE_TTL_MS = 60 * 1000;

const readCachedStudio = () => {
  try {
    const raw = sessionStorage.getItem(STUDIO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - Number(parsed.savedAt || 0) > STUDIO_CACHE_TTL_MS) return null;
    return parsed.state || null;
  } catch {
    return null;
  }
};

const writeCachedStudio = (state) => {
  try {
    sessionStorage.setItem(STUDIO_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      state: {
        dashboard: state.dashboard,
        ownedStations: state.ownedStations,
        audioUploads: state.audioUploads?.slice?.(0, 20) || [],
        broadcasts: state.broadcasts,
        publicStations: state.publicStations?.slice?.(0, 30) || [],
        analytics: state.analytics,
      },
    }));
  } catch {
    // Cache is best-effort only.
  }
};

export function CreatorStudioStateProvider({ user, children }) {
  const [state, setState] = useState(() => {
    const cached = readCachedStudio();
    return {
      dashboard: cached?.dashboard || null,
      analytics: cached?.analytics || null,
      ownedStations: cached?.ownedStations || [],
      publicStations: cached?.publicStations || [],
      audioUploads: cached?.audioUploads || [],
      broadcasts: cached?.broadcasts || [],
      loading: !cached,
      error: '',
      refreshedAt: 0,
    };
  });

  const refreshPromiseRef = useRef(null);
  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    if (!silent) setState((current) => ({ ...current, loading: current.audioUploads.length === 0 && !current.dashboard, error: '' }));

    // Core data first (fast paint). Analytics loads in background and never
    // blocks channels/recordings/broadcast tabs.
    const corePromise = Promise.allSettled([
      studioService.getDashboard(),
      batch2Service.getMyStations(),
      studioService.getContent({ page: 1, limit: 20 }),
      batch2Service.getCreatorBroadcasts(),
      batch2Service.listStations({ page: 1, limit: 30 }),
    ]);
    const task = (async () => {
      try {
        const [dashboardResult, ownedResult, contentResult, broadcastsResult, publicResult] = await corePromise;

        const failed = [dashboardResult, ownedResult, contentResult, broadcastsResult, publicResult]
          .find((result) => result.status === 'rejected');

        setState((current) => {
          const next = {
            ...current,
            dashboard: dashboardResult.status === 'fulfilled' ? dashboardResult.value?.data || null : current.dashboard,
            ownedStations: ownedResult.status === 'fulfilled' ? asList(ownedResult.value?.data) : current.ownedStations,
            audioUploads: contentResult.status === 'fulfilled' ? asList(contentResult.value?.data?.tracks) : current.audioUploads,
            broadcasts: broadcastsResult.status === 'fulfilled' ? asList(broadcastsResult.value?.data) : current.broadcasts,
            publicStations: publicResult.status === 'fulfilled'
              ? asList(publicResult.value?.data).filter((station) => station.isPublic !== false)
              : current.publicStations,
            loading: false,
            error: failed?.reason?.message || '',
            refreshedAt: Date.now(),
          };
          writeCachedStudio(next);
          return next;
        });

        // Background analytics — never blocks the shell.
        studioService.getAnalytics('30d').then((response) => {
          setState((current) => {
            const next = { ...current, analytics: response?.data || current.analytics };
            writeCachedStudio(next);
            return next;
          });
        }).catch(() => {});
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = task;
    return task;
  }, []);

  useEffect(() => {
    refresh().catch((error) => {
      setState((current) => ({ ...current, loading: false, error: error?.message || 'Could not load Creator Studio.' }));
    });
  }, [refresh]);

  useEffect(() => {
    let timer = null;
    const onChanged = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => refresh({ silent: true }).catch(() => {}), 400);
    };
    window.addEventListener('echoo:creator-state-changed', onChanged);
    window.addEventListener('echoo:creator-audio-changed', onChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('echoo:creator-state-changed', onChanged);
      window.removeEventListener('echoo:creator-audio-changed', onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    let timer = null;

    realtimeService.subscribeToCatalog((event) => {
      if (!event?.entity || event.entity === 'station' || event.entity === 'broadcast') {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => refresh({ silent: true }).catch(() => {}), 800);
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    }).catch(() => {});

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  const value = useMemo(() => {
    const dashboard = state.dashboard || {};
    const activeBroadcast = state.broadcasts.find((broadcast) =>
      ['starting', 'live'].includes(String(broadcast?.status || '').toLowerCase())
    ) || asList(dashboard.activeBroadcasts).find((broadcast) => broadcast?.status === 'live') || null;
    const upcomingBroadcasts = state.broadcasts.filter((broadcast) =>
      String(broadcast?.status || '').toLowerCase() === 'scheduled' &&
      new Date(broadcast?.startTime || broadcast?.startAt || 0) >= new Date()
    );

    return {
      ...state,
      currentUser: user || {},
      creatorProfile: user?.creatorProfile || {},
      profileComplete: readProfileComplete(user),
      ownedStationCount: state.ownedStations.length,
      publicStationCount: state.publicStations.length,
      audioCount: state.audioUploads.length || Number(dashboard.totalTracks) || 0,
      broadcastCount: state.broadcasts.length,
      upcomingBroadcasts,
      upcomingBroadcastCount: upcomingBroadcasts.length,
      activeBroadcast,
      isLive: Boolean(activeBroadcast),
      refresh,
      notifyChanged: () => window.dispatchEvent(new CustomEvent('echoo:creator-state-changed')),
    };
  }, [state, user, refresh]);

  return (
    <CreatorStudioStateContext.Provider value={value}>
      {children}
    </CreatorStudioStateContext.Provider>
  );
}

export function useCreatorStudioState() {
  const value = useContext(CreatorStudioStateContext);
  if (!value) throw new Error('useCreatorStudioState must be used within CreatorStudioStateProvider.');
  return value;
}

export function useOptionalCreatorStudioState() {
  return useContext(CreatorStudioStateContext);
}
