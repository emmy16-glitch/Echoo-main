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

const loadListenerV2Module = cachedLoader(() => import('../Components/ListenerV2/ListenerV2'));
const listenerV2Page = (exportName) => cachedLoader(() =>
  loadListenerV2Module().then((module) => ({ default: module[exportName] }))
);

// Core Listener 2.0 routes share one intentionally rebuilt module rather than
// inheriting the legacy Listener shell and page families.
export const loadListenerLayout = listenerV2Page('ListenerV2Layout');
export const loadListenerHome = listenerV2Page('ListenerV2Home');
export const loadListenerSearch = listenerV2Page('ListenerV2Search');
export const loadListenerLive = listenerV2Page('ListenerV2Live');
// /listen/channels is the canonical browse-by-Channel experience. App.jsx keeps
// the old stations/categories route aliases only for backwards-compatible URLs.
export const loadListenerStations = listenerV2Page('ListenerV2Categories');
export const loadListenerFollowing = listenerV2Page('ListenerV2Following');

// Secondary/detail experiences retain their proven data and interaction logic.
// They now render inside the strict Listener 2.0 shell.
export const loadListenerLibrary = cachedLoader(() => import('../Components/ListenerLibrary/ListenerLibrary'));
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
export const loadListenerCollectionDetail = cachedLoader(() => import('../Components/ListenerCollectionDetail/ListenerCollectionDetail'));

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
  loadListenerCollectionDetail,
];

export const preloadListenerRoutes = () =>
  Promise.all(LISTENER_ROUTE_LOADERS.map((load) => load().catch(() => null)));
