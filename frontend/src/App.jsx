import { useEffect, useState } from 'react';
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
import CreatorStudio from './Components/CreatorStudio/CreatorStudio';
import ListenerLayout from './Components/ListenerLayout/ListenerLayout';
import ListenerHome from './Components/ListenerHome/ListenerHome';
import ListenerSearch from './Components/ListenerSearch/ListenerSearch';
import ListenerLive from './Components/ListenerLive/ListenerLiveConnected';
import ListenerStations from './Components/ListenerStations/ListenerStationsConnected';
import ListenerLibrary from './Components/ListenerLibrary/ListenerLibrary';
import ListenerFollowing from './Components/ListenerLibrary/ListenerFollowing';
import ListenerHistory from './Components/ListenerHistory/ListenerHistoryConnected';
import ListenerDownloads from './Components/ListenerDownloads/ListenerDownloadsConnected';
import ListenerCreatorProfile from './Components/ListenerCreatorProfile/ListenerCreatorProfile';
import ListenerNotifications from './Components/ListenerNotifications/ListenerNotifications';
import ListenerSettings from './Components/ListenerSettings/ListenerSettings';
import ListenerAudioDetail from './Components/ListenerAudioDetail/ListenerAudioDetail';
import ListenerRealLiveRoom from './Components/ListenerLiveExperience/ListenerRealLiveRoom';
import ListenerRealStationProfile from './Components/ListenerLiveExperience/ListenerRealStationProfile';
import EchooExperienceOrchestrator from './Components/EchooSystem/EchooExperienceOrchestrator';
import EchooMobileNavigation from './Components/EchooSystem/EchooMobileNavigation';
import ImageCropProvider from './Components/Common/ImageCropProvider';

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

  return children;
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

function App() {
  return (
    <BrowserRouter>
      <ImageCropProvider>
        <EchooExperienceOrchestrator />
        <EchooMobileNavigation />

        <a className="echoo-skip-to-content" href="#echoo-main-content">
          Skip to content
        </a>

        <div id="echoo-main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<OnboardingFlow />} />

            <Route
              path="/creator-studio"
              element={
                <RequireRole role="creator">
                  <CreatorStudio />
                </RequireRole>
              }
            />

            <Route
              path="/listen"
              element={
                <RequireRole role="listener">
                  <ListenerLayout />
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
