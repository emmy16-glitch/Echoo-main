/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import batch2Service from '../../services/batch2Service';
import studioService from '../../services/studioService';
import realtimeService from '../../services/realtimeService';

const CreatorStudioStateContext = createContext(null);

const asList = (value) => (Array.isArray(value) ? value : []);

const readProfileComplete = (user = {}) =>
  Boolean(user?.profileCompleted) || localStorage.getItem('echooProfileCompleted') === 'true';

export function CreatorStudioStateProvider({ user, children }) {
  const [state, setState] = useState({
    dashboard: null,
    analytics: null,
    ownedStations: [],
    publicStations: [],
    audioUploads: [],
    broadcasts: [],
    loading: true,
    error: '',
    refreshedAt: 0,
  });

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((current) => ({ ...current, loading: true, error: '' }));

    const [dashboardResult, ownedResult, contentResult, broadcastsResult, publicResult, analyticsResult] =
      await Promise.allSettled([
        studioService.getDashboard(),
        batch2Service.getMyStations(),
        studioService.getContent({ page: 1, limit: 50 }),
        batch2Service.getCreatorBroadcasts(),
        batch2Service.listStations({ page: 1, limit: 100 }),
        studioService.getAnalytics('30d'),
      ]);

    const failed = [dashboardResult, ownedResult, contentResult, broadcastsResult, publicResult]
      .find((result) => result.status === 'rejected');

    setState((current) => ({
      ...current,
      dashboard: dashboardResult.status === 'fulfilled' ? dashboardResult.value?.data || null : current.dashboard,
      ownedStations: ownedResult.status === 'fulfilled' ? asList(ownedResult.value?.data) : current.ownedStations,
      audioUploads: contentResult.status === 'fulfilled' ? asList(contentResult.value?.data?.tracks) : current.audioUploads,
      broadcasts: broadcastsResult.status === 'fulfilled' ? asList(broadcastsResult.value?.data) : current.broadcasts,
      publicStations: publicResult.status === 'fulfilled'
        ? asList(publicResult.value?.data).filter((station) => station.isPublic !== false)
        : current.publicStations,
      analytics: analyticsResult.status === 'fulfilled' ? analyticsResult.value?.data || null : current.analytics,
      loading: false,
      error: failed?.reason?.message || '',
      refreshedAt: Date.now(),
    }));
  }, []);

  useEffect(() => {
    refresh().catch((error) => {
      setState((current) => ({ ...current, loading: false, error: error?.message || 'Could not load Creator Studio.' }));
    });
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => refresh({ silent: true }).catch(() => {});
    window.addEventListener('echoo:creator-state-changed', onChanged);
    window.addEventListener('echoo:creator-audio-changed', onChanged);
    return () => {
      window.removeEventListener('echoo:creator-state-changed', onChanged);
      window.removeEventListener('echoo:creator-audio-changed', onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};

    realtimeService.subscribeToCatalog((event) => {
      if (!event?.entity || event.entity === 'station' || event.entity === 'broadcast') {
        refresh({ silent: true }).catch(() => {});
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    }).catch(() => {});

    return () => {
      disposed = true;
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
