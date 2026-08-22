const cachedLoader = (loader) => {
  let promise;

  return () => {
    if (!promise) {
      promise = loader().catch((error) => {
        promise = undefined;
        throw error;
      });
    }
    return promise;
  };
};

export const loadListenerLayout = cachedLoader(() => import('../Components/ListenerLayout/ListenerLayout'));
export const loadListenerHome = cachedLoader(() => import('../Components/ListenerHome/ListenerHome'));
export const loadListenerSearch = cachedLoader(() => import('../Components/ListenerSearch/ListenerSearch'));
export const loadListenerLive = cachedLoader(() => import('../Components/ListenerLive/ListenerLiveConnected'));
export const loadListenerStations = cachedLoader(() => import('../Components/ListenerStations/ListenerStationsConnected'));
export const loadListenerLibrary = cachedLoader(() => import('../Components/ListenerLibrary/ListenerLibrary'));
export const loadListenerFollowing = cachedLoader(() => import('../Components/ListenerLibrary/ListenerFollowing'));
export const loadListenerPlaylist = cachedLoader(() => import('../Components/ListenerPlaylist/ListenerPlaylist'));
export const loadListenerSavedMoments = cachedLoader(() => import('../Components/ListenerSavedMoments/ListenerSavedMoments'));
export const loadListenerHistory = cachedLoader(() => import('../Components/ListenerHistory/ListenerHistoryConnected'));
export const loadListenerDownloads = cachedLoader(() => import('../Components/ListenerDownloads/ListenerDownloadsConnected'));
export const loadListenerCreatorProfile = cachedLoader(() => import('../Components/ListenerCreatorProfile/ListenerCreatorProfile'));
export const loadListenerNotifications = cachedLoader(() => import('../Components/ListenerNotifications/ListenerNotificationsConnected'));
export const loadListenerSettings = cachedLoader(() => import('../Components/ListenerSettings/ListenerSettingsConnected'));
export const loadListenerAudioDetail = cachedLoader(() => import('../Components/ListenerAudioDetail/ListenerAudioDetail'));
export const loadListenerLiveRoom = cachedLoader(() => import('../Components/ListenerLiveExperience/ListenerRealLiveRoom'));
export const loadListenerStationProfile = cachedLoader(() => import('../Components/ListenerLiveExperience/ListenerRealStationProfile'));

const LISTENER_ROUTE_LOADERS = [
  loadListenerHome,
  loadListenerSearch,
  loadListenerLive,
  loadListenerStations,
  loadListenerLibrary,
  loadListenerFollowing,
  loadListenerPlaylist,
  loadListenerSavedMoments,
  loadListenerHistory,
  loadListenerDownloads,
  loadListenerCreatorProfile,
  loadListenerNotifications,
  loadListenerSettings,
  loadListenerAudioDetail,
  loadListenerLiveRoom,
  loadListenerStationProfile,
];

export const preloadListenerRoutes = () =>
  Promise.all(LISTENER_ROUTE_LOADERS.map((load) => load().catch(() => null)));
