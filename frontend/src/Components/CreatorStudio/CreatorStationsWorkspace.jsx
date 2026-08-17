import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaEdit,
  FaEllipsisH,
  FaImage,
  FaMicrophone,
  FaPlus,
  FaSave,
  FaTimes,
  FaTrash,
  FaUpload,
  FaUsers,
} from 'react-icons/fa';

import batch2Service from '../../services/batch2Service';
import './CreatorStationsExact.css';
import './CreatorStationLogo.css';

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

const EMPTY_FORM = {
  name: '',
  category: 'Other',
  description: '',
  tags: '',
  logoFile: null,
  logoPreview: '',
  removeLogo: false,
  isPublic: true,
};

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const CreatorStationsWorkspace = ({ studioName = 'Creator', onNavigate }) => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [menuStationId, setMenuStationId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
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
      setStations(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError) {
      setStations([]);
      setError(loadError?.message || 'Could not load your stations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  const sorted = useMemo(
    () => [...stations].sort(
      (first, second) =>
        new Date(second.updatedAt || second.createdAt || 0) -
        new Date(first.updatedAt || first.createdAt || 0)
    ),
    [stations]
  );

  const liveStation = stations.find((station) => station.isLive) || null;

  const openBroadcast = (station, nextMode = 'now') => {
    if (!station?.id) return;
    sessionStorage.setItem('echooSelectedStationId', String(station.id));
    sessionStorage.setItem('echooBroadcastMode', nextMode);
    setMenuStationId('');
    onNavigate?.('Broadcast');
  };

  const resetLogoInput = () => {
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingId('');
    setForm(EMPTY_FORM);
    resetLogoInput();
  };

  const openCreate = () => {
    setMessage('');
    setError('');
    setEditingId('');
    setMenuStationId('');
    setForm(EMPTY_FORM);
    resetLogoInput();
    setFormOpen(true);
  };

  const openEdit = (station) => {
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
      logoPreview: station.logo || station.coverArt || '',
      removeLogo: false,
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
      }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setForm((current) => ({
      ...current,
      logoFile: null,
      logoPreview: '',
      removeLogo: true,
    }));
    resetLogoInput();
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

      setStations((current) => {
        const exists = current.some((station) => String(station.id) === String(response.data.id));
        if (exists) {
          return current.map((station) =>
            String(station.id) === String(response.data.id) ? response.data : station
          );
        }
        return [response.data, ...current];
      });

      setMessage(editingId ? 'Station updated.' : 'Station created.');
      setFormOpen(false);
      setEditingId('');
      setForm(EMPTY_FORM);
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
      setDeletingId(String(station.id));
      setError('');
      setMessage('');
      setMenuStationId('');
      await batch2Service.deleteStation(station.id);
      setStations((current) => current.filter((item) => String(item.id) !== String(station.id)));
      setMessage('Station deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete the station.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <section className="est">
      <header className="est-header">
        <div>
          <h1>Your stations</h1>
          <p>
            A station is the home for your broadcasts. Create it once, then choose it whenever
            you go live or schedule your next session.
          </p>
        </div>
        <button type="button" className="est-new" onClick={openCreate}>
          <FaPlus /> New station
        </button>
      </header>

      <section className="est-summary">
        <div>
          <i className="blue"><FaBroadcastTower /></i>
          <span><strong>{stations.length} {stations.length === 1 ? 'station' : 'stations'}</strong><small>{studioName}</small></span>
        </div>
        <div>
          <i className="purple"><FaCalendarAlt /></i>
          <span><strong>Go live or schedule</strong><small>Use any station for your next broadcast</small></span>
        </div>
        <div>
          <i className="green"><FaUsers /></i>
          <span><strong>Build your audience</strong><small>Keep each station focused and recognizable</small></span>
        </div>
      </section>

      {message && <div className="est-message success">{message}</div>}
      {error && <div className="est-message error">{error}</div>}

      {formOpen && (
        <form className="est-form" onSubmit={submitStation}>
          <div className="est-form-head">
            <div>
              <span>{editingId ? 'EDIT STATION' : 'NEW STATION'}</span>
              <h2>{editingId ? 'Update station' : 'Create a station'}</h2>
              <p>This is the permanent home your broadcasts belong to.</p>
            </div>
            <button type="button" onClick={closeForm}>Close</button>
          </div>
          <div className="est-form-grid">
            <label><span>Station name</span><input value={form.name} maxLength={100} placeholder="e.g. Layers of Truth" onChange={(event) => updateField('name', event.target.value)} required /></label>
            <label><span>Category</span><select value={form.category} onChange={(event) => updateField('category', event.target.value)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="wide"><span>Description</span><textarea value={form.description} maxLength={2000} placeholder="What is this station about?" onChange={(event) => updateField('description', event.target.value)} /></label>

            <div className="est-logo-field wide">
              <div className="est-logo-copy">
                <span>Station logo <em>Optional</em></span>
                <p>Upload the logo or brand image listeners should recognize. It will appear across the station, Broadcast Studio and listener-facing station views.</p>
              </div>
              <div className="est-logo-picker">
                <div className={`est-logo-preview ${form.logoPreview ? 'has-image' : ''}`}>
                  {form.logoPreview
                    ? <img src={form.logoPreview} alt="Station logo preview" />
                    : <FaImage />}
                </div>
                <div className="est-logo-actions">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleLogoFile}
                  />
                  <button type="button" onClick={() => logoInputRef.current?.click()}>
                    <FaUpload /> {form.logoPreview ? 'Change logo' : 'Upload logo'}
                  </button>
                  {form.logoPreview && (
                    <button type="button" className="remove" onClick={removeLogo}>
                      <FaTimes /> Remove
                    </button>
                  )}
                  <small>JPG, PNG or WebP · max 5 MB</small>
                </div>
              </div>
            </div>

            <label><span>Tags</span><input value={form.tags} placeholder="faith, teaching, inspiration" onChange={(event) => updateField('tags', event.target.value)} /></label>
            <label className="est-public"><input type="checkbox" checked={form.isPublic} onChange={(event) => updateField('isPublic', event.target.checked)} /><span>Public station</span></label>
          </div>
          <div className="est-form-actions">
            <button type="button" onClick={closeForm} disabled={saving}>Cancel</button>
            <button type="submit" className="primary" disabled={saving || !form.name.trim()}>
              <FaSave /> {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create station'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="est-loading"><span /><span /><span /></div>
      ) : sorted.length === 0 ? (
        <div className="est-empty">
          <FaBroadcastTower />
          <h2>No stations yet</h2>
          <p>Create your first station to start broadcasting.</p>
          <button type="button" onClick={openCreate}><FaPlus /> New station</button>
        </div>
      ) : (
        <div className="est-grid">
          {sorted.map((station) => {
            const isCurrentLive = Boolean(station.isLive);
            const anotherStationLive = Boolean(liveStation && !isCurrentLive);
            const menuOpen = String(menuStationId) === String(station.id);

            return (
              <article className={`est-card ${isCurrentLive ? 'live' : ''}`} key={station.id}>
                <div className="est-art">
                  {station.logo || station.coverArt
                    ? <img src={station.logo || station.coverArt} alt={`${station.name} logo`} />
                    : <FaBroadcastTower />}
                  {isCurrentLive && <span>LIVE</span>}
                </div>
                <div className="est-body">
                  <small>{station.category || 'Other'}</small>
                  <h2>{station.name}</h2>
                  <p>{station.description || 'No description yet.'}</p>
                  <div className="est-stats">
                    <span><i /> {Number(station.followerCount || 0).toLocaleString()} followers</span>
                    <span>·</span>
                    <span>{Number(station.listenerCount || 0).toLocaleString()} listening</span>
                  </div>

                  {isCurrentLive ? (
                    <button type="button" className="est-primary-action" onClick={() => openBroadcast(station, 'now')}>
                      <FaMicrophone /> Open studio
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="est-primary-action outline"
                      disabled={anotherStationLive}
                      title={anotherStationLive ? 'End the current live broadcast before starting another.' : ''}
                      onClick={() => openBroadcast(station, 'now')}
                    >
                      <FaMicrophone /> {anotherStationLive ? 'Live on another station' : 'Start broadcast'}
                    </button>
                  )}

                  <div className="est-card-footer">
                    <button type="button" className="est-secondary-action" onClick={() => openBroadcast(station, 'later')}>
                      <FaCalendarAlt /> Schedule
                    </button>
                    <div className="est-more-wrap">
                      <button
                        type="button"
                        className="est-more-button"
                        aria-label={`More actions for ${station.name}`}
                        aria-expanded={menuOpen}
                        onClick={() => setMenuStationId((current) => String(current) === String(station.id) ? '' : String(station.id))}
                      >
                        <FaEllipsisH />
                      </button>
                      {menuOpen && (
                        <div className="est-more-menu">
                          <button type="button" onClick={() => openEdit(station)}><FaEdit /> Edit station</button>
                          <button
                            type="button"
                            className="danger"
                            disabled={deletingId === String(station.id) || isCurrentLive}
                            onClick={() => removeStation(station)}
                            title={isCurrentLive ? 'End the live broadcast before deleting this station.' : 'Delete station'}
                          >
                            <FaTrash /> Delete station
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="est-bottom-note">
        <i><FaBroadcastTower /></i>
        <div>
          <strong>Keep stations focused</strong>
          <span>Use one station for a consistent audience, or separate stations for different shows and communities.</span>
        </div>
      </section>
    </section>
  );
};

export default CreatorStationsWorkspace;
