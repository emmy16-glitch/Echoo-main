import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaChevronRight,
  FaEdit,
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

const createEmptyForm = () => ({
  name: '',
  category: 'Other',
  description: '',
  tags: '',
  logoFile: null,
  logoPreview: '',
  removeLogo: false,
  brandingMode: 'generated',
  brandingVariant: randomStationBrandVariant(),
  isPublic: true,
});

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const idOf = (value) => String(value?.id || value?._id || value || '');

const stationIdFromBroadcast = (broadcast) =>
  idOf(broadcast?.stationId || broadcast?.station?.id || broadcast?.station?._id || broadcast?.station);

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const stationState = (station) => {
  if (station?.isLive) return 'live';
  if (String(station?.status || '').toLowerCase() === 'offline') return 'offline';
  return 'ready';
};

const CreatorStationsWorkspace = ({ onNavigate }) => {
  const [stations, setStations] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(createEmptyForm);
  const [saving, setSaving] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const logoInputRef = useRef(null);

  const loadStation = useCallback(async () => {
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

      if (stationResult.status === 'rejected') {
        throw stationResult.reason;
      }
    } catch (loadError) {
      setStations([]);
      setBroadcasts([]);
      setError(loadError?.message || 'Could not load your Station.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStation();
  }, [loadStation]);

  const canonicalStation = useMemo(() => {
    if (!stations.length) return null;
    return [...stations].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    )[0];
  }, [stations]);

  useEffect(() => {
    if (!canonicalStation?.id) {
      sessionStorage.removeItem('echooSelectedStationId');
      return;
    }
    sessionStorage.setItem('echooSelectedStationId', idOf(canonicalStation));
  }, [canonicalStation]);

  const stationBroadcasts = useMemo(() => {
    if (!canonicalStation) return [];
    const stationId = idOf(canonicalStation);
    return broadcasts
      .filter((broadcast) => stationIdFromBroadcast(broadcast) === stationId)
      .sort(
        (a, b) =>
          new Date(b.startTime || b.startAt || b.createdAt || 0) -
          new Date(a.startTime || a.startAt || a.createdAt || 0)
      );
  }, [broadcasts, canonicalStation]);

  const recentActivity = stationBroadcasts.slice(0, 3);
  const legacyStationCount = Math.max(0, stations.length - 1);
  const featuredState = stationState(canonicalStation);
  const stationDescription = canonicalStation?.description || 'No description has been added yet.';
  const publicPath = canonicalStation ? getPublicStationPath(canonicalStation) : '';
  const publicUrl = canonicalStation ? getPublicStationUrl(canonicalStation) : '';

  const generatedPreview = useMemo(
    () => buildGeneratedStationBrandCoverUrl({
      id: canonicalStation?.id || `preview-${form.brandingVariant}`,
      name: form.name.trim() || 'Your Station',
      category: form.category,
      branding: {
        mode: 'generated',
        variant: form.brandingVariant,
        version: 1,
      },
    }),
    [canonicalStation?.id, form.name, form.category, form.brandingVariant]
  );

  const brandPreview = form.brandingMode === 'custom' && form.logoPreview
    ? form.logoPreview
    : generatedPreview;

  const resetLogoInput = () => {
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setForm(createEmptyForm());
    resetLogoInput();
  };

  const openSetup = () => {
    setMessage('');
    setError('');
    setForm(createEmptyForm());
    resetLogoInput();
    setFormOpen(true);
  };

  const openEdit = () => {
    if (!canonicalStation) return;
    setMessage('');
    setError('');
    setForm({
      name: canonicalStation.name || '',
      category: CATEGORIES.includes(canonicalStation.category) ? canonicalStation.category : 'Other',
      description: canonicalStation.description || '',
      tags: Array.isArray(canonicalStation.tags) ? canonicalStation.tags.join(', ') : '',
      logoFile: null,
      logoPreview: canonicalStation.logo || '',
      removeLogo: false,
      brandingMode: canonicalStation.logo ? 'custom' : 'generated',
      brandingVariant: Number.isInteger(Number(canonicalStation.branding?.variant))
        ? Number(canonicalStation.branding.variant)
        : randomStationBrandVariant(),
      isPublic: canonicalStation.isPublic !== false,
    });
    resetLogoInput();
    setFormOpen(true);
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleLogoFile = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;

    if (!LOGO_TYPES.has(file.type)) {
      setError('Station logo must be a JPG, PNG or WebP image.');
      resetLogoInput();
      return;
    }

    if (file.size > MAX_LOGO_SIZE) {
      setError('Station logo must be 5 MB or smaller.');
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

  const setEchooBrandMode = (shuffle = false) => {
    setForm((current) => ({
      ...current,
      logoFile: null,
      logoPreview: '',
      removeLogo: Boolean(canonicalStation?.id) || current.removeLogo,
      brandingMode: 'generated',
      brandingVariant: shuffle
        ? randomStationBrandVariant(current.brandingVariant)
        : current.brandingVariant,
    }));
    resetLogoInput();
    setError('');
  };

  const submitStation = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || saving) return;

    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
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

      const response = canonicalStation?.id
        ? await batch2Service.updateStation(canonicalStation.id, payload)
        : await batch2Service.createStation(payload);

      if (!response?.data?.id) throw new Error('Echoo did not return the saved Station.');

      await loadStation();
      sessionStorage.setItem('echooSelectedStationId', idOf(response.data));
      setMessage(canonicalStation?.id ? 'Station updated.' : 'Station setup complete.');
      setFormOpen(false);
      setForm(createEmptyForm());
      resetLogoInput();
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the Station.');
    } finally {
      setSaving(false);
    }
  };

  const openBroadcast = () => {
    if (!canonicalStation?.id) return;
    sessionStorage.setItem('echooSelectedStationId', idOf(canonicalStation));
    sessionStorage.setItem('echooBroadcastMode', 'now');
    onNavigate?.('Broadcast');
  };

  const openSchedule = () => {
    if (canonicalStation?.id) {
      sessionStorage.setItem('echooSelectedStationId', idOf(canonicalStation));
    }
    onNavigate?.('Schedule');
  };

  const openActivity = (broadcast) => {
    const broadcastId = idOf(broadcast);
    if (broadcastId) sessionStorage.setItem('echooPreparedBroadcastId', broadcastId);
    if (canonicalStation?.id) sessionStorage.setItem('echooSelectedStationId', idOf(canonicalStation));
    const status = String(broadcast?.status || '').toLowerCase();
    if (['starting', 'live', 'ending'].includes(status)) {
      onNavigate?.('Broadcast');
      return;
    }
    if (status === 'scheduled') {
      onNavigate?.('Schedule');
      return;
    }
    onNavigate?.('Collections');
  };

  const viewAsListener = () => {
    if (!publicPath || typeof window === 'undefined') return;
    const url = new URL(publicPath, window.location.origin).toString();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <section className="est est-reference-page">
        <div className="est-page-loading">
          <div className="est-loading-featured" />
          <div className="est-loading-details" />
        </div>
      </section>
    );
  }

  return (
    <section className="est est-reference-page">
      <header className="est-header">
        <div>
          <h1>Station</h1>
          <p>Manage the one public Station your broadcasts belong to.</p>
        </div>
        {!canonicalStation && (
          <button type="button" className="est-new" onClick={openSetup}>
            <FaPlus /> Set up Station
          </button>
        )}
      </header>

      {message && <div className="est-message success">{message}</div>}
      {error && <div className="est-message error">{error}</div>}

      {!canonicalStation ? (
        <div className="est-empty">
          <FaBroadcastTower />
          <h2>Complete your Station setup</h2>
          <p>Create the one Station listeners can find, follow, and hear live.</p>
          <button type="button" onClick={openSetup}><FaPlus /> Set up Station</button>
        </div>
      ) : (
        <div className="est-workspace-grid">
          <div className="est-workspace-main">
            <section className="est-featured-card">
              <span className="est-featured-label">STATION</span>
              <div className="est-featured-layout">
                <div className="est-featured-art" aria-hidden="true">
                  <img
                    src={canonicalStation.brandCover || canonicalStation.coverArt || canonicalStation.logo || generatedPreview}
                    alt=""
                  />
                  {canonicalStation.isLive && <span>LIVE</span>}
                </div>

                <div className="est-featured-copy">
                  <span className={`est-status ${featuredState}`}>
                    <i /> {featuredState === 'live' ? 'Live now' : featuredState === 'offline' ? 'Offline' : 'Ready to broadcast'}
                  </span>
                  <h2>{canonicalStation.name}</h2>
                  <span className="est-category-pill">{canonicalStation.category || 'Other'}</span>
                  <p>{stationDescription}</p>

                  <div className="est-featured-stats">
                    <div><FaUsers /><strong>{formatNumber(canonicalStation.followerCount)}</strong><span>Followers</span></div>
                    <div><FaBroadcastTower /><strong>{formatNumber(stationBroadcasts.length)}</strong><span>Broadcasts</span></div>
                  </div>

                  {publicUrl && <p className="est-public-url">Public URL <span>{publicUrl}</span></p>}
                  {legacyStationCount > 0 && (
                    <p className="est-legacy-note">
                      {legacyStationCount} older station record{legacyStationCount === 1 ? '' : 's'} remain safely preserved in the backend. Creator Studio uses this Station as your canonical public identity.
                    </p>
                  )}
                </div>

                <div className="est-featured-actions">
                  <button type="button" className="primary" onClick={openBroadcast}>
                    <FaBroadcastTower /> {canonicalStation.isLive ? 'Open studio' : 'Start broadcast'}
                  </button>
                  <button type="button" onClick={openEdit}>
                    <FaEdit /> Edit Station
                  </button>
                  <button type="button" onClick={viewAsListener} disabled={!publicPath}>
                    <FaPlay /> View as Listener
                  </button>
                  <button type="button" onClick={openSchedule}>
                    <FaCalendarAlt /> Schedule
                  </button>
                </div>
              </div>
            </section>
          </div>

          <aside className="est-details" id="station-details-panel">
            <div className="est-details-head">
              <h2>Station details</h2>
              <span className={`est-status compact ${featuredState}`}>
                <i /> {featuredState === 'live' ? 'Live now' : featuredState === 'offline' ? 'Offline' : 'Ready to broadcast'}
              </span>
            </div>

            <div className="est-details-identity">
              <img
                src={canonicalStation.brandCover || canonicalStation.coverArt || canonicalStation.logo || generatedPreview}
                alt={`${canonicalStation.name || 'Station'} brand`}
              />
              <div><h3>{canonicalStation.name}</h3><span>{canonicalStation.category || 'Other'}</span></div>
            </div>

            <div className="est-details-dates">
              <span>Created {formatDate(canonicalStation.createdAt)}</span>
              <span>Last updated {formatDate(canonicalStation.updatedAt)}</span>
            </div>

            <section className="est-details-about">
              <h3>About this Station</h3>
              <p className={descriptionExpanded ? 'expanded' : ''}>{stationDescription}</p>
              {stationDescription.length > 130 && (
                <button type="button" onClick={() => setDescriptionExpanded((value) => !value)}>
                  {descriptionExpanded ? 'Show less' : 'View more'}
                </button>
              )}
            </section>

            <div className="est-detail-fields">
              <div><strong>Visibility</strong><span>{canonicalStation.isPublic === false ? 'Private' : 'Public'}</span></div>
              <div><strong>Station URL</strong><span>{publicPath || 'Unavailable'}</span></div>
            </div>

            <section className="est-recent-activity">
              <h3>Recent activity</h3>
              {recentActivity.length ? recentActivity.map((activity) => (
                <button type="button" key={idOf(activity)} onClick={() => openActivity(activity)}>
                  <i>{activity.status === 'live' ? <FaBroadcastTower /> : activity.status === 'completed' ? <FaPlay /> : <FaCalendarAlt />}</i>
                  <span>
                    <strong>{activity.title || 'Broadcast'}</strong>
                    <small>{formatDateTime(activity.startTime || activity.startAt || activity.createdAt)}</small>
                  </span>
                  {activity.status === 'live' ? <em>Live</em> : <FaChevronRight />}
                </button>
              )) : (
                <div className="est-activity-empty">No recent broadcasts for this Station.</div>
              )}
            </section>

            <button type="button" className="est-view-broadcasts" onClick={() => onNavigate?.('Collections')}>
              View recordings <FaChevronRight />
            </button>
          </aside>
        </div>
      )}

      {formOpen && (
        <div className="est-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <form className="est-form" onSubmit={submitStation}>
            <div className="est-form-head">
              <div>
                <span>{canonicalStation ? 'EDIT STATION' : 'STATION SETUP'}</span>
                <h2>{canonicalStation ? 'Update Station' : 'Set up your Station'}</h2>
                <p>This is your single public broadcasting identity on Echoo.</p>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close Station form"><FaTimes /></button>
            </div>

            <div className="est-form-grid">
              <label>
                <span>Station name</span>
                <input value={form.name} maxLength={100} placeholder="e.g. Layers of Truth" onChange={(event) => updateField('name', event.target.value)} required />
              </label>
              <label>
                <span>Category</span>
                <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
                  {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="wide">
                <span>Description</span>
                <textarea value={form.description} maxLength={2000} placeholder="What is this Station about?" onChange={(event) => updateField('description', event.target.value)} />
              </label>

              <div className="est-brand-field wide">
                <div className="est-logo-copy">
                  <span>Station artwork</span>
                  <p>Use Echoo-generated artwork or upload a custom logo for your Listener surfaces.</p>
                </div>

                <div className="est-brand-editor">
                  <div className={`est-brand-preview ${form.brandingMode === 'custom' ? 'has-image' : 'generated'}`}>
                    <img src={brandPreview} alt="Station brand preview" />
                    <span>{form.brandingMode === 'custom' ? 'CUSTOM LOGO' : 'ECHOO DESIGN'}</span>
                  </div>

                  <div className="est-brand-actions">
                    <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoFile} />
                    <button type="button" onClick={() => logoInputRef.current?.click()}>
                      <FaUpload /> {form.brandingMode === 'custom' ? 'Change logo' : 'Upload custom logo'}
                    </button>
                    <button type="button" onClick={() => setEchooBrandMode(true)}>
                      <FaRandom /> Shuffle Echoo design
                    </button>
                    {form.brandingMode === 'custom' && (
                      <button type="button" className="remove" onClick={() => setEchooBrandMode(false)}>
                        <FaTimes /> Use Echoo design
                      </button>
                    )}
                    <small>JPG, PNG or WebP up to 5 MB.</small>
                  </div>
                </div>
              </div>

              <label>
                <span>Tags</span>
                <input value={form.tags} placeholder="faith, teaching, inspiration" onChange={(event) => updateField('tags', event.target.value)} />
              </label>
              <label className="est-public">
                <input type="checkbox" checked={form.isPublic} onChange={(event) => updateField('isPublic', event.target.checked)} />
                <span>Public Station</span>
              </label>
            </div>

            <div className="est-form-actions">
              <button type="button" onClick={closeForm} disabled={saving}>Cancel</button>
              <button type="submit" className="primary" disabled={saving || !form.name.trim()}>
                <FaSave /> {saving ? 'Saving…' : canonicalStation ? 'Save changes' : 'Create Station'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

export default CreatorStationsWorkspace;
