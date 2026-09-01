import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiArrowLeft,
  FiCalendar,
  FiClock,
  FiImage,
  FiSave,
  FiTrash2,
  FiXCircle,
} from 'react-icons/fi';

import batch2Service from '../../services/batch2Service';
import './CreatorBroadcastSettingsWorkspace.css';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const idOf = (value) => String(value?.id || value?._id || value || '');

const formDate = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const formTime = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const emptyForm = () => ({
  title: '',
  description: '',
  date: '',
  time: '',
  artwork: '',
  artworkChanged: false,
  isPublic: true,
});

export default function CreatorBroadcastSettingsWorkspace({ onNavigate }) {
  const [broadcast, setBroadcast] = useState(null);
  const [channels, setChannels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const selectedId = sessionStorage.getItem('echooEditBroadcastId') || '';

  const load = useCallback(async () => {
    if (!selectedId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const [broadcastResult, channelResult] = await Promise.all([
        batch2Service.getCreatorBroadcasts(),
        batch2Service.getMyStations(),
      ]);
      const allBroadcasts = Array.isArray(broadcastResult?.data) ? broadcastResult.data : [];
      const nextChannels = Array.isArray(channelResult?.data) ? channelResult.data : [];
      const selected = allBroadcasts.find((item) => idOf(item) === String(selectedId)) || null;
      setChannels(nextChannels);
      setBroadcast(selected);

      if (!selected) {
        setError('That broadcast could not be found.');
        return;
      }

      setForm({
        title: selected.title || '',
        description: selected.description || '',
        date: formDate(selected.startTime),
        time: formTime(selected.startTime),
        artwork: selected.eventArtwork || selected.coverArt || '',
        artworkChanged: false,
        isPublic: selected.isPublic !== false,
      });
    } catch (loadError) {
      setError(loadError?.message || 'Could not load broadcast settings.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const channel = useMemo(() => channels[0] || null, [channels]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const onArtwork = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setError('Broadcast artwork must be JPG, PNG or WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Broadcast artwork must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      update('artwork', typeof reader.result === 'string' ? reader.result : '');
      setForm((current) => ({ ...current, artworkChanged: true }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!broadcast?.id || busy) return;
    const start = new Date(`${form.date}T${form.time}`);
    if (!form.title.trim() || !form.date || !form.time || Number.isNaN(start.getTime())) {
      setError('Add a broadcast title, date and start time.');
      return;
    }

    try {
      setBusy('save');
      setError('');
      setMessage('');
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        startTime: start.toISOString(),
        isPublic: form.isPublic,
      };
      if (form.artworkChanged) payload.coverArt = form.artwork || null;

      const response = await batch2Service.updateBroadcast(broadcast.id, payload);
      if (!response?.data?.id) throw new Error('Echoo did not return the updated broadcast.');
      setBroadcast(response.data);
      setForm((current) => ({ ...current, artworkChanged: false }));
      setMessage('Broadcast settings saved.');
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
    } catch (saveError) {
      setError(saveError?.message || 'Could not save broadcast settings.');
    } finally {
      setBusy('');
    }
  };

  const cancelBroadcast = async () => {
    if (!broadcast?.id || busy) return;
    if (!window.confirm(`Cancel “${broadcast.title || 'this broadcast'}”?`)) return;
    try {
      setBusy('cancel');
      setError('');
      await batch2Service.cancelBroadcast(broadcast.id);
      sessionStorage.removeItem('echooEditBroadcastId');
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      onNavigate?.('Schedule');
    } catch (cancelError) {
      setError(cancelError?.message || 'Could not cancel this broadcast.');
      setBusy('');
    }
  };

  const deleteBroadcast = async () => {
    if (!broadcast?.id || busy) return;
    if (!window.confirm(`Delete “${broadcast.title || 'this broadcast'}”? This cannot be undone.`)) return;
    try {
      setBusy('delete');
      setError('');
      await batch2Service.deleteBroadcast(broadcast.id);
      sessionStorage.removeItem('echooEditBroadcastId');
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      onNavigate?.('Schedule');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete this broadcast.');
      setBusy('');
    }
  };

  if (loading) return <div className="broadcast-settings-loading">Loading broadcast settings…</div>;

  if (!selectedId || !broadcast) {
    return (
      <section className="broadcast-settings-empty">
        <FiCalendar />
        <h1>Broadcast settings</h1>
        <p>{error || 'Choose an upcoming broadcast from Schedule Events to edit it.'}</p>
        <button type="button" onClick={() => onNavigate?.('Schedule')}><FiArrowLeft /> Back to Schedule Events</button>
      </section>
    );
  }

  const status = String(broadcast.status || '').toLowerCase();
  const editable = status === 'scheduled' || status === 'draft' || status === 'failed';
  const artwork = form.artwork || channel?.brandCover || channel?.coverArt || channel?.logo || '';

  return (
    <section className="broadcast-settings-page">
      <button type="button" className="broadcast-settings-back" onClick={() => onNavigate?.('Schedule')}>
        <FiArrowLeft /> Schedule Events
      </button>

      <header className="broadcast-settings-heading">
        <div>
          <span>BROADCAST SETTINGS</span>
          <h1>{broadcast.title || 'Scheduled broadcast'}</h1>
          <p>Update the details listeners will see before this broadcast goes live.</p>
        </div>
        <span className={`broadcast-settings-status ${status}`}>{status === 'scheduled' ? 'Upcoming' : status}</span>
      </header>

      {message && <div className="broadcast-settings-alert success">{message}</div>}
      {error && <div className="broadcast-settings-alert error">{error}</div>}

      <form className="broadcast-settings-form" onSubmit={save}>
        <aside className="broadcast-settings-artwork-column">
          <div className="broadcast-settings-artwork">
            {artwork ? <img src={artwork} alt="Broadcast artwork preview" /> : <FiImage />}
          </div>
          <label className="broadcast-settings-artwork-button">
            <FiImage /> Change artwork
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onArtwork} disabled={!editable || Boolean(busy)} />
          </label>
          {form.artwork && editable && (
            <button type="button" className="broadcast-settings-remove-art" onClick={() => setForm((current) => ({ ...current, artwork: '', artworkChanged: true }))}>
              Remove broadcast artwork
            </button>
          )}
          {channel?.name && <p>Channel: <strong>{channel.name}</strong></p>}
        </aside>

        <div className="broadcast-settings-fields">
          <label>
            <span>Broadcast title</span>
            <input value={form.title} onChange={(event) => update('title', event.target.value)} maxLength="200" required disabled={!editable} />
          </label>

          <label>
            <span>Description</span>
            <textarea value={form.description} onChange={(event) => update('description', event.target.value)} maxLength="2000" disabled={!editable} />
          </label>

          <div className="broadcast-settings-row">
            <label>
              <span><FiCalendar /> Date</span>
              <input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} required disabled={!editable} />
            </label>
            <label>
              <span><FiClock /> Start time</span>
              <input type="time" value={form.time} onChange={(event) => update('time', event.target.value)} required disabled={!editable} />
            </label>
          </div>

          <div className="broadcast-settings-row">
            <label>
              <span>Timezone</span>
              <input value={timezone} readOnly aria-readonly="true" />
            </label>
            <label>
              <span>Visibility</span>
              <select value={form.isPublic ? 'public' : 'private'} onChange={(event) => update('isPublic', event.target.value === 'public')} disabled={!editable}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>
          </div>

          {editable && (
            <button type="submit" className="broadcast-settings-save" disabled={Boolean(busy)}>
              <FiSave /> {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </form>

      {editable && (
        <section className="broadcast-settings-danger">
          <div>
            <h2>Broadcast actions</h2>
            <p>Cancel the scheduled broadcast or permanently delete it.</p>
          </div>
          <div>
            <button type="button" onClick={cancelBroadcast} disabled={Boolean(busy)}><FiXCircle /> {busy === 'cancel' ? 'Cancelling…' : 'Cancel broadcast'}</button>
            <button type="button" className="danger" onClick={deleteBroadcast} disabled={Boolean(busy)}><FiTrash2 /> {busy === 'delete' ? 'Deleting…' : 'Delete broadcast'}</button>
          </div>
        </section>
      )}
    </section>
  );
}
