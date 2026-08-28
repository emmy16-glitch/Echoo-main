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
import ProfileSetup from './Components/ProfileSetup/ProfileSetup';
import ChooseRole from './Components/ChooseRole/ChooseRole';
import CreatorSetup from './Components/CreatorSetup/CreatorSetup';

// The logged-in shells are lazy-loaded so each role downloads only its own
// experience instead of one monolithic bundle. Listener chunks are cached by
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

import EchooExperienceOrchestrator from './Components/EchooSystem/EchooExperienceOrchestrator';
import EchooMobileNavigation from './Components/EchooSystem/EchooMobileNavigation';
import ImageCropProvider from './Components/Common/ImageCropProvider';

// Error boundary that catches lazy-chunk load failures (e.g. a network drop
// mid-session) and lets the user retry instead of crashing the whole app.
// Class component because ErrorBoundary requires getDerivedStateFromError.
class LazyPageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  retry = () => {
    // React.lazy caches a rejected import promise. Merely clearing the boundary
    // state re-renders the same rejected promise and can trap the user in an
    // immediate error loop. Reload the current route so the browser performs a
    // fresh chunk request after the connection recovers.
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

// Loading state shown while a lazy page shell (or its route chunk) loads.
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

const getStoredRole = (user = getStoredUser()) =>
  user.userType || localStorage.getItem('echooRole') || '';

const roleHome = (role) => {
  if (role === 'creator') return '/creator-studio';
  if (role === 'listener') return '/listen';
  return '/';
};

const getStartingStage = () => {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) return 'register';

  const user = getStoredUser();
  const role = getStoredRole(user);
  const onboardingComplete =
    Boolean(user.onboardingCompleted) ||
    localStorage.getItem('echooOnboardingCompleted') === 'true';
  const profileComplete =
    Boolean(user.profileCompleted) ||
    localStorage.getItem('echooProfileCompleted') === 'true';

  if (onboardingComplete) {
    return role === 'creator' ? 'creator-done' : 'listener-done';
  }

  if (!profileComplete) return 'profile';
  if (role === 'creator') return 'creator';
  if (role === 'listener') return 'listener-done';
  return 'role';
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
    const role = getStoredRole(user || {});
    const onboardingComplete =
      Boolean(user?.onboardingCompleted) ||
      localStorage.getItem('echooOnboardingCompleted') === 'true';
    const profileComplete =
      Boolean(user?.profileCompleted) ||
      localStorage.getItem('echooProfileCompleted') === 'true';

    if (onboardingComplete) {
      setStage(role === 'creator' ? 'creator-done' : 'listener-done');
      return;
    }

    if (!profileComplete) {
      setStage('profile');
      return;
    }

    if (role === 'creator') {
      setStage('creator');
      return;
    }

    if (role === 'listener') {
      setStage('listener-done');
      return;
    }

    setStage('role');
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
          setStage('role');
        }}
        onSessionInvalid={() => setStage('register')}
      />
    );
  }

  if (stage === 'role') {
    return (
      <ChooseRole
        onListenerContinue={() => {
          localStorage.setItem('echooRole', 'listener');
          localStorage.setItem('echooOnboardingCompleted', 'true');
          setStage('listener-done');
        }}
        onCreatorContinue={() => {
          localStorage.setItem('echooRole', 'creator');
          setStage('creator');
        }}
        onBackToProfile={() => setStage('profile')}
      />
    );
  }

  if (stage === 'creator') {
    return (
      <CreatorSetup
        onBackToRole={() => setStage('role')}
        onCreatorReady={() => {
          localStorage.setItem('echooRole', 'creator');
          localStorage.setItem('echooOnboardingCompleted', 'true');
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
  const currentRole = getStoredRole(user);
  const onboardingComplete =
    Boolean(user.onboardingCompleted) ||
    localStorage.getItem('echooOnboardingCompleted') === 'true';

  if (!onboardingComplete || !currentRole) {
    return <Navigate to="/" replace />;
  }

  if (currentRole !== role) {
    return <Navigate to={roleHome(currentRole)} replace />;
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
  const role = getStoredRole(user);
  const onboardingComplete =
    Boolean(user.onboardingCompleted) ||
    localStorage.getItem('echooOnboardingCompleted') === 'true';

  if (!onboardingComplete || !role) return <Navigate to="/" replace />;
  return <Navigate to={roleHome(role)} replace />;
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
              <Route path="search" element={<ListenerSearch />} />
              <Route path="live" element={<ListenerLive />} />
              <Route path="live/:broadcastId" element={<ListenerRealLiveRoom />} />
              <Route path="stations" element={<ListenerStations />} />
              <Route path="stations/:stationId" element={<ListenerRealStationProfile />} />
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
