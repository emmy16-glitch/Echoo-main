import { useEffect, useMemo, useState } from 'react';
import {
  FaBell,
  FaBroadcastTower,
  FaChartBar,
  FaChevronDown,
  FaCloudUploadAlt,
  FaCog,
  FaExclamationCircle,
  FaHeadphones,
  FaHome,
  FaMicrophone,
  FaSearch,
  FaSignOutAlt,
  FaTimes,
  FaUsers,
} from 'react-icons/fa';

import './CreatorStudio.css';
import './CreatorStudio.identity.css';
import './CreatorStudioShellFinal.css';
import echooLogo from '../Assets/logo.png';
import studioService from '../../services/studioService';
import CreatorStudioHome from './CreatorStudioHome';
import CreatorContentWorkspace from './CreatorContentWorkspace';
import CreatorBroadcastWorkspace from './CreatorLiveConnectedWorkspace';
import CreatorStationsWorkspace from './CreatorStationsWorkspace';
import CreatorAudienceWorkspace from './CreatorAudienceWorkspace';
import CreatorAnalyticsWorkspace from './CreatorAnalyticsConnectedWorkspace';
import CreatorSettingsWorkspace from './CreatorSettingsWorkspace';
import CreatorNotificationsWorkspace from './CreatorNotificationsWorkspace';

const GENRES = [
  'Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B',
  'Country', 'Metal', 'Reggae', 'Podcast', 'Spiritual', 'Educational',
  'Comedy', 'Storytelling', 'Other',
];

const EMPTY_UPLOAD = {
  file: null,
  title: '',
  description: '',
  genre: 'Other',
  tags: '',
  isPublic: true,
};

const readJson = (key, fallback = {}) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const CreatorStudio = () => {
  const [activeNav, setActiveNav] = useState('Home');
  const [content, setContent] = useState({ tracks: [], pagination: {} });
  const [audience, setAudience] = useState(null);
  const [contentPage, setContentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingId, setDeletingId] = useState('');
  const [preparedBroadcastId, setPreparedBroadcastId] = useState(
    () => sessionStorage.getItem('echooPreparedBroadcastId') || ''
  );
  const [studioSearch, setStudioSearch] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD);

  const creatorSetup = useMemo(() => readJson('creatorSetup', {}), []);
  const user = useMemo(() => readJson('user', {}), []);

  const isOrganization =
    creatorSetup.type === 'organization' ||
    user.creatorProfile?.creatorType === 'organization';

  const studioName = isOrganization
    ? creatorSetup.name || creatorSetup.organizationName || user.creatorProfile?.organizationName || user.displayName || 'Creator Studio'
    : user.displayName || user.fullname || user.name || user.username || 'Creator Studio';

  const studioType = isOrganization ? 'Organization' : 'Individual Creator';
  const profileImage = user.avatar || user.profileImage || localStorage.getItem('profileImage') || null;
  const initial = studioName.charAt(0).toUpperCase() || 'E';

  const navItems = [
    { name: 'Home', icon: <FaHome /> },
    { name: 'Stations', icon: <FaBroadcastTower /> },
    { name: 'Broadcast', icon: <FaMicrophone /> },
    { name: 'Audio', icon: <FaHeadphones /> },
    { name: 'Audience', icon: <FaUsers /> },
    { name: 'Analytics', icon: <FaChartBar /> },
    { name: 'Settings', icon: <FaCog /> },
  ];

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!['Audio', 'Audience'].includes(activeNav)) return;
      try {
        setLoading(true);
        setError('');
        if (activeNav === 'Audio') {
          const response = await studioService.getContent({ page: contentPage, limit: 20 });
          if (active) setContent(response?.data || { tracks: [], pagination: {} });
        }
        if (activeNav === 'Audience') {
          const response = await studioService.getAudience();
          if (active) setAudience(response?.data || null);
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load Creator Studio data.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [activeNav, contentPage, refreshKey]);

  const navigateStudio = (page) => {
    let target = page;
    if (page === 'Live') {
      sessionStorage.setItem('echooBroadcastMode', 'now');
      target = 'Broadcast';
    }
    if (page === 'Schedule') {
      sessionStorage.setItem('echooBroadcastMode', 'later');
      target = 'Broadcast';
    }
    setError('');
    setNotice('');
    setActiveNav(target);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const query = studioSearch.trim().toLowerCase();
    if (!query) return;
    const match = navItems.find((item) => item.name.toLowerCase().startsWith(query));
    if (match) {
      navigateStudio(match.name);
      setStudioSearch('');
      return;
    }
    if (query.includes('live') || query.includes('schedule') || query.includes('broadcast')) {
      navigateStudio('Broadcast');
      setStudioSearch('');
      return;
    }
    if (query.includes('content') || query.includes('recording')) {
      navigateStudio('Audio');
      setStudioSearch('');
      return;
    }
    setNotice('Try Home, Stations, Broadcast, Audio, Audience, Analytics, or Settings.');
  };

  const handleCreatorLogout = () => {
    [
      'accessToken', 'refreshToken', 'token', 'user', 'profileImage', 'profileBio',
      'echooRole', 'echooProfileCompleted', 'echooOnboardingCompleted', 'creatorSetup',
    ].forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
    window.location.replace('/');
  };

  const openUpload = () => {
    setError('');
    setNotice('');
    setUploadForm(EMPTY_UPLOAD);
    setUploadOpen(true);
  };

  const closeUpload = () => {
    if (!uploading) setUploadOpen(false);
  };

  const handleUploadChange = (event) => {
    const { name, value, checked, files, type } = event.target;
    if (name === 'file') {
      const file = files?.[0] || null;
      setUploadForm((current) => ({
        ...current,
        file,
        title: current.title || file?.name?.replace(/\.[^/.]+$/, '') || '',
      }));
      return;
    }
    setUploadForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    if (!uploadForm.file || !uploadForm.title.trim() || uploading) return;
    if (!uploadForm.file.type?.startsWith('audio/')) {
      setError('Please choose a valid audio file.');
      return;
    }
    try {
      setUploading(true);
      setError('');
      setNotice('');
      await studioService.uploadAudio({
        file: uploadForm.file,
        title: uploadForm.title.trim(),
        description: uploadForm.description.trim(),
        genre: uploadForm.genre,
        tags: uploadForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        isPublic: uploadForm.isPublic,
      });
      setUploadOpen(false);
      setUploadForm(EMPTY_UPLOAD);
      setNotice('Audio uploaded successfully.');
      setRefreshKey((value) => value + 1);
    } catch (uploadError) {
      setError(uploadError?.message || 'Could not upload audio.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (audioId, title) => {
    if (!audioId || deletingId) return;
    if (!window.confirm(`Delete “${title || 'this audio'}”?`)) return;
    try {
      setDeletingId(String(audioId));
      setError('');
      setNotice('');
      await studioService.deleteAudio(audioId);
      setContent((current) => ({
        ...current,
        tracks: (current.tracks || []).filter((track) => String(track.id || track._id) !== String(audioId)),
      }));
      setNotice(`${title || 'Audio'} was deleted.`);
      setRefreshKey((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete audio.');
    } finally {
      setDeletingId('');
    }
  };

  const clearPreparedBroadcast = () => {
    sessionStorage.removeItem('echooPreparedBroadcastId');
    setPreparedBroadcastId('');
  };

  const renderWorkspace = () => {
    switch (activeNav) {
      case 'Audio':
        return (
          <CreatorContentWorkspace
            tracks={Array.isArray(content?.tracks) ? content.tracks : []}
            loading={loading}
            page={contentPage}
            pagination={content?.pagination || {}}
            deletingId={deletingId}
            onUpload={openUpload}
            onDelete={handleDelete}
            onPageChange={setContentPage}
          />
        );
      case 'Stations':
        return <CreatorStationsWorkspace studioName={studioName} onNavigate={navigateStudio} />;
      case 'Broadcast':
        return (
          <CreatorBroadcastWorkspace
            studioName={studioName}
            profileImage={profileImage}
            initialBroadcastId={preparedBroadcastId}
            onNavigate={navigateStudio}
            onClearPreparedBroadcast={clearPreparedBroadcast}
          />
        );
      case 'Audience':
        return <CreatorAudienceWorkspace audience={audience} loading={loading} />;
      case 'Analytics':
        return <CreatorAnalyticsWorkspace />;
      case 'Settings':
        return <CreatorSettingsWorkspace />;
      case 'Notifications':
        return <CreatorNotificationsWorkspace onNavigate={navigateStudio} />;
      case 'Home':
      default:
        return (
          <CreatorStudioHome
            key={refreshKey}
            studioName={studioName}
            studioType={studioType}
            profileImage={profileImage}
            onUpload={openUpload}
            onNavigate={navigateStudio}
          />
        );
    }
  };

  return (
    <div className="studio-page studio-final-shell">
      <aside className="studio-sidebar">
        <button type="button" className="studio-brand" onClick={() => navigateStudio('Home')}>
          <img src={echooLogo} alt="Echoo" className="studio-logo" />
          <div><h2>Echoo</h2><span>Creator Studio</span></div>
        </button>

        <nav className="studio-navigation">
          {navItems.map((item) => (
            <button type="button" key={item.name} className={`studio-nav-item ${activeNav === item.name ? 'active' : ''}`} onClick={() => navigateStudio(item.name)}>
              <span className="studio-nav-icon">{item.icon}</span><span>{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="studio-sidebar-profile">
          <div className="sidebar-avatar">{profileImage ? <img src={profileImage} alt="" /> : initial}</div>
          <div className="sidebar-profile-text"><strong>{studioName}</strong><span>{studioType}</span></div>
          <button type="button" className="studio-sidebar-logout" onClick={handleCreatorLogout} aria-label="Log out" title="Log out"><FaSignOutAlt /></button>
        </div>
      </aside>

      <main id="echoo-main-content" tabIndex="-1" className="studio-main">
        <header className="studio-topbar studio-topbar-final">
          <form className="studio-command-search" onSubmit={handleSearchSubmit}>
            <FaSearch />
            <input value={studioSearch} onChange={(event) => setStudioSearch(event.target.value)} placeholder="Search Creator Studio..." aria-label="Search Creator Studio" />
          </form>

          <div className="studio-top-actions">
            <button type="button" className="notification-button" onClick={() => navigateStudio('Notifications')} title="Notifications" aria-label="Notifications"><FaBell /></button>
            <button type="button" className="studio-account-button" onClick={() => navigateStudio('Settings')} title="Creator settings">
              <div className="top-avatar">{profileImage ? <img src={profileImage} alt="" /> : initial}</div>
              <div><strong>{studioName}</strong><span>Creator</span></div>
              <FaChevronDown />
            </button>
          </div>
        </header>

        {error && <div className="studio-alert error"><FaExclamationCircle /><span>{error}</span><button type="button" onClick={() => setError('')}><FaTimes /></button></div>}
        {notice && <div className="studio-alert success"><FaCloudUploadAlt /><span>{notice}</span><button type="button" onClick={() => setNotice('')}><FaTimes /></button></div>}

        <div className="studio-view">{renderWorkspace()}</div>
        <footer className="studio-footer"><span>© 2026 Echoo.</span><span>Audio-first creator platform</span></footer>
      </main>

      {uploadOpen && (
        <div className="studio-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpload(); }}>
          <div className="studio-upload-modal">
            <div className="upload-modal-header">
              <div><h2>Upload audio</h2><p>Add a recording to your Echoo account.</p></div>
              <button type="button" className="upload-close-button" onClick={closeUpload} disabled={uploading} aria-label="Close upload"><FaTimes /></button>
            </div>

            <form onSubmit={handleUploadSubmit} className="studio-upload-form">
              <label className="studio-upload-drop">
                <input type="file" name="file" accept="audio/*" onChange={handleUploadChange} hidden />
                <div><FaCloudUploadAlt /></div>
                <strong>{uploadForm.file?.name || 'Choose audio file'}</strong>
                <span>Audio files only</span>
              </label>

              <div className="studio-form-field"><label htmlFor="studio-upload-title">Title</label><input id="studio-upload-title" name="title" value={uploadForm.title} onChange={handleUploadChange} maxLength={150} required /></div>
              <div className="studio-form-field"><label htmlFor="studio-upload-description">Description</label><textarea id="studio-upload-description" name="description" value={uploadForm.description} onChange={handleUploadChange} maxLength={2000} /></div>
              <div className="studio-form-row">
                <div className="studio-form-field"><label htmlFor="studio-upload-genre">Genre</label><select id="studio-upload-genre" name="genre" value={uploadForm.genre} onChange={handleUploadChange}>{GENRES.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select></div>
                <div className="studio-form-field"><label htmlFor="studio-upload-tags">Tags</label><input id="studio-upload-tags" name="tags" value={uploadForm.tags} onChange={handleUploadChange} placeholder="faith, teaching" /></div>
              </div>
              <label className="studio-upload-public"><input type="checkbox" name="isPublic" checked={uploadForm.isPublic} onChange={handleUploadChange} />Public audio</label>
              <div className="studio-upload-actions"><button type="button" onClick={closeUpload} disabled={uploading}>Cancel</button><button type="submit" className="primary" disabled={uploading || !uploadForm.file || !uploadForm.title.trim()}>{uploading ? 'Uploading...' : 'Upload audio'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatorStudio;
