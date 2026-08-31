import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaEdit,
  FaHeadphones,
  FaLink,
  FaPlay,
  FaPlus,
  FaRandom,
  FaSave,
  FaTimes,
  FaUpload,
  FaUsers,
} from 'react-icons/fa';

import batch2Service from '../../services/batch2Service';
import {
  buildGeneratedStationBrandCoverUrl,
  randomStationBrandVariant,
} from '../../stationBranding/stationBranding';
import { getPublicStationPath, getPublicStationUrl } from '../../services/stationPublicUrl';
import './CreatorStationsReference.css';

const CATEGORIES = [
  'Faith & Spirituality',
  'Education',
  'News & Politics',
  'Business',
  'Health & Wellness',
  'Entertainment',
  'Technology',
  'Sports',
  'Music',
  'Comedy',
  'Storytelling',
  'Other',
];

const EMPTY_FORM = () => ({
  name: '',
  category: 'Other',
  description: '',
  logoFile: null,
  logoPreview: '',
  removeLogo: false,
  brandingMode: 'generated',
  brandingVariant: randomStationBrandVariant(),
  isPublic: true,
});

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const LIVE_STATUSES = new Set(['starting', 'live', 'ending']);
const idOf = (value) => String(value?.id || value?._id || value || '');

const stationIdFromBroadcast = (broadcast) =>
  idOf(broadcast?.stationId || broadcast?.station?.id || broadcast?.station?._id || broadcast?.station);

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatDuration = (value) => {
  const seconds = Math.max(0, Number(value) || 0);
  if (!seconds) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
};

const channelState = (channel) => {
  if (channel?.isLive) return 'live';
  if (String(channel?.status || '').toLowerCase() === 'offline') return 'offline';
  return 'ready';
};

const ownBroadcastArtwork = (broadcast) =>
  broadcast?.eventArtwork ||
  broadcast?.coverArt ||
  broadcast?.artwork ||
  broadcast?.image ||
  '';

const broadcastArtwork = (broadcast, channel, fallback) =>
  ownBroadcastArtwork(broadcast) ||
  channel?.brandCover ||
  channel?.coverArt ||
  channel?.logo ||
  fallback;

const CreatorStationsWorkspace = ({ onNavigate }) => {
  const [stations, setStations] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const logoInputRef = useRef(null);

  const loadChannel = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [stationResult, broadcastResult] = await Promise.allSettled([
        batch2Service.getMyStations(),
        batch2Service.getCreatorBroadcasts(),
      ]);

      const nextStations = stationResult.status === 'fulfilled' && Array.isArray(stationResult.value?.data)
        ? stationResult.value.data
        : [];
      const nextBroadcasts = broadcastResult.status === 'fulfilled' && Array.isArray(broadcastResult.value?.data)
        ? broadcastResult.value.data
        : [];

      setStations(nextStations);
      setBroadcasts(nextBroadcasts);
      if (stationResult.status === 'rejected') throw stationResult.reason;
    } catch (loadError) {
      setStations([]);
      setBroadcasts([]);
      setError(loadError?.message || 'Could not load your Channel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  const channel = useMemo(() => {
    if (!stations.length) return null;
    return [...stations].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    )[0];
  }, [stations]);

  useEffect(() => {
    if (!channel?.id) {
      sessionStorage.removeItem('echooSelectedStationId');
      return;
    }
    sessionStorage.setItem('echooSelectedStationId', idOf(channel));
  }, [channel]);

  const channelBroadcasts = useMemo(() => {
    if (!channel) return [];
    const channelId = idOf(channel);
    return broadcasts
      .filter((broadcast) => stationIdFromBroadcast(broadcast) === channelId)
      .sort(
        (a, b) =>
          new Date(b.startTime || b.startAt || b.createdAt || 0) -
          new Date(a.startTime || a.startAt || a.createdAt || 0)
      );
  }, [broadcasts, channel]);

  const recentBroadcasts = useMemo(
    () => channelBroadcasts
      .filter((broadcast) => {
        const status = String(broadcast?.status || '').toLowerCase();
        return LIVE_STATUSES.has(status) || status === 'completed';
      })
      .slice(0, 3),
    [channelBroadcasts]
  );

  const generatedPreview = useMemo(
    () => buildGeneratedStationBrandCoverUrl({
      id: channel?.id || `preview-${form.brandingVariant}`,
      name: form.name.trim() || 'Your Channel',
      category: form.category,
      branding: {
        mode: 'generated',
        variant: form.brandingVariant,
        version: 1,
      },
    }),
    [channel?.id, form.name, form.category, form.brandingVariant]
  );

  const channelArtwork = channel?.brandCover || channel?.coverArt || channel?.logo || generatedPreview;
  const brandPreview = form.brandingMode === 'custom' && form.logoPreview
    ? form.logoPreview
    : generatedPreview;
  const listenerCount = Number(channel?.listenerCount ?? channel?.totalListeners ?? 0) || 0;
  const state = channelState(channel);
  const publicPath = channel ? getPublicStationPath(channel) : '';
  const publicUrl = channel ? getPublicStationUrl(channel) : '';

  const resetLogoInput = () => {
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setForm(EMPTY_FORM());
    resetLogoInput();
  };

  const openSetup = () => {
    setMessage('');
    setError('');
    setForm(EMPTY_FORM());
    resetLogoInput();
    setFormOpen(true);
  };

  const openEdit = () => {
    if (!channel) return;
    setMessage('');
    setError('');
    setForm({
      name: channel.name || '',
      category: CATEGORIES.includes(channel.category) ? channel.category : 'Other',
      description: channel.description || '',
      logoFile: null,
      logoPreview: channel.logo || '',
      removeLogo: false,
      brandingMode: channel.logo ? 'custom' : 'generated',
      brandingVariant: Number.isInteger(Number(channel.branding?.variant))
        ? Number(channel.branding.variant)
        : randomStationBrandVariant(),
      isPublic: channel.isPublic !== false,
    });
    resetLogoInput();
    setFormOpen(true);
  };

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleLogoFile = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    if (!LOGO_TYPES.has(file.type)) {
      setError('Channel artwork must be a JPG, PNG or WebP image.');
      resetLogoInput();
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError('Channel artwork must be 5 MB or smaller.');
      resetLogoInput();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        logoFile: file,
        logoPreview: typeof reader.result === 'string' ? reader.result : '',
        removeLogo: false,
        brandingMode: 'custom',
      }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const setGeneratedArtwork = (shuffle = false) => {
    setForm((current) => ({
      ...current,
      logoFile: null,
      logoPreview: '',
      removeLogo: Boolean(channel?.id) || current.removeLogo,
      brandingMode: 'generated',
      brandingVariant: shuffle
        ? randomStationBrandVariant(current.brandingVariant)
        : current.brandingVariant,
    }));
    resetLogoInput();
    setError('');
  };

  const submitChannel = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || saving) return;

    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      tags: Array.isArray(channel?.tags) ? channel.tags : [],
      logoFile: form.logoFile,
      removeLogo: form.removeLogo,
      brandingMode: form.brandingMode,
      brandingVariant: form.brandingVariant,
      isPublic: form.isPublic,
    };

    try {
      setSaving(true);
      setError('');
      setMessage('');
      const response = channel?.id
        ? await batch2Service.updateStation(channel.id, payload)
        : await batch2Service.createStation(payload);

      if (!response?.data?.id) throw new Error('Echoo did not return the saved Channel.');
      await loadChannel();
      sessionStorage.setItem('echooSelectedStationId', idOf(response.data));
      setMessage(channel?.id ? 'Channel updated.' : 'Channel setup complete.');
      setFormOpen(false);
      setForm(EMPTY_FORM());
      resetLogoInput();
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the Channel.');
    } finally {
      setSaving(false);
    }
  };

  const openSchedule = () => {
    if (channel?.id) sessionStorage.setItem('echooSelectedStationId', idOf(channel));
    onNavigate?.('Schedule');
  };

  const openRecentBroadcast = (broadcast) => {
    const broadcastId = idOf(broadcast);
    if (broadcastId) sessionStorage.setItem('echooPreparedBroadcastId', broadcastId);
    if (channel?.id) sessionStorage.setItem('echooSelectedStationId', idOf(channel));
    const status = String(broadcast?.status || '').toLowerCase();
    if (LIVE_STATUSES.has(status)) onNavigate?.('Broadcast');
    else onNavigate?.('Collections');
  };

  const viewAsListener = () => {
    if (!publicPath || typeof window === 'undefined') return;
    window.open(new URL(publicPath, window.location.origin).toString(), '_blank', 'noopener,noreferrer');
  };

  const copyChannelLink = async () => {
    if (!publicUrl || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setError('');
      setMessage('Channel link copied.');
    } catch {
      setError('Could not copy the Channel link.');
    }
  };

  if (loading) {
    return (
      <section className="est est-reference-page">
        <div className="est-page-loading">
          <div className="est-loading-featured" />
          <div className="est-loading-recent" />
        </div>
      </section>
    );
  }

  return (
    <section className="est est-reference-page">
      <header className="est-header">
        <div>
          <h1>Channel</h1>
          <p>Manage how listeners see and discover your Channel.</p>
        </div>
        {!channel && (
          <button type="button" className="est-new" onClick={openSetup}>
            <FaPlus /> Set up Channel
          </button>
        )}
      </header>

      {message && <div className="est-message success">{message}</div>}
      {error && <div className="est-message error">{error}</div>}

      {!channel ? (
        <div className="est-empty">
          <FaBroadcastTower />
          <h2>Set up your Channel</h2>
          <p>Create the public Channel listeners can find, follow and hear live.</p>
          <button type="button" onClick={openSetup}><FaPlus /> Set up Channel</button>
        </div>
      ) : (
        <>
          <section className="est-channel-hero">
            <div className="est-channel-art">
              <img src={channelArtwork} alt={`${channel.name} Channel artwork`} />
              {channel.isLive && <span>LIVE</span>}
            </div>

            <div className="est-channel-copy">
              <span className={`est-status ${state}`}>
                <i /> {state === 'live' ? 'LIVE NOW' : state === 'offline' ? 'OFFLINE' : 'READY TO BROADCAST'}
              </span>
              <h2>{channel.name}</h2>
              <strong className="est-channel-category">{channel.category || 'Other'}</strong>
              <p>{channel.description || 'Add a short description so listeners know what your Channel is about.'}</p>

              <div className="est-channel-stats">
                <div><FaUsers /><strong>{formatNumber(channel.followerCount)}</strong><span>Followers</span></div>
                <div><FaHeadphones /><strong>{formatNumber(listenerCount)}</strong><span>Listening now</span></div>
              </div>

              <div className="est-channel-primary-actions">
                <button type="button" onClick={openEdit}><FaEdit /> Edit Channel</button>
              </div>

              <div className="est-channel-secondary-actions" aria-label="Channel actions">
                <button type="button" onClick={openSchedule}><FaCalendarAlt /> Schedule event</button>
                <button type="button" onClick={viewAsListener} disabled={!publicPath}><FaPlay /> View as Listener</button>
                <button type="button" onClick={copyChannelLink} disabled={!publicUrl}><FaLink /> Copy Channel link</button>
              </div>
            </div>
          </section>

          <section className="est-recent-section">
            <header className="est-recent-head">
              <div>
                <h2>Recent broadcasts</h2>
                <p>Your latest live sessions and recordings.</p>
              </div>
              <button type="button" onClick={() => onNavigate?.('Collections')}>View all</button>
            </header>

            {recentBroadcasts.length ? (
              <div className="est-recent-grid">
                {recentBroadcasts.map((broadcast) => {
                  const status = String(broadcast.status || '').toLowerCase();
                  const live = LIVE_STATUSES.has(status);
                  const start = broadcast.startTime || broadcast.startAt || broadcast.createdAt;
                  const duration = formatDuration(broadcast.duration);
                  const ownArtwork = ownBroadcastArtwork(broadcast);
                  const meta = live
                    ? `Started ${formatTime(start) || 'recently'}`
                    : [formatDate(start), duration].filter(Boolean).join(' · ');
                  return (
                    <article className={`est-broadcast-card${live ? ' is-live' : ''}`} key={idOf(broadcast)}>
                      <div className={`est-broadcast-art${ownArtwork ? '' : ' is-channel-fallback'}`}>
                        <img src={broadcastArtwork(broadcast, channel, channelArtwork)} alt="" />
                        <span className={live ? 'live' : 'recording'}>{live ? 'LIVE' : 'RECORDING'}</span>
                        {!live && <i><FaPlay /></i>}
                      </div>
                      <div className="est-broadcast-copy">
                        <h3>{broadcast.title || 'Untitled broadcast'}</h3>
                        <p>{meta || 'Recent broadcast'}</p>
                      </div>
                      <footer>
                        <span>{live ? <><FaUsers /> {formatNumber(broadcast.listenerCount)} listening</> : 'Recording available'}</span>
                        <button type="button" onClick={() => openRecentBroadcast(broadcast)}>
                          {live ? 'Open Studio' : 'View recording'}
                        </button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="est-recent-empty">Your completed and live broadcasts will appear here.</div>
            )}
          </section>
        </>
      )}

      {formOpen && (
        <div className="est-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <form className="est-form" onSubmit={submitChannel}>
            <header className="est-form-head">
              <div>
                <span>{channel ? 'EDIT CHANNEL' : 'CHANNEL SETUP'}</span>
                <h2>{channel ? 'Edit Channel' : 'Set up your Channel'}</h2>
                <p>Update the public identity listeners see across Echoo.</p>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close Channel form"><FaTimes /></button>
            </header>

            <div className="est-form-grid">
              <label>
                <span>Channel name</span>
                <input value={form.name} onChange={(event) => updateField('name', event.target.value)} maxLength="120" required autoFocus />
              </label>

              <label>
                <span>Category</span>
                <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>

              <label className="wide">
                <span>Description</span>
                <textarea value={form.description} onChange={(event) => updateField('description', event.target.value)} maxLength="1000" placeholder="Tell listeners what your Channel is about." />
              </label>

              <div className="est-brand-field wide">
                <div className="est-logo-copy">
                  <span>Channel artwork</span>
                  <p>Square artwork works best across Channel and live surfaces.</p>
                </div>
                <div className="est-brand-editor">
                  <div className="est-brand-preview"><img src={brandPreview} alt="Channel artwork preview" /></div>
                  <div className="est-brand-actions">
                    <label>
                      <FaUpload /> {form.brandingMode === 'custom' ? 'Change artwork' : 'Upload artwork'}
                      <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoFile} />
                    </label>
                    <button type="button" onClick={() => setGeneratedArtwork(false)}>Use Echoo artwork</button>
                    {form.brandingMode === 'generated' && <button type="button" onClick={() => setGeneratedArtwork(true)}><FaRandom /> Shuffle</button>}
                  </div>
                </div>
              </div>

              <label className="est-public">
                <input type="checkbox" checked={form.isPublic} onChange={(event) => updateField('isPublic', event.target.checked)} />
                <span>Public Channel</span>
              </label>
            </div>

            <footer className="est-form-actions">
              <button type="button" onClick={closeForm} disabled={saving}>Cancel</button>
              <button type="submit" className="primary" disabled={saving || !form.name.trim()}>
                <FaSave /> {saving ? 'Saving…' : 'Save Channel'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
};

export default CreatorStationsWorkspace;
