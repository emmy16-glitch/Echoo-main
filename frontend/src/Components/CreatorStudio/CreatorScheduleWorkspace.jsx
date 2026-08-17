import { useEffect, useMemo, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaClock,
  FaMicrophone,
  FaPlus,
  FaSave,
  FaTimesCircle,
  FaTrash,
} from 'react-icons/fa';

import batch2Service from '../../services/batch2Service';
import batch3Service from '../../services/batch3Service';
import './CreatorBroadcastFlow.css';

const pad = (value) => String(value).padStart(2, '0');

const defaultDate = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDateTime = (value) => {
  if (!value) return 'Time not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time not set';

  return date.toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const CreatorScheduleWorkspace = ({ onNavigate, onEnterStudio }) => {
  const [stations, setStations] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [stationId, setStationId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');

      const [stationResult, broadcastResult] = await Promise.all([
        batch2Service.getMyStations(),
        batch3Service.getCreatorBroadcasts(),
      ]);

      const realStations = Array.isArray(stationResult?.data) ? stationResult.data : [];
      const realBroadcasts = Array.isArray(broadcastResult?.data) ? broadcastResult.data : [];

      setStations(realStations);
      setStationId((current) => current || realStations[0]?.id || '');
      setBroadcasts(realBroadcasts);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your schedule.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeBroadcasts = useMemo(
    () =>
      broadcasts
        .filter((broadcast) => ['scheduled', 'starting', 'live'].includes(broadcast.status))
        .sort(
          (first, second) =>
            new Date(first.startTime || 0) - new Date(second.startTime || 0)
        ),
    [broadcasts]
  );

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDate(defaultDate());
    setTime('18:00');
    setDuration('60');
    setFormOpen(false);
  };

  const enterStudio = (broadcastId) => {
    sessionStorage.setItem('echooPreparedBroadcastId', String(broadcastId));

    if (onEnterStudio) {
      onEnterStudio(broadcastId);
      return;
    }

    onNavigate?.('Live');
  };

  const createBroadcast = async (event) => {
    event.preventDefault();
    if (!stationId || !title.trim() || !date || !time) return;

    try {
      setSaving(true);
      setMessage('');
      setError('');

      const start = new Date(`${date}T${time}`);
      if (Number.isNaN(start.getTime())) throw new Error('Choose a valid date and time.');
      if (start <= new Date()) throw new Error('Choose a future date and time.');

      const minutes = Number(duration) || 60;
      const end = new Date(start.getTime() + minutes * 60 * 1000);
      const station = stations.find((item) => String(item.id) === String(stationId));

      const response = await batch2Service.createBroadcast({
        title: title.trim(),
        description: description.trim(),
        stationId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        type: 'live',
        isRecurring: false,
        isPublic: true,
        tags: [],
        coverArt: station?.coverArt || null,
      });

      if (!response?.data?.id) throw new Error('Could not save the scheduled broadcast.');

      setBroadcasts((current) => [...current, response.data]);
      setMessage('Broadcast scheduled.');
      resetForm();
    } catch (createError) {
      setError(createError?.message || 'Could not schedule the broadcast.');
    } finally {
      setSaving(false);
    }
  };

  const cancelBroadcast = async (broadcast) => {
    if (!window.confirm(`Cancel “${broadcast.title}”?`)) return;

    try {
      setActionId(broadcast.id);
      setMessage('');
      setError('');
      await batch3Service.cancelBroadcast(broadcast.id);
      setBroadcasts((current) =>
        current.map((item) =>
          item.id === broadcast.id ? { ...item, status: 'cancelled' } : item
        )
      );
      setMessage('Broadcast cancelled.');
    } catch (cancelError) {
      setError(cancelError?.message || 'Could not cancel the broadcast.');
    } finally {
      setActionId('');
    }
  };

  const deleteBroadcast = async (broadcast) => {
    if (!window.confirm(`Delete “${broadcast.title}”?`)) return;

    try {
      setActionId(broadcast.id);
      setMessage('');
      setError('');
      await batch2Service.deleteBroadcast(broadcast.id);
      setBroadcasts((current) => current.filter((item) => item.id !== broadcast.id));
      setMessage('Broadcast deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete the broadcast.');
    } finally {
      setActionId('');
    }
  };

  return (
    <section className="cbf-page">
      <header className="cbf-header">
        <div>
          <span className="cbf-kicker">SCHEDULE</span>
          <h1>Plan a broadcast.</h1>
          <p>Choose a station, set the time, then enter the same Live Studio when you are ready.</p>
        </div>
        <span className="cbf-status"><FaCalendarAlt /> Schedule</span>
      </header>

      {message && <div className="cbf-message success">{message}</div>}
      {error && <div className="cbf-message error">{error}</div>}

      {stations.length === 0 && !loading ? (
        <section className="cbf-card cbf-empty">
          <FaBroadcastTower />
          <h2>Create a station first</h2>
          <p>Stations are created from the Stations page.</p>
          <button type="button" className="cbf-button primary" onClick={() => onNavigate?.('Stations')}>
            Open Stations
          </button>
        </section>
      ) : (
        <>
          <div className="cbf-toolbar">
            <div>
              <strong>{activeBroadcasts.length} upcoming or live</strong>
              <div className="cbf-note">Scheduled broadcasts open in Live Studio.</div>
            </div>
            <button
              type="button"
              className="cbf-button primary"
              onClick={() => setFormOpen((current) => !current)}
              disabled={!stations.length}
            >
              <FaPlus /> Schedule broadcast
            </button>
          </div>

          {formOpen && (
            <form className="cbf-card cbf-schedule-form" onSubmit={createBroadcast}>
              <h2>New scheduled broadcast</h2>

              <div className="cbf-form-grid" style={{ marginTop: 20 }}>
                <label className="cbf-field">
                  <span>Station</span>
                  <select value={stationId} onChange={(event) => setStationId(event.target.value)} required>
                    {stations.map((station) => (
                      <option key={station.id} value={station.id}>{station.name}</option>
                    ))}
                  </select>
                </label>

                <label className="cbf-field">
                  <span>Broadcast title</span>
                  <input
                    value={title}
                    maxLength={200}
                    placeholder="e.g. Sunday Worship"
                    onChange={(event) => setTitle(event.target.value)}
                    required
                  />
                </label>

                <label className="cbf-field">
                  <span>Date</span>
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </label>

                <label className="cbf-field">
                  <span>Start time</span>
                  <input type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
                </label>

                <label className="cbf-field">
                  <span>Duration</span>
                  <select value={duration} onChange={(event) => setDuration(event.target.value)}>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1 hour 30 minutes</option>
                    <option value="120">2 hours</option>
                  </select>
                </label>

                <label className="cbf-field wide">
                  <span>Description</span>
                  <textarea
                    value={description}
                    maxLength={2000}
                    placeholder="What is this broadcast about?"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>

              <div className="cbf-actions">
                <button type="button" className="cbf-button" onClick={resetForm} disabled={saving}>Cancel</button>
                <button
                  type="submit"
                  className="cbf-button primary"
                  disabled={saving || !stationId || !title.trim() || !date || !time}
                >
                  <FaSave /> {saving ? 'Scheduling...' : 'Schedule broadcast'}
                </button>
              </div>
            </form>
          )}

          <section className="cbf-card">
            <h2>Upcoming and live</h2>

            {loading ? (
              <div className="cbf-empty" style={{ marginTop: 18 }}>Loading schedule...</div>
            ) : activeBroadcasts.length === 0 ? (
              <div className="cbf-empty" style={{ marginTop: 18 }}>
                <FaClock />
                <strong>Nothing scheduled yet</strong>
                <p>Your upcoming broadcasts will appear here.</p>
              </div>
            ) : (
              <div className="cbf-list" style={{ marginTop: 18 }}>
                {activeBroadcasts.map((broadcast) => (
                  <article className="cbf-item" key={broadcast.id}>
                    <div className="cbf-item-main">
                      <div className="cbf-item-topline">
                        <span className={`cbf-pill ${broadcast.status}`}>{broadcast.status}</span>
                        <span>{broadcast.stationName}</span>
                      </div>

                      <h3>{broadcast.title}</h3>
                      {broadcast.description && <p>{broadcast.description}</p>}

                      <div className="cbf-item-meta">
                        <span><FaCalendarAlt /> {formatDateTime(broadcast.startTime)}</span>
                        <span><FaClock /> {broadcast.duration || '—'} min</span>
                        <span>{broadcast.listenerCount || 0} listening</span>
                      </div>
                    </div>

                    <div className="cbf-item-actions">
                      <button type="button" className="cbf-button primary" onClick={() => enterStudio(broadcast.id)}>
                        <FaMicrophone /> {broadcast.status === 'scheduled' ? 'Enter Studio' : 'Open Live Studio'}
                      </button>

                      {broadcast.status === 'scheduled' && (
                        <button
                          type="button"
                          className="cbf-button"
                          disabled={actionId === broadcast.id}
                          onClick={() => cancelBroadcast(broadcast)}
                        >
                          <FaTimesCircle /> Cancel
                        </button>
                      )}

                      {broadcast.status === 'scheduled' && (
                        <button
                          type="button"
                          className="cbf-button danger"
                          disabled={actionId === broadcast.id}
                          onClick={() => deleteBroadcast(broadcast)}
                        >
                          <FaTrash /> Delete
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
};

export default CreatorScheduleWorkspace;
