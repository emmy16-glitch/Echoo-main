import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaEdit,
  FaMicrophone,
  FaPlus,
  FaSave,
  FaTrash,
} from 'react-icons/fa';

import EchoSignal from '../EchooSystem/EchoSignal';
import batch2Service from '../../services/batch2Service';
import './CreatorPhase9.css';
import './CreatorBatch2.css';

const CATEGORIES = [
  'Faith & Spirituality', 'Education', 'News & Politics', 'Business',
  'Health & Wellness', 'Entertainment', 'Technology', 'Sports',
  'Music', 'Comedy', 'Storytelling', 'Other',
];

const EMPTY_FORM = {
  name: '', category: 'Other', description: '', tags: '', coverArt: '', isPublic: true,
};

const CreatorStationsWorkspace = ({ studioName = 'Creator', onNavigate }) => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  useEffect(() => { loadStations(); }, [loadStations]);

  const sorted = useMemo(
    () => [...stations].sort(
      (first, second) => new Date(second.updatedAt || second.createdAt || 0) - new Date(first.updatedAt || first.createdAt || 0)
    ),
    [stations]
  );

  const liveStation = stations.find((station) => station.isLive) || null;
  const anyLive = Boolean(liveStation);

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setEditingId('');
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setMessage('');
    setError('');
    setEditingId('');
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (station) => {
    setMessage('');
    setError('');
    setEditingId(station.id);
    setForm({
      name: station.name || '',
      category: CATEGORIES.includes(station.category) ? station.category : 'Other',
      description: station.description || '',
      tags: Array.isArray(station.tags) ? station.tags.join(', ') : '',
      coverArt: station.coverArt || '',
      isPublic: station.isPublic !== false,
    });
    setFormOpen(true);
  };

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submitStation = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || saving) return;

    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim(),
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      coverArt: form.coverArt.trim() || null,
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
        if (exists) return current.map((station) => String(station.id) === String(response.data.id) ? response.data : station);
        return [response.data, ...current];
      });

      setMessage(editingId ? 'Station updated.' : 'Station created. You can start a broadcast from it now.');
      setFormOpen(false);
      setEditingId('');
      setForm(EMPTY_FORM);
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
      await batch2Service.deleteStation(station.id);
      setStations((current) => current.filter((item) => String(item.id) !== String(station.id)));
      setMessage('Station deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete the station.');
    } finally {
      setDeletingId('');
    }
  };

  const openBroadcast = (station, mode) => {
    sessionStorage.setItem('echooSelectedStationId', String(station.id));
    sessionStorage.setItem('echooBroadcastMode', mode);
    onNavigate?.('Broadcast');
  };

  return (
    <section className="creator-b2-page">
      <header className="creator-b2-header">
        <div>
          <span className="creator-b2-kicker">STATIONS</span>
          <h1>Your stations.</h1>
          <p>A station is the home for your broadcasts. Create it once, then choose it whenever you go live or schedule for later.</p>
        </div>
        <EchoSignal size="lg" state={anyLive ? 'live' : 'idle'} activeNodes={anyLive ? 3 : 0}><FaBroadcastTower /></EchoSignal>
      </header>

      <div className="creator-b2-toolbar">
        <div><strong>{stations.length} {stations.length === 1 ? 'station' : 'stations'}</strong><span>{studioName}</span></div>
        <button type="button" className="creator-b2-primary" onClick={openCreate}><FaPlus /> New station</button>
      </div>

      {anyLive && (
        <div className="creator-b2-message success">
          {liveStation.name} is live. Other stations can still be scheduled, but this creator account can only host one live broadcast at a time.
        </div>
      )}
      {message && <div className="creator-b2-message success">{message}</div>}
      {error && <div className="creator-b2-message error">{error}</div>}

      {formOpen && (
        <form className="creator-b2-form" onSubmit={submitStation}>
          <div className="creator-b2-form-heading"><div><h2>{editingId ? 'Edit station' : 'New station'}</h2><p>{editingId ? 'Update this station.' : 'Create the home your broadcasts will belong to.'}</p></div></div>
          <div className="creator-b2-form-grid">
            <label>Station name<input value={form.name} maxLength={100} placeholder="e.g. Layers of Truth" onChange={(event) => updateField('name', event.target.value)} required /></label>
            <label>Category<select value={form.category} onChange={(event) => updateField('category', event.target.value)}>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="creator-b2-wide">Description<textarea value={form.description} maxLength={2000} placeholder="What is this station about?" onChange={(event) => updateField('description', event.target.value)} /></label>
            <label className="creator-b2-wide">Cover image URL<input value={form.coverArt} placeholder="Optional HTTPS image URL" onChange={(event) => updateField('coverArt', event.target.value)} /></label>
            <label className="creator-b2-wide">Tags<input value={form.tags} placeholder="faith, teaching, inspiration" onChange={(event) => updateField('tags', event.target.value)} /><small>Separate tags with commas.</small></label>
            <label className="creator-b2-wide"><input type="checkbox" checked={form.isPublic} onChange={(event) => updateField('isPublic', event.target.checked)} />Public station</label>
          </div>
          <div className="creator-b2-form-actions"><button type="button" onClick={closeForm} disabled={saving}>Cancel</button><button type="submit" className="creator-b2-primary" disabled={saving || !form.name.trim()}><FaSave /> {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create station'}</button></div>
        </form>
      )}

      {loading ? (
        <div className="creator-b2-state"><EchoSignal size="md" state="active" activeNodes={2} /><strong>Loading stations...</strong></div>
      ) : sorted.length === 0 ? (
        <div className="creator-b2-state"><FaBroadcastTower /><strong>No stations yet</strong><p>Create your first station with the New station button above.</p></div>
      ) : (
        <div className="creator-b2-grid">
          {sorted.map((station) => {
            const liveHere = Boolean(station.isLive);
            const blockedByOtherLive = anyLive && !liveHere;
            return (
              <article className="creator-b2-card" key={station.id}>
                <div className="creator-b2-art">
                  {station.coverArt ? <img src={station.coverArt} alt="" /> : <FaBroadcastTower />}
                  {liveHere && <span className="creator-b2-live">LIVE</span>}
                </div>
                <div className="creator-b2-card-body">
                  <span className="creator-b2-card-label">{station.category || 'Other'}</span>
                  <h2>{station.name}</h2>
                  <p>{station.description || 'No description yet.'}</p>
                  <div className="creator-b2-card-stats"><span>{Number(station.followerCount || 0).toLocaleString()} followers</span><span>·</span><span>{Number(station.listenerCount || 0).toLocaleString()} listening</span></div>
                  <div className="creator-b2-card-actions">
                    <button
                      type="button"
                      disabled={blockedByOtherLive}
                      title={blockedByOtherLive ? `End the live broadcast on ${liveStation.name} before starting another.` : ''}
                      onClick={() => openBroadcast(station, 'now')}
                    >
                      <FaMicrophone /> {liveHere ? 'Open studio' : 'Start broadcast'}
                    </button>
                    <button type="button" onClick={() => openBroadcast(station, 'later')}><FaCalendarAlt /> Schedule</button>
                    <button type="button" onClick={() => openEdit(station)}><FaEdit /> Edit</button>
                    <button type="button" className="danger" disabled={deletingId === String(station.id) || liveHere} onClick={() => removeStation(station)} title={liveHere ? 'End the live broadcast before deleting this station.' : 'Delete station'}><FaTrash /> {deletingId === String(station.id) ? 'Deleting...' : 'Delete'}</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default CreatorStationsWorkspace;
