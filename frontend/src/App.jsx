import { Component, useEffect, useState, Suspense, lazy } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';

import Register from './Components/Register/register';
import ResetPassword from './Components/Register/ResetPassword';
import ProfileSetup from './Components/ProfileSetup/ProfileSetup';
import CreatorSetup from './Components/CreatorSetup/CreatorSetup';

// The logged-in shells are lazy-loaded so each experience downloads only its
// own workspace instead of one monolithic bundle. Listener chunks are cached by
// routePreloaders so the first navigation click is not a cold import.
import {
  loadListenerAudioDetail,
  loadListenerCreatorProfile,
  loadListenerDownloads,
  loadListenerFollowing,
  loadListenerHistory,
  loadListenerHome,
  loadListenerLayout,
  loadListenerLibrary,
  loadListenerLive,
  loadListenerLiveRoom,
  loadListenerNotifications,
  loadListenerSearch,
  loadListenerSettings,
  loadListenerStationProfile,
  loadListenerCollectionDetail,
  loadListenerStations,
  loadListenerPlaylist,
  loadListenerSavedMoments,
  preloadListenerRoutes,
} from './routing/routePreloaders';

const CreatorStudio = lazy(() => import('./Components/CreatorStudio/CreatorStudio'));
const ListenerLayout = lazy(loadListenerLayout);
const ListenerHome = lazy(loadListenerHome);
const ListenerSearch = lazy(loadListenerSearch);
const ListenerLive = lazy(loadListenerLive);
const ListenerStations = lazy(loadListenerStations);
const ListenerLibrary = lazy(loadListenerLibrary);
const ListenerFollowing = lazy(loadListenerFollowing);
const ListenerPlaylist = lazy(loadListenerPlaylist);
const ListenerSavedMoments = lazy(loadListenerSavedMoments);
const ListenerHistory = lazy(loadListenerHistory);
const ListenerDownloads = lazy(loadListenerDownloads);
const ListenerCreatorProfile = lazy(loadListenerCreatorProfile);
const ListenerNotifications = lazy(loadListenerNotifications);
const ListenerSettings = lazy(loadListenerSettings);
const ListenerAudioDetail = lazy(loadListenerAudioDetail);
const ListenerRealLiveRoom = lazy(loadListenerLiveRoom);
const ListenerRealStationProfile = lazy(loadListenerStationProfile);
const ListenerCollectionDetail = lazy(loadListenerCollectionDetail);

import EchooExperienceOrchestrator from './Components/EchooSystem/EchooExperienceOrchestrator';
import EchooMobileNavigation from './Components/EchooSystem/EchooMobileNavigation';
import ImageCropProvider from './Components/Common/ImageCropProvider';
import {
  canAccessExperience,
  hasCompletedCreatorProfile,
  hasCreatorCapability,
} from './services/accountExperience';

class LazyPageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  retry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="echoo-lazy-page-fallback echoo-lazy-page-fallback--error" role="alert">
          <div className="echoo-lazy-page-fallback__icon" aria-hidden="true">
            <FiAlertTriangle />
          </div>
          <p className="echoo-lazy-page-fallback__title">This page couldn&apos;t load</p>
          <p className="echoo-lazy-page-fallback__hint">
            Your connection may have dropped. Try again.
          </p>
          <button type="button" className="echoo-lazy-page-fallback__retry" onClick={this.retry}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const LazyPageLoading = () => (
  <div className="echoo-lazy-page-fallback" role="status" aria-live="polite">
    <div className="echoo-lazy-page-fallback__spinner" aria-hidden="true" />
    <p className="echoo-lazy-page-fallback__text">Loading…</p>
  </div>
);

const LazyPage = ({ element }) => (
  <Suspense fallback={<LazyPageLoading />}>
    <LazyPageErrorBoundary>{element}</LazyPageErrorBoundary>
  </Suspense>
);

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const getStoredExperience = () => localStorage.getItem('echooActiveExperience') || 'listener';

const roleHome = (experience) => {
  if (experience === 'creator') return '/creator-studio';
  if (experience === 'listener') return '/listen';
  return '/';
};

const isAccountOnboardingComplete = (user = {}) => (
  Boolean(user.onboardingCompleted) ||
  localStorage.getItem('echooOnboardingCompleted') === 'true'
);

// The backend historically persisted only onboardingCompleted for the shared
// personal profile. Treat that as authoritative on returning logins while also
// accepting the newer profileCompleted/local migration marker.
const isProfileComplete = (user = {}) => (
  Boolean(user.profileCompleted) ||
  Boolean(user.onboardingCompleted) ||
  localStorage.getItem('echooProfileCompleted') === 'true' ||
  localStorage.getItem('echooOnboardingCompleted') === 'true'
);

const getStartingStage = () => {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) return 'register';

  const user = getStoredUser();
  const activeExperience = getStoredExperience();

  if (!isAccountOnboardingComplete(user) || !isProfileComplete(user)) {
    return 'profile';
  }

  if (activeExperience === 'creator') {
    if (hasCompletedCreatorProfile(user)) return 'creator-done';
    if (hasCreatorCapability(user)) return 'creator';
  }

  return 'listener-done';
};

const OnboardingFlow = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState(getStartingStage);

  useEffect(() => {
    if (stage === 'listener-done') {
      navigate('/listen', { replace: true });
    }

    if (stage === 'creator-done') {
      navigate('/creator-studio', { replace: true });
    }
  }, [stage, navigate]);

  const handleLoginSuccess = (user) => {
    localStorage.setItem('echooActiveExperience', 'listener');

    if (!isAccountOnboardingComplete(user) || !isProfileComplete(user)) {
      setStage('profile');
      return;
    }

    setStage('listener-done');
  };

  if (stage === 'register') {
    return (
      <Register
        onAccountCreated={() => setStage('profile')}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  if (stage === 'profile') {
    return (
      <ProfileSetup
        onProfileCompleted={() => {
          localStorage.setItem('echooProfileCompleted', 'true');
          localStorage.setItem('echooOnboardingCompleted', 'true');
          localStorage.setItem('echooActiveExperience', 'listener');
          setStage('listener-done');
        }}
        onSessionInvalid={() => setStage('register')}
      />
    );
  }

  if (stage === 'creator') {
    return (
      <CreatorSetup
        onBackToRole={() => {
          localStorage.setItem('echooActiveExperience', 'listener');
          setStage('listener-done');
        }}
        onCreatorReady={() => {
          localStorage.removeItem('echooRole');
          localStorage.setItem('echooActiveExperience', 'creator');
          setStage('creator-done');
        }}
      />
    );
  }

  return null;
};

const RequireRole = ({ role, children }) => {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) return <Navigate to="/" replace />;

  const user = getStoredUser();
  if (!isAccountOnboardingComplete(user) || !isProfileComplete(user)) {
    return <Navigate to="/" replace />;
  }

  if (!canAccessExperience(user, role)) {
    if (role === 'creator' && hasCreatorCapability(user)) {
      localStorage.setItem('echooActiveExperience', 'creator');
      return <Navigate to="/?source=switch&experience=creator" replace />;
    }
    return <Navigate to={role === 'creator' ? '/listen' : '/'} replace />;
  }

  return (
    <>
      {role === 'listener' && <ListenerRoutePrefetch />}
      {children}
    </>
  );
};

const DefaultRedirect = () => {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) return <Navigate to="/" replace />;

  const user = getStoredUser();
  const activeExperience = getStoredExperience();

  if (!isAccountOnboardingComplete(user) || !isProfileComplete(user)) {
    return <Navigate to="/" replace />;
  }

  if (activeExperience === 'creator') {
    if (hasCompletedCreatorProfile(user)) return <Navigate to="/creator-studio" replace />;
    if (hasCreatorCapability(user)) {
      return <Navigate to="/?source=switch&experience=creator" replace />;
    }
  }

  return <Navigate to={roleHome('listener')} replace />;
};

const ListenerRoutePrefetch = () => {
  useEffect(() => {
    let cancelled = false;
    const prefetch = () => {
      if (!cancelled) void preloadListenerRoutes();
    };

    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(prefetch, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
};

function App() {
  return (
    <BrowserRouter>
      <ImageCropProvider>
        <a className="echoo-skip-to-content" href="#echoo-route-content">
          Skip to content
        </a>

        <EchooExperienceOrchestrator />
        <EchooMobileNavigation />

        <div id="echoo-route-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<OnboardingFlow />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route
              path="/creator-studio/*"
              element={
                <RequireRole role="creator">
                  <LazyPage element={<CreatorStudio />} />
                </RequireRole>
              }
            />

            <Route
              path="/listen"
              element={
                <RequireRole role="listener">
                  <LazyPage element={<ListenerLayout />} />
                </RequireRole>
              }
            >
              <Route index element={<ListenerHome />} />
              <Route path="following" element={<ListenerFollowing />} />
              <Route path="search" element={<ListenerSearch />} />
              <Route path="live" element={<ListenerLive />} />
              <Route path="live/:broadcastId" element={<ListenerRealLiveRoom />} />
              <Route path="stations" element={<ListenerStations />} />
              <Route path="categories" element={<ListenerStations />} />
              <Route path="stations/:stationId" element={<ListenerRealStationProfile />} />
              <Route path="collections/:collectionId" element={<ListenerCollectionDetail />} />
              <Route path="audio/:audioId" element={<ListenerAudioDetail />} />
              <Route path="library" element={<ListenerLibrary />} />
              <Route path="library/following" element={<ListenerFollowing />} />
              <Route path="playlist" element={<ListenerPlaylist />} />
              <Route path="saved-moments" element={<ListenerSavedMoments />} />
              <Route path="history" element={<ListenerHistory />} />
              <Route path="downloads" element={<ListenerDownloads />} />
              <Route path="creator/:creatorId" element={<ListenerCreatorProfile />} />
              <Route path="notifications" element={<ListenerNotifications />} />
              <Route path="settings" element={<ListenerSettings />} />
            </Route>

            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </div>
      </ImageCropProvider>
    </BrowserRouter>
  );
}

export default App;
