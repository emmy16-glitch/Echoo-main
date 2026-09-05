import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FiBarChart2,
  FiCalendar,
  FiChevronDown,
  FiClock,
  FiEdit2,
  FiExternalLink,
  FiHeadphones,
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
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

const emptyForm = () => ({
  title: '',
  description: '',
  date: '',
  time: '',
  artwork: '',
});

const localDate = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const localTime = (value) => {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
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
  return status === 'cancelled' ? 'Cancelled' : status === 'failed' ? 'Failed' : 'Completed';
};

const channelFor = (_broadcast, channels) => channels[0] || null;

const artworkFor = (broadcast, channel) =>
  broadcast?.eventArtwork ||
  broadcast?.coverArt ||
  broadcast?.artwork ||
  channel?.brandCover ||
  channel?.coverArt ||
  channel?.artwork ||
  channel?.logo ||
  '';

const recordingIdFor = (broadcast) => (
  broadcast?.replayAudio?.id ||
  broadcast?.replayAudio?._id ||
  broadcast?.recording?.id ||
  broadcast?.recording?._id ||
  broadcast?.audioId ||
  ''
);

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
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState('');
  const createButtonRef = useRef(null);
  const modalRef = useRef(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const channel = ownedStations[0] || null;

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      const response = await batch2Service.getCreatorBroadcasts();
      setBroadcasts(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load scheduled broadcasts.');
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
    const needle = query.trim().toLowerCase();
    return broadcasts
      .filter((broadcast) => eventState(broadcast) === tab)
      .filter((broadcast) => {
        if (!needle) return true;
        const eventChannel = channelFor(broadcast, ownedStations);
        return [broadcast.title, broadcast.description, eventChannel?.name, broadcast.stationName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
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
    setModalOpen(true);
  };

  const closeCreate = useCallback(() => {
    if (saving) return;
    setModalOpen(false);
    window.requestAnimationFrame(() => createButtonRef.current?.focus());
  }, [saving]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const onEscape = (event) => {
      if (event.key !== 'Escape' || saving) return;
      event.preventDefault();
      closeCreate();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [closeCreate, modalOpen, saving]);

  const trapModalFocus = (event) => {
    if (event.key !== 'Tab') return;
    const items = [...(modalRef.current?.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ) || [])].filter((item) => item.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openBroadcastSettings = (broadcast) => {
    setOpenMenu('');
    if (!broadcast?.id) return;
    sessionStorage.setItem('echooEditBroadcastId', String(broadcast.id));
    onNavigate?.('BroadcastSettings');
  };

  const openCreatorBroadcast = (broadcast) => {
    setOpenMenu('');
    if (broadcast?.id) {
      sessionStorage.setItem('echooPreparedBroadcastId', String(broadcast.id));
    }
    onNavigate?.('Broadcast');
  };

  const viewAsListener = (broadcast) => {
    setOpenMenu('');
    if (!broadcast?.id) return;
    window.open(
      `/listen/live/${encodeURIComponent(broadcast.id)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const openCompletedBroadcast = (broadcast) => {
    setOpenMenu('');
    const recordingId = recordingIdFor(broadcast);
    if (recordingId) {
      window.location.assign(`/creator-studio/recordings/${encodeURIComponent(recordingId)}`);
      return;
    }
    onNavigate?.('Analytics');
  };

  const openEvent = (broadcast) => {
    const state = eventState(broadcast);
    if (state === 'upcoming') return openBroadcastSettings(broadcast);
    if (state === 'live') return openCreatorBroadcast(broadcast);
    return openCompletedBroadcast(broadcast);
  };

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const onArtwork = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setError('Event artwork must be JPG, PNG or WebP.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Event artwork must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateForm('artwork', typeof reader.result === 'string' ? reader.result : '');
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!channel?.id) {
      setError('Set up your Channel before scheduling a broadcast.');
      return;
    }

    const start = new Date(`${form.date}T${form.time}`);
    if (!form.title.trim() || !form.date || !form.time || Number.isNaN(start.getTime())) {
      setError('Add a broadcast title, date and start time.');
      return;
    }
    if (start <= new Date()) {
      setError('Choose a future start time.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        startTime: start.toISOString(),
        stationId: channel.id,
        type: 'live',
        isPublic: true,
      };
      if (form.artwork) payload.coverArt = form.artwork;

      const response = await batch2Service.createBroadcast(payload);
      const saved = response?.data;
      if (!saved?.id) throw new Error('Echoo did not return the scheduled broadcast.');

      setBroadcasts((current) => [saved, ...current]);
      setModalOpen(false);
      setForm(emptyForm());
      setNotice('Broadcast scheduled.');
      window.requestAnimationFrame(() => createButtonRef.current?.focus());
      notifyChanged();
      refresh({ silent: true }).catch(() => {});
    } catch (saveError) {
      setError(saveError?.message || 'Could not schedule this broadcast.');
    } finally {
      setSaving(false);
    }
  };

  const cancelEvent = async (broadcast) => {
    setOpenMenu('');
    if (!window.confirm(`Cancel “${broadcast.title || 'this broadcast'}”?`)) return;
    try {
      setError('');
      const response = await batch2Service.cancelBroadcast(broadcast.id);
      const saved = response?.data;
      setBroadcasts((current) => current.map((item) =>
        String(item.id) === String(broadcast.id) ? (saved || { ...item, status: 'cancelled' }) : item
      ));
      setNotice('Broadcast cancelled.');
      notifyChanged();
    } catch (cancelError) {
      setError(cancelError?.message || 'Could not cancel this broadcast.');
    }
  };

  const deleteEvent = async (broadcast) => {
    setOpenMenu('');
    if (!window.confirm(`Delete “${broadcast.title || 'this broadcast'}”?`)) return;
    try {
      setError('');
      await batch2Service.deleteBroadcast(broadcast.id);
      setBroadcasts((current) => current.filter((item) => String(item.id) !== String(broadcast.id)));
      setNotice('Broadcast deleted.');
      notifyChanged();
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete this broadcast.');
    }
  };

  const channelArtwork = channel?.brandCover || channel?.coverArt || channel?.artwork || channel?.logo || '';

  return (
    <section className="schedule-events" aria-labelledby="schedule-events-title">
      <header className="schedule-events-header">
        <div>
          <h1 id="schedule-events-title">Schedule Events</h1>
          <p>Plan upcoming broadcasts for your Channel.</p>
        </div>
        <button ref={createButtonRef} type="button" className="schedule-primary" onClick={openCreate}>
          <FiPlusCircle /> Schedule event
        </button>
      </header>

      {error && <div className="schedule-alert error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss"><FiX /></button></div>}
      {notice && <div className="schedule-alert success" role="status">{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><FiX /></button></div>}

      <div className="schedule-controls">
        <div className="schedule-tabs" role="tablist" aria-label="Broadcast status">
          {[
            ['upcoming', 'Upcoming'],
            ['live', 'Live now'],
            ['past', 'Completed'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? 'active' : ''}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="schedule-tools">
          <label className="schedule-search">
            <FiSearch />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search broadcasts" aria-label="Search broadcasts" />
          </label>
          <label className="schedule-sort">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort broadcasts">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <FiChevronDown />
          </label>
        </div>
      </div>

      <section className="schedule-table-wrap" aria-live="polite">
        <div className="schedule-table schedule-head" aria-hidden="true">
          <span>BROADCAST</span><span>CHANNEL</span><span>DATE &amp; TIME</span><span>STATUS</span><span>ACTIONS</span>
        </div>

        {loading ? (
          <div className="schedule-empty">Loading broadcasts…</div>
        ) : visibleRows.length ? visibleRows.map((broadcast) => {
          const eventChannel = channelFor(broadcast, ownedStations);
          const art = artworkFor(broadcast, eventChannel);
          const state = eventState(broadcast);
          const editable = state === 'upcoming';
          const recordingId = recordingIdFor(broadcast);

          return (
            <article className="schedule-table schedule-row" key={broadcast.id}>
              <button type="button" className="schedule-event-cell" onClick={() => openEvent(broadcast)}>
                <div className="schedule-event-art">
                  {art ? <img src={art} alt="" /> : <FiRadio aria-hidden="true" />}
                  <span>
                    <FiCalendar />
                    {new Date(broadcast.startTime || 0).getDate() || '—'}
                    <small>{new Date(broadcast.startTime || 0).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small>
                  </span>
                </div>
                <div>
                  <strong>{broadcast.title || 'Untitled broadcast'}</strong>
                  <p>{broadcast.description || 'No description added.'}</p>
                </div>
              </button>

              <div className="schedule-channel-cell">
                {eventChannel?.brandCover || eventChannel?.coverArt
                  ? <img src={eventChannel.brandCover || eventChannel.coverArt} alt="" />
                  : <FiRadio />}
                <span>{eventChannel?.name || broadcast.stationName || 'Echoo Channel'}</span>
              </div>

              <div className="schedule-date-cell">
                <span><FiCalendar /> {localDate(broadcast.startTime)}</span>
                <span><FiClock /> {localTime(broadcast.startTime)} ({timezone})</span>
              </div>

              <div><span className={`schedule-status ${state}`}>{statusLabel(broadcast)}</span></div>

              <div className="schedule-actions">
                {editable && (
                  <button type="button" onClick={() => openBroadcastSettings(broadcast)} aria-label={`Edit ${broadcast.title}`} title="Edit schedule">
                    <FiEdit2 />
                  </button>
                )}
                {state === 'live' && (
                  <button type="button" onClick={() => openCreatorBroadcast(broadcast)} aria-label="Open Broadcast Studio" title="Manage broadcast">
                    <FiRadio />
                  </button>
                )}
                {state === 'past' && (
                  <button
                    type="button"
                    onClick={() => openCompletedBroadcast(broadcast)}
                    aria-label={recordingId ? 'Open recording' : 'Open analytics'}
                    title={recordingId ? 'Open recording' : 'Open analytics'}
                  >
                    {recordingId ? <FiHeadphones /> : <FiBarChart2 />}
                  </button>
                )}
                <div className="schedule-menu-wrap">
                  <button
                    type="button"
                    onClick={() => setOpenMenu((value) => String(value) === String(broadcast.id) ? '' : broadcast.id)}
                    aria-label={`More actions for ${broadcast.title}`}
                    aria-expanded={String(openMenu) === String(broadcast.id)}
                  >
                    <FiMoreVertical />
                  </button>
                  {String(openMenu) === String(broadcast.id) && (
                    <div className="schedule-menu">
                      {state === 'live' && (
                        <button type="button" onClick={() => viewAsListener(broadcast)}>
                          <FiExternalLink /> View as Listener
                        </button>
                      )}
                      {state === 'past' && (
                        <button type="button" onClick={() => openCompletedBroadcast(broadcast)}>
                          {recordingId ? <><FiHeadphones /> Open recording</> : <><FiBarChart2 /> View analytics</>}
                        </button>
                      )}
                      {editable && <button type="button" onClick={() => cancelEvent(broadcast)}>Cancel broadcast</button>}
                      {state !== 'live' && (
                        <button type="button" className="danger" onClick={() => deleteEvent(broadcast)}><FiTrash2 /> Delete</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="schedule-empty">
            {query
              ? 'No broadcasts match your search.'
              : tab === 'upcoming'
                ? 'No upcoming broadcasts. Schedule one when you have something to air.'
                : tab === 'live'
                  ? 'Nothing is live right now.'
                  : 'No completed broadcasts yet.'}
          </div>
        )}

        {rows.length > PAGE_SIZE && (
          <footer className="schedule-pagination">
            <span>Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}</span>
            <div>
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>Previous</button>
              {Array.from({ length: pageCount }, (_, index) => (
                <button type="button" className={page === index + 1 ? 'active' : ''} key={index} onClick={() => setPage(index + 1)}>{index + 1}</button>
              ))}
              <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount}>Next</button>
            </div>
          </footer>
        )}
      </section>

      {modalOpen && createPortal((
        <div className="schedule-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreate(); }}>
          <form
            ref={modalRef}
            className="schedule-modal"
            onSubmit={save}
            onKeyDown={trapModalFocus}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-modal-title"
          >
            <header className="schedule-modal-header">
              <h2 id="schedule-modal-title">Schedule event</h2>
              <button type="button" onClick={closeCreate} disabled={saving} aria-label="Close"><FiX /></button>
            </header>

            <div className="schedule-modal-body">
              <aside className="schedule-channel-preview">
                <div className="schedule-channel-preview-art">
                  {form.artwork || channelArtwork ? <img src={form.artwork || channelArtwork} alt="Event artwork preview" /> : <FiImage />}
                </div>
                <strong>{channel?.name || 'Your Channel'}</strong>
                <span>{channel?.category || 'Channel'}</span>
              </aside>

              <div className="schedule-modal-fields">
                <div className="schedule-modal-top-row">
                  <label>
                    <span>Event title</span>
                    <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} maxLength="200" required autoFocus />
                  </label>

                  <label className="schedule-artwork-compact">
                    <span>Event artwork</span>
                    <span className="schedule-artwork-mini">
                      {form.artwork || channelArtwork ? <img src={form.artwork || channelArtwork} alt="" /> : <FiImage />}
                      <strong>{form.artwork ? 'Change' : 'Choose'}</strong>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onArtwork} />
                    </span>
                    <small>JPG, PNG or WebP · max 2 MB</small>
                  </label>
                </div>

                <label className="schedule-description-field">
                  <span>Description</span>
                  <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} maxLength="2000" placeholder="Tell listeners what to expect" />
                </label>

                <div className="schedule-modal-bottom-row">
                  <label>
                    <span>Date</span>
                    <input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} required />
                  </label>
                  <label>
                    <span>Start time</span>
                    <input type="time" value={form.time} onChange={(event) => updateForm('time', event.target.value)} required />
                  </label>
                  <label>
                    <span>Timezone</span>
                    <input value={timezone} readOnly aria-readonly="true" />
                  </label>
                </div>
              </div>
            </div>

            <footer className="schedule-modal-footer">
              <button type="button" onClick={closeCreate} disabled={saving}>Cancel</button>
              <button type="submit" className="schedule-primary" disabled={saving || !channel?.id}>
                {saving ? 'Scheduling…' : 'Schedule event'}
              </button>
            </footer>
          </form>
        </div>
      ), document.body)}
    </section>
  );
}
