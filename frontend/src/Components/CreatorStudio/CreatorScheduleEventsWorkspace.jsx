import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiCalendar,
  FiChevronDown,
  FiClock,
  FiEdit2,
  FiImage,
  FiMoreVertical,
  FiPlusCircle,
  FiRadio,
  FiSearch,
  FiTrash2,
  FiX,
} from 'react-icons/fi';

import batch2Service from '../../services/batch2Service';
import { useCreatorStudioState } from './CreatorStudioState';
import './CreatorScheduleEventsWorkspace.css';

const PAGE_SIZE = 5;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const emptyForm = () => ({
  title: '',
  description: '',
  date: '',
  time: '',
  tags: '',
  artwork: '',
  artworkFile: null,
  artworkChanged: false,
});

const localDate = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const localTime = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
};

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

const eventState = (broadcast) => {
  const status = String(broadcast?.status || '').toLowerCase();
  if (['starting', 'live', 'ending'].includes(status)) return 'live';
  if (status === 'scheduled' && new Date(broadcast?.startTime || 0) >= new Date()) return 'upcoming';
  return 'past';
};

const statusLabel = (broadcast) => {
  const state = eventState(broadcast);
  if (state === 'live') return 'Live now';
  if (state === 'upcoming') return 'Upcoming';
  const status = String(broadcast?.status || '').toLowerCase();
  return status === 'cancelled' ? 'Cancelled' : status === 'failed' ? 'Failed' : 'Past';
};

const stationFor = (broadcast, stations) => {
  const embedded = broadcast?.station && typeof broadcast.station === 'object' ? broadcast.station : null;
  return embedded || stations.find((station) => String(station.id) === String(broadcast?.stationId)) || null;
};

const artworkFor = (broadcast, station) =>
  broadcast?.eventArtwork || broadcast?.coverArt || broadcast?.artwork || station?.brandCover || station?.coverArt || station?.artwork || '';

export default function CreatorScheduleEventsWorkspace({ onNavigate }) {
  const { ownedStations, broadcasts: stateBroadcasts, refresh, notifyChanged } = useCreatorStudioState();
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const station = ownedStations[0] || null;

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const response = await batch2Service.getCreatorBroadcasts();
      setBroadcasts(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load scheduled events.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!loading && Array.isArray(stateBroadcasts)) setBroadcasts(stateBroadcasts);
  }, [loading, stateBroadcasts]);
  useEffect(() => { setPage(1); }, [tab, query, sort]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return broadcasts
      .filter((broadcast) => eventState(broadcast) === tab)
      .filter((broadcast) => {
        if (!normalizedQuery) return true;
        const eventStation = stationFor(broadcast, ownedStations);
        return [broadcast.title, broadcast.description, broadcast.tags?.join(' '), eventStation?.name, broadcast.stationName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      })
      .sort((first, second) => {
        const firstTime = new Date(first.startTime || 0).getTime();
        const secondTime = new Date(second.startTime || 0).getTime();
        return sort === 'oldest' ? firstTime - secondTime : secondTime - firstTime;
      });
  }, [broadcasts, ownedStations, query, sort, tab]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => {
    setError('');
    setNotice('');
    setForm(emptyForm());
    setModal({ kind: 'create' });
  };

  const openEdit = (broadcast) => {
    setOpenMenu('');
    setError('');
    setForm({
      title: broadcast.title || '',
      description: broadcast.description || '',
      date: formDate(broadcast.startTime),
      time: formTime(broadcast.startTime),
      tags: Array.isArray(broadcast.tags) ? broadcast.tags.join(', ') : '',
      artwork: broadcast.eventArtwork || broadcast.coverArt || '',
      artworkFile: null,
      artworkChanged: false,
    });
    setModal({ kind: 'edit', broadcast });
  };

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const onArtwork = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Event artwork must be a JPG, PNG, or WebP image no larger than 2 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateForm('artwork', typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
    setForm((current) => ({ ...current, artworkFile: file, artworkChanged: true }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!station?.id && modal?.kind === 'create') {
      setError('Create a station before scheduling an event.');
      return;
    }
    const start = new Date(`${form.date}T${form.time}`);
    if (!form.title.trim() || !form.date || !form.time || Number.isNaN(start.getTime())) {
      setError('Add an event title, date, and start time.');
      return;
    }
    if (modal?.kind === 'create' && start <= new Date()) {
      setError('Choose a future start time for a new event.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      startTime: start.toISOString(),
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    };
    if (modal?.kind === 'create') {
      payload.stationId = station.id;
      payload.type = 'live';
      payload.isPublic = true;
      if (form.artwork) payload.coverArt = form.artwork;
    } else if (form.artworkChanged) {
      payload.coverArt = form.artwork || null;
    }

    try {
      setSaving(true);
      setError('');
      const response = modal?.kind === 'edit'
        ? await batch2Service.updateBroadcast(modal.broadcast.id, payload)
        : await batch2Service.createBroadcast(payload);
      const saved = response?.data;
      if (!saved?.id) throw new Error('Echoo did not return the saved event.');
      setBroadcasts((current) => modal?.kind === 'edit'
        ? current.map((item) => String(item.id) === String(saved.id) ? saved : item)
        : [saved, ...current]);
      setModal(null);
      setNotice(modal?.kind === 'edit' ? 'Event updated.' : 'Event scheduled.');
      notifyChanged();
      refresh({ silent: true }).catch(() => {});
    } catch (saveError) {
      setError(saveError?.message || 'Could not save this event.');
    } finally {
      setSaving(false);
    }
  };

  const cancelEvent = async (broadcast) => {
    setOpenMenu('');
    try {
      setError('');
      const response = await batch2Service.cancelBroadcast(broadcast.id);
      const saved = response?.data;
      setBroadcasts((current) => current.map((item) => String(item.id) === String(broadcast.id) ? (saved || { ...item, status: 'cancelled' }) : item));
      setNotice('Event cancelled.');
      notifyChanged();
    } catch (cancelError) {
      setError(cancelError?.message || 'Could not cancel this event.');
    }
  };

  const deleteEvent = async (broadcast) => {
    setOpenMenu('');
    if (!window.confirm(`Delete “${broadcast.title || 'this event'}”?`)) return;
    try {
      setError('');
      await batch2Service.deleteBroadcast(broadcast.id);
      setBroadcasts((current) => current.filter((item) => String(item.id) !== String(broadcast.id)));
      setNotice('Event deleted.');
      notifyChanged();
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete this event.');
    }
  };

  return (
    <section className="schedule-events" aria-labelledby="schedule-events-title">
      <header className="schedule-events-header">
        <div>
          <h1 id="schedule-events-title">Schedule Events</h1>
          <p>Plan your broadcasts ahead of time.<br />Your audience will be notified before you go live.</p>
        </div>
        <button type="button" className="schedule-primary" onClick={openCreate}><FiPlusCircle /> Schedule new event</button>
      </header>

      {error && <div className="schedule-alert error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss"><FiX /></button></div>}
      {notice && <div className="schedule-alert success" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><FiX /></button></div>}

      <div className="schedule-controls">
        <div className="schedule-tabs" role="tablist" aria-label="Event status">
          {[['upcoming', 'Upcoming'], ['live', 'Live now'], ['past', 'Past events']].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>
        <div className="schedule-tools">
          <label className="schedule-search"><FiSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events..." aria-label="Search events" /></label>
          <label className="schedule-sort">Sort <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort events"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><FiChevronDown /></label>
        </div>
      </div>

      <section className="schedule-table-wrap" aria-live="polite">
        <div className="schedule-table schedule-head" aria-hidden="true"><span>EVENT</span><span>STATION</span><span>DATE &amp; TIME</span><span>STATUS</span><span>ACTIONS</span></div>
        {loading ? <div className="schedule-empty">Loading your events…</div> : visibleRows.length ? visibleRows.map((broadcast) => {
          const eventStation = stationFor(broadcast, ownedStations);
          const art = artworkFor(broadcast, eventStation);
          const state = eventState(broadcast);
          const editable = state === 'upcoming';
          return (
            <article className="schedule-table schedule-row" key={broadcast.id}>
              <div className="schedule-event-cell">
                <div className="schedule-event-art">{art ? <img src={art} alt="" /> : <FiRadio aria-hidden="true" />}<span><FiCalendar />{new Date(broadcast.startTime || 0).getDate() || '—'}<small>{new Date(broadcast.startTime || 0).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small></span></div>
                <div><strong>{broadcast.title || 'Untitled event'}</strong><p>{broadcast.description || 'No description added.'}</p>{Array.isArray(broadcast.tags) && broadcast.tags.length > 0 && <small>{broadcast.tags.slice(0, 3).join(' · ')}</small>}</div>
              </div>
              <div className="schedule-station-cell">{eventStation?.brandCover || eventStation?.coverArt ? <img src={eventStation.brandCover || eventStation.coverArt} alt="" /> : <FiRadio />}<span>{eventStation?.name || broadcast.stationName || 'Echoo Station'}</span></div>
              <div className="schedule-date-cell"><span><FiCalendar /> {localDate(broadcast.startTime)}</span><span><FiClock /> {localTime(broadcast.startTime)} ({timezone})</span></div>
              <div><span className={`schedule-status ${state}`}>{statusLabel(broadcast)}</span></div>
              <div className="schedule-actions">
                {editable && <button type="button" onClick={() => openEdit(broadcast)} aria-label={`Edit ${broadcast.title}`}><FiEdit2 /></button>}
                {state === 'live' && <button type="button" onClick={() => onNavigate?.('Broadcast')} aria-label="Open Broadcast Studio"><FiRadio /></button>}
                <div className="schedule-menu-wrap"><button type="button" onClick={() => setOpenMenu((value) => value === broadcast.id ? '' : broadcast.id)} aria-label={`More actions for ${broadcast.title}`} aria-expanded={openMenu === broadcast.id}><FiMoreVertical /></button>{openMenu === broadcast.id && <div className="schedule-menu">{editable && <button type="button" onClick={() => cancelEvent(broadcast)}>Cancel event</button>}{state !== 'live' && <button type="button" className="danger" onClick={() => deleteEvent(broadcast)}><FiTrash2 /> Delete</button>}</div>}</div>
              </div>
            </article>
          );
        }) : <div className="schedule-empty">{query ? 'No events match your search.' : tab === 'upcoming' ? 'No upcoming events. Schedule your next broadcast when you are ready.' : `No ${tab === 'live' ? 'live' : 'past'} events yet.`}</div>}
        {rows.length > PAGE_SIZE && <footer className="schedule-pagination"><span>Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, rows.length)} of {rows.length} events</span><div><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</button>{Array.from({ length: pageCount }, (_, index) => <button type="button" className={page === index + 1 ? 'active' : ''} key={index} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount}>Next</button></div></footer>}
      </section>

      {modal && <div className="schedule-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}><form className="schedule-modal" onSubmit={save} aria-labelledby="schedule-modal-title"><header><div><h2 id="schedule-modal-title">{modal.kind === 'edit' ? 'Edit event' : 'Schedule new event'}</h2><p>{station?.name ? `This event will be scheduled on ${station.name}.` : 'Create a station first to schedule an event.'}</p></div><button type="button" onClick={() => setModal(null)} disabled={saving} aria-label="Close"><FiX /></button></header><div className="schedule-form-grid"><label>Event title<input value={form.title} onChange={(event) => updateForm('title', event.target.value)} maxLength="200" required autoFocus /></label><label>Event artwork <span className="optional">Optional</span><span className="schedule-artwork-picker">{form.artwork ? <img src={form.artwork} alt="Event artwork preview" /> : <FiImage />}<span>{form.artworkFile?.name || 'Choose JPG, PNG, or WebP'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={onArtwork} /></span>{form.artwork && <button type="button" className="schedule-clear-art" onClick={() => setForm((current) => ({ ...current, artwork: '', artworkFile: null, artworkChanged: true }))}>Remove artwork</button>}</label><label className="full">Description<textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} maxLength="2000" placeholder="Tell listeners what to expect" /></label><label>Date<input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} required /></label><label>Start time<input type="time" value={form.time} onChange={(event) => updateForm('time', event.target.value)} required /></label><label className="full">Tags <span className="optional">Optional</span><input value={form.tags} onChange={(event) => updateForm('tags', event.target.value)} placeholder="Talk, Teach, Transform" /></label><p className="schedule-timezone full"><FiClock /> Times are saved in your current timezone: <strong>{timezone}</strong>. Your event will continue until you end the broadcast.</p></div><footer><button type="button" onClick={() => setModal(null)} disabled={saving}>Cancel</button><button type="submit" className="schedule-primary" disabled={saving || (modal.kind === 'create' && !station?.id)}>{saving ? 'Saving…' : modal.kind === 'edit' ? 'Save changes' : 'Schedule event'}</button></footer></form></div>}
    </section>
  );
}
