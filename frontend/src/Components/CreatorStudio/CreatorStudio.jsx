import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FaCloudUploadAlt,
  FaExclamationCircle,
  FaImage,
  FaTimes,
} from 'react-icons/fa';
import { FiBell, FiCalendar, FiCamera, FiRadio, FiSettings } from 'react-icons/fi';
import { MdOutlinePodcasts } from 'react-icons/md';
import { PiChartBar } from 'react-icons/pi';

import './CreatorStudio.css';
import './CreatorStudio.identity.css';
import './CreatorStudioShellFinal.css';
import './CreatorStudioV2Shell.css';
import echooLogo from '../Assets/echoo-logo-mark.png';
import echooDecorativeLogo from '../Assets/echoo-logo.png';
import studioService from '../../services/studioService';
import { api } from '../../services/api';
import { buildGeneratedAudioCoverUrl } from '../../audioCover/audioCover';
import ListenerLiveConnected from '../ListenerLive/ListenerLiveConnected';
import CreatorDiscoverWorkspace from './CreatorDiscoverWorkspace';
import CreatorChannelsWorkspace from './CreatorChannelsWorkspace';
import { CreatorStudioStateProvider } from './CreatorStudioState';
import CreatorContentWorkspace from './CreatorContentWorkspace';
import CreatorBroadcastWorkspace from './CreatorLiveConnectedWorkspace';
import CreatorStationsWorkspace from './CreatorStationsWorkspace';
import CreatorAudienceWorkspace from './CreatorAudienceWorkspace';
import CreatorAnalyticsWorkspace from './CreatorAnalyticsConnectedWorkspace';
import CreatorSettingsWorkspace from './CreatorSettingsWorkspace';
import CreatorNotificationsWorkspace from './CreatorNotificationsWorkspace';
import CreatorCollectionsWorkspace from './CreatorCollectionsWorkspace';
import AccountExperienceMenu from '../Shared/AccountExperienceMenu';

const GENRES = [
  'Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B',
  'Country', 'Metal', 'Reggae', 'Podcast', 'Spiritual', 'Educational',
  'Comedy', 'Storytelling', 'Other',
];

const EMPTY_UPLOAD = {
  file: null,
  coverFile: null,
  coverPreview: '',
  title: '',
  description: '',
  genre: 'Other',
  tags: '',
  isPublic: true,
};

const MAX_COVER_SIZE = 5 * 1024 * 1024;
const COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm',
]);

const readJson = (key, fallback = {}) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const isSupportedAudioFile = (file) => {
  if (!file) return false;
  const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  return (
    String(file.type || '').startsWith('audio/') ||
    String(file.type || '').toLowerCase() === 'video/webm'
  ) && AUDIO_EXTENSIONS.has(extension);
};

const CreatorStudioBody = () => {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const [activeNav, setActiveNav] = useState(() => {
    if (location.pathname.endsWith('/channels')) return 'Channels';
    if (location.pathname.endsWith('/discover')) return 'Discover';
    return 'Broadcast';
  });
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD);

  const creatorSetup = useMemo(() => readJson('creatorSetup', {}), []);
  const [user, setUser] = useState(() => readJson('user', {}));

  const isOrganization =
    creatorSetup.type === 'organization' ||
    user.creatorProfile?.creatorType === 'organization';

  const studioName = isOrganization
    ? creatorSetup.name || creatorSetup.organizationName || user.creatorProfile?.organizationName || user.displayName || 'Creator Studio'
    : user.displayName || user.fullname || user.name || user.username || 'Creator Studio';

  const profileImage = user.avatar || user.profileImage || localStorage.getItem('profileImage') || null;

  const generatedUploadArtwork = useMemo(
    () => buildGeneratedAudioCoverUrl({
      title: uploadForm.title.trim() || 'Your Echoo Audio',
      artistName: studioName,
      genre: uploadForm.genre || 'Other',
    }),
    [uploadForm.title, uploadForm.genre, studioName]
  );

  const uploadArtwork = uploadForm.coverPreview || generatedUploadArtwork;

  const navItems = [
    { name: 'Broadcast', label: 'Broadcast', icon: <FiRadio /> },
    { name: 'Channels', label: 'Channels', icon: <MdOutlinePodcasts /> },
    { name: 'Recordings', label: 'Recordings', target: 'Collections', icon: <FiCamera /> },
    { name: 'Schedule Events', label: 'Schedule Events', target: 'Schedule', icon: <FiCalendar /> },
    { name: 'Analytics', label: 'Analytics', icon: <PiChartBar /> },
  ];

  useEffect(() => {
    let active = true;
    api.auth.getCurrentUser().then((response) => {
      const currentUser = response?.data?.user || response?.data;
      if (!active || !currentUser || typeof currentUser !== 'object') return;
      setUser(currentUser);
      localStorage.setItem('user', JSON.stringify(currentUser));
    }).catch(() => {
      // The cached authenticated user remains a valid offline fallback.
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (location.pathname.endsWith('/channels')) {
      setActiveNav('Channels');
    } else if (location.pathname.endsWith('/discover')) {
      setActiveNav('Discover');
    } else if (activeNav === 'Discover' || activeNav === 'Channels') {
      setActiveNav('Broadcast');
    }
  }, [location.pathname, activeNav]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!['Audio', 'Collections', 'Audience'].includes(activeNav)) return;
      try {
        setLoading(true);
        setError('');
        if (activeNav === 'Audio' || activeNav === 'Collections') {
          const response = await studioService.getContent({ page: contentPage, limit: 50 });
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

  useEffect(() => {
    const onCreatorAudioChanged = () => setRefreshKey((value) => value + 1);
    window.addEventListener('echoo:creator-audio-changed', onCreatorAudioChanged);
    return () => window.removeEventListener('echoo:creator-audio-changed', onCreatorAudioChanged);
  }, []);

  const navigateStudio = (page) => {
    let target = page;
    if (page === 'Home') target = 'Studio';
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
    if (target === 'Channels') {
      routerNavigate('/creator-studio/channels');
    } else if (target === 'Discover') {
      routerNavigate('/creator-studio/discover');
    } else if (location.pathname !== '/creator-studio') {
      routerNavigate('/creator-studio');
    }
    setActiveNav(target);
  };

  const openUpload = () => {
    setError('');
    setNotice('');
    setUploadForm({ ...EMPTY_UPLOAD });
    setUploadOpen(true);
  };

  const closeUpload = () => {
    if (!uploading) {
      setUploadOpen(false);
      setUploadForm({ ...EMPTY_UPLOAD });
    }
  };

  const handleUploadChange = (event) => {
    const { name, value, checked, files, type } = event.target;

    if (name === 'file') {
      const file = files?.[0] || null;
      if (file && !isSupportedAudioFile(file)) {
        setError('Choose MP3, M4A/AAC, WAV, OGG/Opus, FLAC or audio WebM.');
        event.target.value = '';
        return;
      }
      setUploadForm((current) => ({
        ...current,
        file,
        title: current.title || file?.name?.replace(/\.[^/.]+$/, '') || '',
      }));
      setError('');
      return;
    }

    if (name === 'coverFile') {
      const coverFile = files?.[0] || null;
      if (!coverFile) return;

      if (!COVER_TYPES.has(coverFile.type)) {
        setError('Cover artwork must be JPG, PNG or WebP.');
        event.target.value = '';
        return;
      }

      if (coverFile.size > MAX_COVER_SIZE) {
        setError('Cover artwork must be 5 MB or smaller.');
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setUploadForm((current) => ({
          ...current,
          coverFile,
          coverPreview: typeof reader.result === 'string' ? reader.result : '',
        }));
        setError('');
      };
      reader.readAsDataURL(coverFile);
      return;
    }

    setUploadForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const removeUploadCover = () => {
    setUploadForm((current) => ({
      ...current,
      coverFile: null,
      coverPreview: '',
    }));
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    if (!uploadForm.file || !uploadForm.title.trim() || uploading) return;
    if (!isSupportedAudioFile(uploadForm.file)) {
      setError('Please choose a supported audio file.');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setNotice('');
      await studioService.uploadAudio({
        file: uploadForm.file,
        coverFile: uploadForm.coverFile,
        title: uploadForm.title.trim(),
        description: uploadForm.description.trim(),
        genre: uploadForm.genre,
        tags: uploadForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        isPublic: uploadForm.isPublic,
      });
      setUploadOpen(false);
      setUploadForm({ ...EMPTY_UPLOAD });
      setNotice('Audio uploaded successfully.');
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
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
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
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
            onChanged={() => setRefreshKey((value) => value + 1)}
          />
        );
      case 'Channels':
        return <CreatorChannelsWorkspace />;
      case 'Stations':
        return <CreatorStationsWorkspace studioName={studioName} onNavigate={navigateStudio} />;
      case 'Discover':
        return <CreatorDiscoverWorkspace onNavigate={navigateStudio} />;
      case 'Collections':
        return (
          <CreatorCollectionsWorkspace
            tracks={Array.isArray(content?.tracks) ? content.tracks : []}
            studioName={studioName}
            onChanged={() => setRefreshKey((value) => value + 1)}
          />
        );
      case 'Broadcast':
        return (
          <CreatorBroadcastWorkspace
            studioName={studioName}
            profileImage={profileImage}
            initialBroadcastId={preparedBroadcastId}
            onNavigate={navigateStudio}
            onAddMusic={openUpload}
            onClearPreparedBroadcast={clearPreparedBroadcast}
          />
        );
      case 'Explore Live':
        return <ListenerLiveConnected />;
      case 'Audience':
        return <CreatorAudienceWorkspace audience={audience} loading={loading} onNavigate={navigateStudio} />;
      case 'Analytics':
        return <CreatorAnalyticsWorkspace onNavigate={navigateStudio} />;
      case 'Settings':
        return <CreatorSettingsWorkspace />;
      case 'Notifications':
        return <CreatorNotificationsWorkspace onNavigate={navigateStudio} />;
      default:
        return (
          <CreatorBroadcastWorkspace
            studioName={studioName}
            profileImage={profileImage}
            initialBroadcastId={preparedBroadcastId}
            onNavigate={navigateStudio}
            onAddMusic={openUpload}
            onClearPreparedBroadcast={clearPreparedBroadcast}
          />
        );
    }
  };

  return (
    <div className="studio-page studio-final-shell studio-v2-shell">
      <aside className="studio-sidebar">
        <div className="studio-sidebar-head">
          <button type="button" className="studio-brand" onClick={() => navigateStudio('Broadcast')} aria-label="Echoo Broadcast">
            <img src={echooLogo} alt="Echoo" className="studio-logo" />
            <span className="studio-brand-wordmark">echoo</span>
          </button>
        </div>

        <nav className="studio-navigation" aria-label="Creator Studio">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.name}
              className={`studio-nav-item ${activeNav === item.name || activeNav === item.target ? 'active' : ''}`}
              onClick={() => navigateStudio(item.target || item.name)}
              title={item.label}
              aria-label={item.label}
            >
              <span className="studio-nav-icon">{item.icon}</span><span className="studio-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <img className="studio-sidebar-watermark" src={echooDecorativeLogo} alt="" aria-hidden="true" />
      </aside>

      <main id="echoo-main-content" tabIndex="-1" className="studio-main">
        <header className="studio-topbar studio-topbar-final">
          <AccountExperienceMenu
            currentExperience="creator"
            user={user}
            profileImage={profileImage}
            variant="creator"
            onUserChange={setUser}
          />
          <div className="studio-top-actions">
            <button type="button" className="notification-button" onClick={() => navigateStudio('Notifications')} title="Notifications" aria-label="Notifications"><FiBell /></button>
            <button type="button" className="studio-icon-button" onClick={() => navigateStudio('Settings')} title="Settings" aria-label="Settings"><FiSettings /></button>
          </div>
        </header>

        {error && <div className="studio-alert error"><FaExclamationCircle /><span>{error}</span><button type="button" onClick={() => setError('')}><FaTimes /></button></div>}
        {notice && <div className="studio-alert success"><FaCloudUploadAlt /><span>{notice}</span><button type="button" onClick={() => setNotice('')}><FaTimes /></button></div>}

        <div className="studio-view">{renderWorkspace()}</div>
        <footer className="studio-footer"><span>© 2026 Echoo.</span><span>Audio-first creator platform</span></footer>
      </main>

      {uploadOpen && (
        <div className="studio-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpload(); }}>
          <div className="studio-upload-modal studio-upload-modal-artwork">
            <div className="upload-modal-header">
              <div>
                <h2>Upload audio & artwork</h2>
                <p>Add the audio file, then give it a recognizable square cover for Listener cards and your Creator library. If you skip artwork, Echoo generates one automatically.</p>
              </div>
              <button type="button" className="upload-close-button" onClick={closeUpload} disabled={uploading} aria-label="Close upload"><FaTimes /></button>
            </div>

            <form onSubmit={handleUploadSubmit} className="studio-upload-form">
              <div className="studio-upload-composer">
                <aside className="studio-upload-artwork-column">
                  <div className="studio-upload-artwork-preview">
                    <img src={uploadArtwork} alt="Audio card artwork preview" />
                    <span>{uploadForm.coverFile ? 'Custom artwork' : 'Echoo artwork'}</span>
                  </div>

                  <label className="studio-cover-picker">
                    <FaImage /> {uploadForm.coverFile ? 'Change cover image' : 'Upload cover image'}
                    <input
                      type="file"
                      name="coverFile"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleUploadChange}
                    />
                  </label>

                  {uploadForm.coverFile && (
                    <button type="button" className="studio-cover-remove" onClick={removeUploadCover}>
                      <FaTimes /> Use Echoo artwork instead
                    </button>
                  )}

                  <p className="studio-upload-artwork-help">
                    Square artwork works best. JPG, PNG or WebP up to 5 MB. This same image is used on Listener audio cards and Creator Audio.
                  </p>
                </aside>

                <div className="studio-upload-fields-column">
                  <label className="studio-upload-drop">
                    <input
                      type="file"
                      name="file"
                      accept="audio/*,.webm,.m4a,.aac,.ogg,.oga,.opus,.flac"
                      onChange={handleUploadChange}
                      hidden
                    />
                    <div><FaCloudUploadAlt /></div>
                    <strong>{uploadForm.file?.name || 'Choose audio file'}</strong>
                    <span>MP3, M4A/AAC, WAV, OGG/Opus, FLAC or audio WebM</span>
                  </label>

                  <div className="studio-form-field">
                    <label htmlFor="studio-upload-title">Title</label>
                    <input id="studio-upload-title" name="title" value={uploadForm.title} onChange={handleUploadChange} maxLength={150} required />
                  </div>

                  <div className="studio-form-field">
                    <label htmlFor="studio-upload-description">Description</label>
                    <textarea id="studio-upload-description" name="description" value={uploadForm.description} onChange={handleUploadChange} maxLength={2000} />
                  </div>

                  <div className="studio-form-row">
                    <div className="studio-form-field">
                      <label htmlFor="studio-upload-genre">Genre</label>
                      <select id="studio-upload-genre" name="genre" value={uploadForm.genre} onChange={handleUploadChange}>
                        {GENRES.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                      </select>
                    </div>
                    <div className="studio-form-field">
                      <label htmlFor="studio-upload-tags">Tags</label>
                      <input id="studio-upload-tags" name="tags" value={uploadForm.tags} onChange={handleUploadChange} placeholder="faith, teaching" />
                    </div>
                  </div>

                  <div className="studio-upload-card-preview" aria-label="Audio card preview">
                    <img src={uploadArtwork} alt="" />
                    <div>
                      <strong>{uploadForm.title.trim() || 'Your audio title'}</strong>
                      <span>{studioName} · {uploadForm.genre || 'Other'}</span>
                    </div>
                    <small>{uploadForm.isPublic ? 'PUBLIC' : 'PRIVATE'}</small>
                  </div>

                  <label className="studio-upload-public">
                    <input type="checkbox" name="isPublic" checked={uploadForm.isPublic} onChange={handleUploadChange} />
                    Public audio — listeners can discover and play it
                  </label>
                </div>
              </div>

              <div className="studio-upload-actions">
                <button type="button" onClick={closeUpload} disabled={uploading}>Cancel</button>
                <button type="submit" className="primary" disabled={uploading || !uploadForm.file || !uploadForm.title.trim()}>
                  {uploading ? 'Uploading...' : uploadForm.isPublic ? 'Upload & publish' : 'Save privately'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const CreatorStudio = () => {
  const user = useMemo(() => readJson('user', {}), []);
  return (
    <CreatorStudioStateProvider user={user}>
      <CreatorStudioBody />
    </CreatorStudioStateProvider>
  );
};

export default CreatorStudio;
