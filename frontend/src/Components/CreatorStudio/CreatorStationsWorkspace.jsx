import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaChevronDown,
  FaChevronRight,
  FaEdit,
  FaEllipsisH,
  FaList,
  FaMicrophone,
  FaPlay,
  FaPlus,
  FaRandom,
  FaSave,
  FaSearch,
  FaThLarge,
  FaTimes,
  FaTrash,
  FaUpload,
  FaUsers,
} from 'react-icons/fa';

import batch2Service from '../../services/batch2Service';
import {
  buildGeneratedStationBrandCoverUrl,
  randomStationBrandVariant,
} from '../../stationBranding/stationBranding';
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
  const [editingId, setEditingId] = useState('');
  const [menuStationId, setMenuStationId] = useState('');
  const [selectedStationId, setSelectedStationId] = useState(
    () => sessionStorage.getItem('echooSelectedStationId') || ''
  );
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState('updated');
  const [viewMode, setViewMode] = useState('list');
  const [visibleCount, setVisibleCount] = useState(4);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [form, setForm] = useState(createEmptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const logoInputRef = useRef(null);

  const loadStations = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await batch2Service.getMyStations();
      const nextStations = Array.isArray(response?.data) ? response.data : [];
      setStations(nextStations);

      try {
        const broadcastResponse = await batch2Service.getCreatorBroadcasts();
        setBroadcasts(Array.isArray(broadcastResponse?.data) ? broadcastResponse.data : []);
      } catch {
        setBroadcasts([]);
      }
    } catch (loadError) {
      setStations([]);
      setBroadcasts([]);
      setError(loadError?.message || 'Could not load your stations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  const sorted = useMemo(() => {
    const next = [...stations];
    if (sortMode === 'name') {
      return next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
    if (sortMode === 'followers') {
      return next.sort((a, b) => Number(b.followerCount || 0) - Number(a.followerCount || 0));
    }
    return next.sort(
      (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    );
  }, [stations, sortMode]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sorted;
    return sorted.filter((station) =>
      [station.name, station.category, station.description, ...(station.tags || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [search, sorted]);

  useEffect(() => {
    setVisibleCount(4);
  }, [search, sortMode, viewMode]);

  useEffect(() => {
    if (!sorted.length) {
      setSelectedStationId('');
      return;
    }

    const selectedStillExists = sorted.some((station) => idOf(station) === String(selectedStationId));
    if (selectedStillExists) return;

    const stored = sessionStorage.getItem('echooSelectedStationId') || '';
    const storedStation = sorted.find((station) => idOf(station) === stored);
    const next = storedStation || sorted[0];
    setSelectedStationId(idOf(next));
    sessionStorage.setItem('echooSelectedStationId', idOf(next));
  }, [selectedStationId, sorted]);

  const selectedStation = useMemo(
    () => stations.find((station) => idOf(station) === String(selectedStationId)) || sorted[0] || null,
    [selectedStationId, sorted, stations]
  );

  const liveStation = stations.find((station) => station.isLive) || null;

  const broadcastCounts = useMemo(() => {
    const counts = new Map();
    broadcasts.forEach((broadcast) => {
      const stationId = stationIdFromBroadcast(broadcast);
      if (!stationId) return;
      counts.set(stationId, (counts.get(stationId) || 0) + 1);
    });
    return counts;
  }, [broadcasts]);

  const recentActivity = useMemo(() => {
    if (!selectedStation) return [];
    const selectedId = idOf(selectedStation);
    return broadcasts
      .filter((broadcast) => stationIdFromBroadcast(broadcast) === selectedId)
      .sort(
        (a, b) =>
          new Date(b.startTime || b.startAt || b.createdAt || 0) -
          new Date(a.startTime || a.startAt || a.createdAt || 0)
      )
      .slice(0, 3);
  }, [broadcasts, selectedStation]);

  const generatedPreview = useMemo(
    () => buildGeneratedStationBrandCoverUrl({
      id: editingId || `preview-${form.brandingVariant}`,
      name: form.name.trim() || 'Your Station',
      category: form.category,
      branding: {
        mode: 'generated',
        variant: form.brandingVariant,
        version: 1,
      },
    }),
    [editingId, form.name, form.category, form.brandingVariant]
  );

  const brandPreview = form.brandingMode === 'custom' && form.logoPreview
    ? form.logoPreview
    : generatedPreview;

  const selectStation = (station, scrollOnMobile = false) => {
    if (!station?.id) return;
    const id = idOf(station);
    setSelectedStationId(id);
    setDescriptionExpanded(false);
    setMenuStationId('');
    sessionStorage.setItem('echooSelectedStationId', id);

    if (scrollOnMobile && window.matchMedia?.('(max-width: 760px)').matches) {
      window.setTimeout(() => {
        document.getElementById('station-details-panel')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 0);
    }
  };

  const openBroadcast = (station, nextMode = 'now') => {
    if (!station?.id) return;
    sessionStorage.setItem('echooSelectedStationId', idOf(station));
    sessionStorage.setItem('echooBroadcastMode', nextMode);
    setMenuStationId('');
    onNavigate?.('Broadcast');
  };

  const openActivity = (broadcast) => {
    if (!broadcast) return;
    const broadcastId = idOf(broadcast);
    if (broadcastId) sessionStorage.setItem('echooPreparedBroadcastId', broadcastId);
    if (selectedStation?.id) sessionStorage.setItem('echooSelectedStationId', idOf(selectedStation));
    onNavigate?.('Broadcast');
  };

  const openBroadcastLibrary = () => {
    if (selectedStation?.id) sessionStorage.setItem('echooSelectedStationId', idOf(selectedStation));
    onNavigate?.('Broadcast');
  };

  const resetLogoInput = () => {
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingId('');
    setForm(createEmptyForm());
    resetLogoInput();
  };

  const openCreate = () => {
    setMessage('');
    setError('');
    setEditingId('');
    setMenuStationId('');
    setForm(createEmptyForm());
    resetLogoInput();
    setFormOpen(true);
  };

  const openEdit = (station) => {
    if (!station) return;
    selectStation(station);
    setMessage('');
    setError('');
    setEditingId(station.id);
    setMenuStationId('');
    setForm({
      name: station.name || '',
      category: CATEGORIES.includes(station.category) ? station.category : 'Other',
      description: station.description || '',
      tags: Array.isArray(station.tags) ? station.tags.join(', ') : '',
      logoFile: null,
      logoPreview: station.logo || '',
      removeLogo: false,
      brandingMode: station.logo ? 'custom' : 'generated',
      brandingVariant: Number.isInteger(Number(station.branding?.variant))
        ? Number(station.branding.variant)
        : randomStationBrandVariant(),
      isPublic: station.isPublic !== false,
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
      removeLogo: Boolean(editingId) || current.removeLogo,
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

      const response = editingId
        ? await batch2Service.updateStation(editingId, payload)
        : await batch2Service.createStation(payload);

      if (!response?.data?.id) throw new Error('Echoo did not return the saved station.');

      const refreshed = await batch2Service.getMyStations();
      const canonicalStations = Array.isArray(refreshed?.data) ? refreshed.data : [];
      const canonical = canonicalStations.find(
        (station) => idOf(station) === idOf(response.data)
      );

      if (!canonical) {
        throw new Error('The station saved, but Echoo could not reload its brand from the backend.');
      }

      if (form.brandingMode === 'custom' && form.logoFile && !canonical.logo) {
        throw new Error('The station saved, but its custom logo did not persist.');
      }

      if (form.brandingMode === 'generated' && canonical.branding?.mode !== 'generated') {
        throw new Error('The station saved, but Echoo could not apply the generated brand.');
      }

      setStations(canonicalStations);
      setSelectedStationId(idOf(canonical));
      sessionStorage.setItem('echooSelectedStationId', idOf(canonical));
      setMessage(editingId ? 'Station updated.' : 'Station created.');
      setFormOpen(false);
      setEditingId('');
      setForm(createEmptyForm());
      resetLogoInput();
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the station.');
    } finally {
      setSaving(false);
    }
  };

  const removeStation = async (station) => {
    if (!station?.id || deletingId) return;
    if (!window.confirm(`Delete “${station.name}”?`)) return;

    try {
      setDeletingId(idOf(station));
      setError('');
      setMessage('');
      setMenuStationId('');
      await batch2Service.deleteStation(station.id);
      const nextStations = stations.filter((item) => idOf(item) !== idOf(station));
      setStations(nextStations);
      if (idOf(station) === String(selectedStationId)) {
        const next = nextStations[0] || null;
        setSelectedStationId(next ? idOf(next) : '');
        if (next) sessionStorage.setItem('echooSelectedStationId', idOf(next));
        else sessionStorage.removeItem('echooSelectedStationId');
      }
      setMessage('Station deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete the station.');
    } finally {
      setDeletingId('');
    }
  };

  const featured = selectedStation;
  const featuredState = stationState(featured);
  const featuredBroadcastCount = featured ? broadcastCounts.get(idOf(featured)) || 0 : 0;
  const stationDescription = featured?.description || 'No description has been added for this station yet.';
  const defaultAudio = featured?.defaultAudio?.title || featured?.defaultAudioTitle || 'Not set';

  return (
    <section className="est est-reference-page">
      <header className="est-header">
        <div>
          <h1>Your stations</h1>
          <p>
            A station is the home for your broadcasts. Create it once, then go live or
            schedule your next session whenever you are ready.
          </p>
        </div>
        <button type="button" className="est-new" onClick={openCreate}>
          <FaPlus /> New station
        </button>
      </header>

      {message && <div className="est-message success">{message}</div>}
      {error && <div className="est-message error">{error}</div>}

      {loading ? (
        <div className="est-page-loading">
          <div className="est-loading-featured" />
          <div className="est-loading-details" />
        </div>
      ) : !stations.length ? (
        <div className="est-empty">
          <FaBroadcastTower />
          <h2>No stations yet</h2>
          <p>Create your first station to start broadcasting.</p>
          <button type="button" onClick={openCreate}><FaPlus /> New station</button>
        </div>
      ) : (
        <div className="est-workspace-grid">
          <div className="est-workspace-main">
            <section className="est-featured-card">
              <span className="est-featured-label">FEATURED STATION</span>
              <div className="est-featured-layout">
                <button
                  type="button"
                  className="est-featured-art"
                  onClick={() => selectStation(featured, true)}
                  aria-label={`Select ${featured?.name || 'featured station'}`}
                >
                  <img src={featured?.brandCover || featured?.coverArt} alt={`${featured?.name || 'Station'} brand`} />
                  {featured?.isLive && <span>LIVE</span>}
                </button>

                <div className="est-featured-copy">
                  <span className={`est-status ${featuredState}`}>
                    <i /> {featuredState === 'live' ? 'Live now' : featuredState === 'offline' ? 'Offline' : 'Ready to broadcast'}
                  </span>
                  <h2>{featured?.name}</h2>
                  <span className="est-category-pill">{featured?.category || 'Other'}</span>
                  <p>{stationDescription}</p>
                  <div className="est-featured-stats">
                    <div><FaUsers /><strong>{formatNumber(featured?.followerCount)}</strong><span>Followers</span></div>
                    <div><FaHeadphonesSafe /><strong>{formatNumber(featured?.listenerCount)}</strong><span>Listening now</span></div>
                    <div><FaBroadcastTower /><strong>{formatNumber(featuredBroadcastCount)}</strong><span>Broadcasts</span></div>
                  </div>
                </div>

                <div className="est-featured-actions">
                  <button type="button" className="primary" onClick={() => openBroadcast(featured, 'now')}>
                    <FaBroadcastTower /> {featured?.isLive ? 'Open studio' : 'Start broadcast'}
                  </button>
                  <button type="button" onClick={() => openEdit(featured)}>
                    <FaEdit /> Edit branding
                  </button>
                  <button type="button" onClick={() => openBroadcast(featured, 'later')}>
                    <FaCalendarAlt /> Schedule
                  </button>
                  <div className="est-featured-more-wrap">
                    <button
                      type="button"
                      className="icon-only"
                      aria-label="More featured station actions"
                      aria-expanded={menuStationId === `featured-${idOf(featured)}`}
                      onClick={() => setMenuStationId((current) => current === `featured-${idOf(featured)}` ? '' : `featured-${idOf(featured)}`)}
                    >
                      <FaEllipsisH />
                    </button>
                    {menuStationId === `featured-${idOf(featured)}` && (
                      <div className="est-more-menu featured-menu">
                        <button type="button" onClick={() => openEdit(featured)}><FaEdit /> Edit station</button>
                        <button
                          type="button"
                          className="danger"
                          disabled={deletingId === idOf(featured) || featured?.isLive}
                          onClick={() => removeStation(featured)}
                        >
                          <FaTrash /> Delete station
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="est-all-stations">
              <div className="est-all-head">
                <div><h2>All stations</h2></div>
                <div className="est-toolbar">
                  <label className="est-search">
                    <FaSearch />
                    <input
                      type="search"
                      value={search}
                      placeholder="Search stations..."
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <label className="est-sort">
                    <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
                      <option value="updated">Recently updated</option>
                      <option value="name">Name</option>
                      <option value="followers">Most followers</option>
                    </select>
                    <FaChevronDown />
                  </label>
                  <div className="est-view-toggle" aria-label="Station view">
                    <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} aria-label="Grid view"><FaThLarge /></button>
                    <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} aria-label="List view"><FaList /></button>
                  </div>
                </div>
              </div>

              {filtered.length ? (
                <div className={`est-station-collection ${viewMode}`}>
                  {filtered.slice(0, visibleCount).map((station) => {
                    const state = stationState(station);
                    const menuOpen = menuStationId === idOf(station);
                    const isSelected = idOf(station) === idOf(featured);
                    const broadcastCount = broadcastCounts.get(idOf(station)) || 0;
                    const anotherStationLive = Boolean(liveStation && !station.isLive);

                    return (
                      <article className={`est-station-row ${isSelected ? 'selected' : ''}`} key={station.id}>
                        <button type="button" className="est-row-identity" onClick={() => selectStation(station, true)}>
                          <img src={station.brandCover || station.coverArt} alt="" />
                          <span><strong>{station.name}</strong><small>{station.category || 'Other'}</small></span>
                        </button>
                        <div className="est-row-stat"><strong>{formatNumber(station.followerCount)}</strong><span>Followers</span></div>
                        <div className="est-row-stat"><strong>{formatNumber(station.listenerCount)}</strong><span>Listening now</span></div>
                        <div className="est-row-stat"><strong>{formatNumber(broadcastCount)}</strong><span>Broadcasts</span></div>
                        <span className={`est-status compact ${state}`}><i />{state === 'live' ? 'Live' : state === 'offline' ? 'Offline' : 'Ready'}</span>
                        <div className="est-more-wrap">
                          <button
                            type="button"
                            className="est-more-button"
                            aria-label={`More actions for ${station.name}`}
                            aria-expanded={menuOpen}
                            onClick={() => setMenuStationId((current) => current === idOf(station) ? '' : idOf(station))}
                          >
                            <FaEllipsisH />
                          </button>
                          {menuOpen && (
                            <div className="est-more-menu">
                              <button type="button" onClick={() => openBroadcast(station, 'now')} disabled={anotherStationLive}>
                                <FaMicrophone /> {station.isLive ? 'Open studio' : 'Start broadcast'}
                              </button>
                              <button type="button" onClick={() => openBroadcast(station, 'later')}><FaCalendarAlt /> Schedule</button>
                              <button type="button" onClick={() => openEdit(station)}><FaEdit /> Edit station</button>
                              <button
                                type="button"
                                className="danger"
                                disabled={deletingId === idOf(station) || station.isLive}
                                onClick={() => removeStation(station)}
                              >
                                <FaTrash /> Delete station
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="est-no-results">No stations match “{search}”.</div>
              )}

              {filtered.length > visibleCount && (
                <button type="button" className="est-show-more" onClick={() => setVisibleCount((value) => value + 4)}>
                  Show more stations <FaChevronDown />
                </button>
              )}
            </section>
          </div>

          <aside className="est-details" id="station-details-panel">
            <div className="est-details-head">
              <h2>Station details</h2>
              <span className={`est-status compact ${featuredState}`}><i />{featuredState === 'live' ? 'Live now' : featuredState === 'offline' ? 'Offline' : 'Ready to broadcast'}</span>
            </div>

            <div className="est-details-identity">
              <img src={featured?.brandCover || featured?.coverArt} alt={`${featured?.name || 'Station'} brand`} />
              <div><h3>{featured?.name}</h3><span>{featured?.category || 'Other'}</span></div>
            </div>

            <div className="est-details-dates">
              <span>Created {formatDate(featured?.createdAt)}</span>
              <span>Last updated {formatDate(featured?.updatedAt)}</span>
            </div>

            <section className="est-details-about">
              <h3>About this station</h3>
              <p className={descriptionExpanded ? 'expanded' : ''}>{stationDescription}</p>
              {stationDescription.length > 130 && (
                <button type="button" onClick={() => setDescriptionExpanded((value) => !value)}>
                  {descriptionExpanded ? 'Show less' : 'View more'}
                </button>
              )}
            </section>

            <div className="est-detail-fields">
              <div><strong>Visibility</strong><span>{featured?.isPublic === false ? 'Private' : 'Public'}</span></div>
              <div><strong>Default audio</strong><span>{defaultAudio}</span></div>
            </div>

            <section className="est-recent-activity">
              <h3>Recent activity</h3>
              {recentActivity.length ? recentActivity.map((activity) => (
                <button type="button" key={idOf(activity)} onClick={() => openActivity(activity)}>
                  <i>{activity.status === 'live' ? <FaBroadcastTower /> : activity.status === 'completed' ? <FaPlay /> : <FaCalendarAlt />}</i>
                  <span><strong>{activity.title || 'Broadcast'}</strong><small>{formatDateTime(activity.startTime || activity.startAt || activity.createdAt)}</small></span>
                  {activity.status === 'live' ? <em>Live</em> : <FaChevronRight />}
                </button>
              )) : (
                <div className="est-activity-empty">No recent broadcasts for this station.</div>
              )}
            </section>

            <button type="button" className="est-view-broadcasts" onClick={openBroadcastLibrary}>
              View all broadcasts <FaChevronRight />
            </button>
          </aside>
        </div>
      )}

      {formOpen && (
        <div className="est-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
          <form className="est-form" onSubmit={submitStation}>
            <div className="est-form-head">
              <div>
                <span>{editingId ? 'EDIT STATION' : 'NEW STATION'}</span>
                <h2>{editingId ? 'Update station' : 'Create a station'}</h2>
                <p>This is the permanent home your broadcasts belong to.</p>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close station form"><FaTimes /></button>
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
                <textarea value={form.description} maxLength={2000} placeholder="What is this station about?" onChange={(event) => updateField('description', event.target.value)} />
              </label>

              <div className="est-brand-field wide">
                <div className="est-logo-copy">
                  <span>Station brand <em>Automatic</em></span>
                  <p>Echoo creates a branded cover automatically. Upload a custom logo or shuffle the generated design.</p>
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
                    <button type="button" onClick={() => setEchooBrandMode(true)}><FaRandom /> Shuffle Echoo design</button>
                    {form.brandingMode === 'custom' && (
                      <button type="button" className="remove" onClick={() => setEchooBrandMode(false)}><FaTimes /> Use Echoo design</button>
                    )}
                    <small>Generated designs are saved with the station. JPG, PNG or WebP logos can be up to 5 MB.</small>
                  </div>
                </div>
              </div>

              <label>
                <span>Tags</span>
                <input value={form.tags} placeholder="faith, teaching, inspiration" onChange={(event) => updateField('tags', event.target.value)} />
              </label>
              <label className="est-public">
                <input type="checkbox" checked={form.isPublic} onChange={(event) => updateField('isPublic', event.target.checked)} />
                <span>Public station</span>
              </label>
            </div>

            <div className="est-form-actions">
              <button type="button" onClick={closeForm} disabled={saving}>Cancel</button>
              <button type="submit" className="primary" disabled={saving || !form.name.trim()}>
                <FaSave /> {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create station'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};

const FaHeadphonesSafe = FaUsers;

export default CreatorStationsWorkspace;
