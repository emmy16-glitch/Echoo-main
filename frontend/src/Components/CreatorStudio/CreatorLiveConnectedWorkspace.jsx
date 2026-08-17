import { useEffect, useMemo, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaCheck,
  FaClock,
  FaComments,
  FaMicrophone,
  FaPaperPlane,
  FaShareAlt,
  FaStop,
  FaTimesCircle,
  FaTrash,
  FaUsers,
} from 'react-icons/fa';

import EchoAmbient from '../EchooSystem/EchoAmbient';
import EchoAvatar from '../EchooSystem/EchoAvatar';
import EchoWave from '../EchooSystem/EchoWave';
import CreatorAudioMixer from './CreatorAudioMixer';
import batch2Service from '../../services/batch2Service';
import batch3Service from '../../services/batch3Service';
import batch4Service from '../../services/batch4Service';
import {
  getEchooMixerOutputTrack,
  ensureHostInput,
  stopEchooMixer,
} from '../../services/echooMixerService';
import {
  startLiveKitPublishing,
  stopLiveKitPublishing,
} from '../../services/livekitPublisher';
import './CreatorBroadcastStudioExact.css';

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

const formatTimer = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
};

const CreatorLiveConnectedWorkspace = ({
  studioName = 'Creator',
  profileImage = null,
  initialBroadcastId = '',
  onNavigate,
  onClearPreparedBroadcast,
}) => {
  const preparedBroadcastId =
    initialBroadcastId || sessionStorage.getItem('echooPreparedBroadcastId') || '';

  const [stations, setStations] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [stationId, setStationId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState(
    () => sessionStorage.getItem('echooBroadcastMode') === 'later' ? 'later' : 'now'
  );
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [savedBroadcast, setSavedBroadcast] = useState(null);
  const [currentLiveBroadcast, setCurrentLiveBroadcast] = useState(null);
  const [presence, setPresence] = useState({
    listenerCount: 0,
    peakListeners: 0,
    creatorConnected: false,
  });
  const [mixerState, setMixerState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [ending, setEnding] = useState(false);
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatSending, setChatSending] = useState(false);

  const clearPreparedBroadcast = () => {
    sessionStorage.removeItem('echooPreparedBroadcastId');
    onClearPreparedBroadcast?.();
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const [stationResult, broadcastResult] = await Promise.all([
          batch2Service.getMyStations(),
          batch3Service.getCreatorBroadcasts(),
        ]);

        if (!active) return;

        const realStations = Array.isArray(stationResult?.data) ? stationResult.data : [];
        const realBroadcasts = Array.isArray(broadcastResult?.data) ? broadcastResult.data : [];
        setStations(realStations);
        setBroadcasts(realBroadcasts);

        const live = realBroadcasts.find((item) => item.status === 'live') || null;
        if (live) {
          setCurrentLiveBroadcast(live);
          setSavedBroadcast(live);
          setStationId(live.stationId || '');
          setTitle(live.title || '');
          setDescription(live.description || '');
          clearPreparedBroadcast();
          return;
        }

        if (preparedBroadcastId) {
          let prepared = realBroadcasts.find(
            (item) => String(item.id) === String(preparedBroadcastId)
          );

          if (!prepared) {
            const response = await batch3Service.getBroadcast(preparedBroadcastId);
            prepared = response?.data || null;
          }

          if (prepared && ['scheduled', 'starting', 'failed'].includes(prepared.status)) {
            setSavedBroadcast(prepared);
            setStationId(prepared.stationId || '');
            setTitle(prepared.title || '');
            setDescription(prepared.description || '');
            setMode('now');
            return;
          }

          clearPreparedBroadcast();
        }

        const requestedStation = sessionStorage.getItem('echooSelectedStationId') || '';
        setStationId(
          realStations.some((station) => String(station.id) === String(requestedStation))
            ? requestedStation
            : realStations[0]?.id || ''
        );
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load Broadcast Studio.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [preparedBroadcastId]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) return undefined;

    let active = true;
    const refreshPresence = async () => {
      try {
        const next = await batch3Service.getPresence(currentLiveBroadcast.id);
        if (active) setPresence(next);
      } catch {
        // Presence errors never stop an active broadcast.
      }
    };

    const first = window.setTimeout(refreshPresence, 0);
    const interval = window.setInterval(refreshPresence, 5000);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [currentLiveBroadcast?.id]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) {
      setElapsed(0);
      return undefined;
    }

    const started = new Date(
      currentLiveBroadcast.startedAt || currentLiveBroadcast.startTime || Date.now()
    ).getTime();

    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    const first = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1000);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [currentLiveBroadcast?.id, currentLiveBroadcast?.startedAt, currentLiveBroadcast?.startTime]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) {
      setChatMessages([]);
      return undefined;
    }

    let active = true;
    const loadMessages = async () => {
      try {
        const response = await batch4Service.getMessages(currentLiveBroadcast.id, { limit: 40 });
        if (active) setChatMessages(Array.isArray(response?.data) ? response.data : []);
      } catch {
        // Chat recovery is best-effort while live audio remains primary.
      }
    };

    const first = window.setTimeout(loadMessages, 0);
    const interval = window.setInterval(loadMessages, 5000);
    return () => {
      active = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [currentLiveBroadcast?.id]);

  const selectedStation = useMemo(
    () => stations.find((station) => String(station.id) === String(stationId)) || null,
    [stations, stationId]
  );

  const planned = useMemo(
    () => broadcasts
      .filter((broadcast) => broadcast.status === 'scheduled')
      .sort((first, second) => new Date(first.startTime || 0) - new Date(second.startTime || 0)),
    [broadcasts]
  );

  const microphoneReady = Boolean(mixerState?.channels?.host?.connected);
  const formReady = Boolean(stationId && title.trim());

  const changeMode = (nextMode) => {
    setMode(nextMode);
    sessionStorage.setItem('echooBroadcastMode', nextMode);
    setMessage('');
    setError('');
  };

  const testMicrophone = async () => {
    try {
      setError('');
      await ensureHostInput();
      setMessage('Microphone ready.');
    } catch (micError) {
      setError(micError?.message || 'Could not connect your microphone.');
    }
  };

  const prepareImmediateBroadcast = async () => {
    if (savedBroadcast?.id && savedBroadcast.status !== 'live') {
      const response = await batch2Service.updateBroadcast(savedBroadcast.id, {
        title: title.trim(),
        description: description.trim(),
      });
      return response?.data || savedBroadcast;
    }

    const start = new Date(Date.now() + 10 * 60 * 1000);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);

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
      coverArt: selectedStation?.coverArt || null,
    });

    if (!response?.data?.id) throw new Error('Could not prepare this broadcast.');
    setSavedBroadcast(response.data);
    setBroadcasts((current) => [...current, response.data]);
    return response.data;
  };

  const goLive = async () => {
    if (goingLive || currentLiveBroadcast) return;
    if (!formReady) return setError('Choose a station and add a broadcast title.');
    if (!microphoneReady) return setError('Connect and test your host microphone first.');

    const mediaTrack = getEchooMixerOutputTrack();
    if (!mediaTrack) return setError('The studio mixer output is not ready.');

    let broadcast = null;
    let backendStarted = false;

    try {
      setGoingLive(true);
      setError('');
      setMessage('Opening your live room...');

      broadcast = await prepareImmediateBroadcast();
      const response = await batch3Service.startBroadcast(broadcast.id);
      backendStarted = true;
      const connection = response?.livekit;
      const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;

      if (!connection?.token || !liveKitUrl) {
        throw new Error('Echoo could not open the live audio room.');
      }

      await startLiveKitPublishing({
        url: liveKitUrl,
        token: connection.token,
        broadcastId: broadcast.id,
        mediaTrack,
      });

      const confirmed = await batch3Service.confirmBroadcastLive(broadcast.id);
      const liveBroadcast = confirmed?.data || { ...broadcast, status: 'live', isLive: true };

      setSavedBroadcast(liveBroadcast);
      setCurrentLiveBroadcast(liveBroadcast);
      setBroadcasts((current) =>
        current.map((item) => item.id === liveBroadcast.id ? liveBroadcast : item)
      );
      setMessage('You are live.');
      clearPreparedBroadcast();
    } catch (liveError) {
      await stopLiveKitPublishing().catch(() => {});
      if (backendStarted && broadcast?.id) {
        await batch3Service.cancelBroadcast(broadcast.id).catch(() => {});
      }
      setError(liveError?.message || 'Echoo could not start the broadcast.');
    } finally {
      setGoingLive(false);
    }
  };

  const scheduleBroadcast = async () => {
    if (!formReady || saving) return;

    try {
      setSaving(true);
      setError('');
      setMessage('');

      const start = new Date(`${date}T${time}`);
      if (Number.isNaN(start.getTime())) throw new Error('Choose a valid date and time.');
      if (start <= new Date()) throw new Error('Choose a future date and time.');

      const minutes = Number(duration) || 60;
      const end = new Date(start.getTime() + minutes * 60 * 1000);
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
        coverArt: selectedStation?.coverArt || null,
      });

      if (!response?.data?.id) throw new Error('Could not schedule this broadcast.');
      setBroadcasts((current) => [...current, response.data]);
      setMessage('Broadcast scheduled.');
      setTitle('');
      setDescription('');
      setDate(defaultDate());
      setTime('18:00');
      setDuration('60');
      setSavedBroadcast(null);
    } catch (scheduleError) {
      setError(scheduleError?.message || 'Could not schedule this broadcast.');
    } finally {
      setSaving(false);
    }
  };

  const reconnectMicrophone = async () => {
    if (!currentLiveBroadcast?.id || goingLive) return;

    try {
      setGoingLive(true);
      setError('');
      if (!microphoneReady) await ensureHostInput();
      const mediaTrack = getEchooMixerOutputTrack();
      if (!mediaTrack) throw new Error('The studio mixer output is not ready.');

      const connection = await batch3Service.getLiveKitToken(currentLiveBroadcast.id);
      const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
      if (!connection?.token || !liveKitUrl) throw new Error('Could not reconnect the live room.');

      await startLiveKitPublishing({
        url: liveKitUrl,
        token: connection.token,
        broadcastId: currentLiveBroadcast.id,
        mediaTrack,
      });
      setMessage('Studio mix reconnected.');
    } catch (reconnectError) {
      setError(reconnectError?.message || 'Could not reconnect the studio mix.');
    } finally {
      setGoingLive(false);
    }
  };

  const endBroadcast = async () => {
    if (!currentLiveBroadcast?.id || ending) return;
    if (!window.confirm(`End “${currentLiveBroadcast.title}” now?`)) return;

    try {
      setEnding(true);
      setError('');
      await stopLiveKitPublishing();
      await batch3Service.endBroadcast(currentLiveBroadcast.id);
      await stopEchooMixer();
      setBroadcasts((current) => current.map((item) =>
        item.id === currentLiveBroadcast.id ? { ...item, status: 'completed' } : item
      ));
      setCurrentLiveBroadcast(null);
      setSavedBroadcast(null);
      setPresence({ listenerCount: 0, peakListeners: 0, creatorConnected: false });
      setTitle('');
      setDescription('');
      setMessage('Broadcast ended.');
      clearPreparedBroadcast();
    } catch (endError) {
      setError(endError?.message || 'Could not end the broadcast.');
    } finally {
      setEnding(false);
    }
  };

  const cancelBroadcast = async (broadcast) => {
    if (!window.confirm(`Cancel “${broadcast.title}”?`)) return;
    try {
      setActionId(broadcast.id);
      await batch3Service.cancelBroadcast(broadcast.id);
      setBroadcasts((current) => current.map((item) =>
        item.id === broadcast.id ? { ...item, status: 'cancelled' } : item
      ));
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
      await batch2Service.deleteBroadcast(broadcast.id);
      setBroadcasts((current) => current.filter((item) => item.id !== broadcast.id));
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete the broadcast.');
    } finally {
      setActionId('');
    }
  };

  const enterScheduled = (broadcast) => {
    setSavedBroadcast(broadcast);
    setStationId(broadcast.stationId || '');
    setTitle(broadcast.title || '');
    setDescription(broadcast.description || '');
    setMode('now');
    sessionStorage.setItem('echooPreparedBroadcastId', String(broadcast.id));
    sessionStorage.setItem('echooBroadcastMode', 'now');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sendChat = async (event) => {
    event.preventDefault();
    const content = chatText.trim();
    if (!content || !currentLiveBroadcast?.id || chatSending) return;

    try {
      setChatSending(true);
      const response = await batch4Service.sendMessage(currentLiveBroadcast.id, content);
      if (response?.data) setChatMessages((current) => [...current, response.data]);
      setChatText('');
    } catch (chatError) {
      setError(chatError?.message || 'Could not send the chat message.');
    } finally {
      setChatSending(false);
    }
  };

  const shareBroadcast = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: currentLiveBroadcast?.title || 'Echoo live broadcast', url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage('Broadcast link copied.');
      }
    } catch {
      // User cancelled sharing.
    }
  };

  if (loading) {
    return <div className="ebsx-loading">Loading Broadcast Studio...</div>;
  }

  if (!stations.length && !currentLiveBroadcast) {
    return (
      <section className="ebsx-empty-page">
        <FaBroadcastTower />
        <h1>Create your first station.</h1>
        <p>A station is required before you can start or schedule a broadcast.</p>
        <button type="button" onClick={() => onNavigate?.('Stations')}>Open Stations</button>
      </section>
    );
  }

  if (currentLiveBroadcast) {
    const liveStation = stations.find(
      (station) => String(station.id) === String(currentLiveBroadcast.stationId)
    ) || selectedStation;

    return (
      <section className="ebsx live-page">
        <header className="ebsx-live-header">
          <div>
            <div className="ebsx-live-line"><span>LIVE</span><b>{formatTimer(elapsed)}</b></div>
            <h1>Live Broadcast</h1>
            <p>You are live. Keep an eye on your mix and your audience.</p>
          </div>
          <div className="ebsx-live-header-actions">
            <button type="button" onClick={shareBroadcast}><FaShareAlt /> Share</button>
            <button type="button" onClick={() => changeMode('later')}><FaCalendarAlt /> Schedule another</button>
          </div>
        </header>

        {message && <div className="ebsx-message success">{message}</div>}
        {error && <div className="ebsx-message error">{error}</div>}

        <div className="ebsx-live-layout">
          <main className="ebsx-live-main">
            <section className="ebsx-onair-card">
              <EchoAmbient density="low" />
              <div className="ebsx-onair-art">
                {liveStation?.coverArt
                  ? <img src={liveStation.coverArt} alt="" />
                  : <FaBroadcastTower />}
              </div>
              <div className="ebsx-onair-copy">
                <div className="ebsx-onair-tags"><span>ON AIR</span><b>LIVE</b><em>{formatTimer(elapsed)}</em></div>
                <h2>{currentLiveBroadcast.title}</h2>
                <p>{liveStation?.name || currentLiveBroadcast.stationName || 'Echoo Station'}</p>
                <small>{studioName}</small>
                <div className="ebsx-onair-health">
                  <span><FaUsers /> Public</span>
                  <span className={presence.creatorConnected ? 'good' : ''}>{presence.creatorConnected ? 'Good connection' : 'Checking connection'}</span>
                </div>
              </div>
              <div className="ebsx-live-mic"><FaMicrophone /></div>
              <div className="ebsx-wave"><EchoWave state="speaking" /></div>
              <div className="ebsx-onair-stats">
                <div><strong>{presence.listenerCount || 0}</strong><span>Listening now</span></div>
                <div><strong>{presence.peakListeners || 0}</strong><span>Peak listeners</span></div>
                <div><strong>{presence.creatorConnected ? 'Stable' : 'Checking'}</strong><span>Connection</span></div>
              </div>
            </section>

            <div className="ebsx-live-primary-actions">
              <button type="button" onClick={reconnectMicrophone} disabled={goingLive}><FaMicrophone /> Reconnect studio mix</button>
              <button type="button" className="danger" onClick={endBroadcast} disabled={ending}><FaStop /> {ending ? 'Ending...' : 'End broadcast'}</button>
            </div>

            <div className="ebsx-live-lower">
              <section className="ebsx-chat-card">
                <div className="ebsx-card-head"><h2>Live chat</h2><span>{chatMessages.length}</span></div>
                <div className="ebsx-chat-list">
                  {chatMessages.length ? chatMessages.slice(-8).map((chat) => (
                    <div className="ebsx-chat-row" key={chat.id || chat._id}>
                      <div className="ebsx-chat-avatar">
                        {chat.avatar ? <img src={chat.avatar} alt="" /> : String(chat.displayName || 'E').charAt(0)}
                      </div>
                      <div><strong>{chat.displayName || chat.username || 'Listener'}</strong><p>{chat.content}</p></div>
                    </div>
                  )) : <div className="ebsx-chat-empty"><FaComments /> No chat messages yet.</div>}
                </div>
                <form className="ebsx-chat-form" onSubmit={sendChat}>
                  <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Send a message..." />
                  <button type="submit" disabled={chatSending || !chatText.trim()}><FaPaperPlane /></button>
                </form>
              </section>

              <section className="ebsx-activity-card">
                <div className="ebsx-card-head"><h2>Listener activity</h2></div>
                <strong className="ebsx-activity-big">{presence.listenerCount || 0}</strong>
                <span className="ebsx-activity-live"><i /> Listening now</span>
                <div className="ebsx-activity-stats">
                  <div><span>Peak listeners</span><strong>{presence.peakListeners || 0}</strong></div>
                  <div><span>Live time</span><strong>{formatTimer(elapsed)}</strong></div>
                  <div><span>Studio output</span><strong>{mixerState?.channels?.host?.connected ? 'Ready' : 'Check mic'}</strong></div>
                </div>
              </section>
            </div>
          </main>

          <aside className="ebsx-live-side">
            <CreatorAudioMixer compact onStateChange={setMixerState} />
            <section className="ebsx-live-controls">
              <h2>Live controls</h2>
              <div className="ebsx-control-grid">
                <button type="button" onClick={shareBroadcast}><FaShareAlt /><span><strong>Share broadcast</strong><small>Copy or share the live link</small></span></button>
                <button type="button" onClick={() => onNavigate?.('Stations')}><FaBroadcastTower /><span><strong>Station page</strong><small>Manage this station</small></span></button>
                <button type="button" onClick={() => changeMode('later')}><FaCalendarAlt /><span><strong>Plan another</strong><small>Schedule while this stays live</small></span></button>
                <button type="button" onClick={() => onNavigate?.('Analytics')}><FaUsers /><span><strong>View analytics</strong><small>Open creator performance</small></span></button>
              </div>
            </section>
          </aside>
        </div>

        {mode === 'later' && (
          <section className="ebsx-live-schedule">
            <div className="ebsx-section-title"><div><span>SCHEDULE</span><h2>Plan another broadcast</h2><p>Your current broadcast stays live while you schedule this one.</p></div><button type="button" onClick={() => changeMode('now')}>Close</button></div>
            <div className="ebsx-fields inline">
              <label><span>Station</span><select value={stationId} onChange={(event) => setStationId(event.target.value)}>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
              <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Broadcast title" /></label>
              <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label><span>Time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
              <label><span>Duration</span><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="30">30 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label>
            </div>
            <button type="button" className="ebsx-blue-button" onClick={scheduleBroadcast} disabled={!formReady || saving}><FaCalendarAlt /> {saving ? 'Scheduling...' : 'Schedule broadcast'}</button>
          </section>
        )}
      </section>
    );
  }

  return (
    <section className="ebsx setup-page">
      <header className="ebsx-setup-header">
        <div><h1>Broadcast Studio <span>PRE-LIVE SETUP</span></h1><p>Set up your broadcast, test your audio, and go live with confidence.</p></div>
      </header>

      {message && <div className="ebsx-message success">{message}</div>}
      {error && <div className="ebsx-message error">{error}</div>}

      <div className="ebsx-setup-layout">
        <main className="ebsx-setup-main">
          <section className="ebsx-station-hero">
            <div className="ebsx-station-art">
              {selectedStation?.coverArt ? <img src={selectedStation.coverArt} alt="" /> : <FaBroadcastTower />}
            </div>
            <div className="ebsx-station-copy">
              <span>STATION SELECTED <FaCheck /></span>
              <h2>{selectedStation?.name || 'Choose a station'}</h2>
              <p>{selectedStation?.category || 'Station'}</p>
              <small>{Number(selectedStation?.followerCount || 0).toLocaleString()} followers</small>
            </div>
            <div className="ebsx-quality">
              <span>Studio status</span>
              <strong><i /> {microphoneReady ? 'Audio ready' : 'Waiting for microphone'}</strong>
              <p>Your live mix is sent to LiveKit when you start the broadcast.</p>
            </div>
            <div className="ebsx-hero-mic"><FaMicrophone /></div>
          </section>

          <div className="ebsx-preflight-grid">
            <section className="ebsx-mic-preview">
              <div className="ebsx-card-head"><h2>Microphone preview</h2><span className={microphoneReady ? 'ready' : ''}>{microphoneReady ? 'Mic ready' : 'Not connected'}</span></div>
              <div className="ebsx-preview-wave"><EchoWave state={microphoneReady ? 'playing' : 'idle'} /></div>
              <div className="ebsx-mic-source"><FaMicrophone /><div><strong>{mixerState?.channels?.host?.sourceLabel || 'Host microphone'}</strong><small>Primary input</small></div></div>
              <button type="button" className="ebsx-outline-button" onClick={testMicrophone}><FaMicrophone /> {microphoneReady ? 'Test again' : 'Test microphone'}</button>
              <div className="ebsx-checks"><span className={microphoneReady ? 'done' : ''}><FaCheck /> Microphone detected</span><span className={stationId ? 'done' : ''}><FaCheck /> Station selected</span><span className={formReady ? 'done' : ''}><FaCheck /> Broadcast details</span></div>
            </section>

            <CreatorAudioMixer onStateChange={setMixerState} />
          </div>

          <section className="ebsx-planned-card">
            <div className="ebsx-section-title"><div><span>UPCOMING</span><h2>Planned broadcasts</h2><p>Scheduled sessions return to this same studio when it is time.</p></div><button type="button" onClick={() => changeMode('later')}><FaCalendarAlt /> Schedule for later</button></div>
            {planned.length ? (
              <div className="ebsx-planned-list">
                {planned.map((broadcast) => (
                  <article key={broadcast.id}>
                    <div><span>SCHEDULED</span><small>{broadcast.stationName || 'Station'}</small><h3>{broadcast.title}</h3><p><FaClock /> {formatDateTime(broadcast.startTime)} · {broadcast.duration || '—'} min</p></div>
                    <div><button type="button" className="primary" onClick={() => enterScheduled(broadcast)}><FaMicrophone /> Enter studio</button><button type="button" disabled={actionId === broadcast.id} onClick={() => cancelBroadcast(broadcast)}><FaTimesCircle /> Cancel</button><button type="button" className="danger" disabled={actionId === broadcast.id} onClick={() => deleteBroadcast(broadcast)}><FaTrash /></button></div>
                  </article>
                ))}
              </div>
            ) : <div className="ebsx-empty-line"><FaCalendarAlt /> Nothing scheduled yet.</div>}
          </section>
        </main>

        <aside className="ebsx-workflow">
          <div className="ebsx-workflow-head"><h2>Setup workflow</h2><span>{mode === 'now' ? 'Go live now' : 'Schedule for later'}</span></div>

          <div className="ebsx-step done"><b>1</b><div><strong>Choose station</strong><p>Select the station this broadcast belongs to.</p><select value={stationId} disabled={Boolean(savedBroadcast?.id)} onChange={(event) => { setStationId(event.target.value); setSavedBroadcast(null); }}><option value="">Select station</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select><small>Need another station? <button type="button" onClick={() => onNavigate?.('Stations')}>Create it in Stations</button>.</small></div></div>

          <div className={`ebsx-step ${title.trim() ? 'done' : ''}`}><b>2</b><div><strong>Broadcast details</strong><p>Add the title listeners will see.</p><input value={title} maxLength={200} placeholder="Broadcast title" onChange={(event) => setTitle(event.target.value)} /><textarea value={description} maxLength={2000} placeholder="Description" onChange={(event) => setDescription(event.target.value)} /></div></div>

          {mode === 'now' ? (
            <>
              <div className={`ebsx-step ${microphoneReady ? 'done' : ''}`}><b>3</b><div><strong>Test microphone</strong><p>Make sure the host input is ready.</p><button type="button" className="ebsx-outline-button full" onClick={testMicrophone}><FaMicrophone /> {microphoneReady ? 'Mic ready — test again' : 'Test microphone'}</button></div></div>
              <div className={`ebsx-step ${formReady && microphoneReady ? 'done' : ''}`}><b>4</b><div><strong>Ready</strong><p>Station, details and microphone must be ready.</p></div></div>
              <div className="ebsx-step final"><b>5</b><div><strong>Go live</strong><p>Your mixer output will be published to listeners.</p><button type="button" className="ebsx-blue-button full" onClick={goLive} disabled={!formReady || !microphoneReady || goingLive || saving}><FaBroadcastTower /> {goingLive || saving ? 'Starting...' : 'Go live now'}</button><button type="button" className="ebsx-schedule-button full" onClick={() => changeMode('later')}><FaCalendarAlt /> Schedule for later</button></div></div>
            </>
          ) : (
            <>
              <div className="ebsx-step done"><b>3</b><div><strong>Date and time</strong><p>Choose when this broadcast should begin.</p><div className="ebsx-workflow-date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="240">4 hours</option></select></div></div>
              <div className="ebsx-step final"><b>4</b><div><strong>Schedule</strong><p>Save this broadcast and return when it is time.</p><button type="button" className="ebsx-blue-button full" onClick={scheduleBroadcast} disabled={!formReady || saving || !date || !time}><FaCalendarAlt /> {saving ? 'Scheduling...' : 'Schedule broadcast'}</button><button type="button" className="ebsx-schedule-button full" onClick={() => changeMode('now')}><FaMicrophone /> Go live instead</button></div></div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
};

export default CreatorLiveConnectedWorkspace;
