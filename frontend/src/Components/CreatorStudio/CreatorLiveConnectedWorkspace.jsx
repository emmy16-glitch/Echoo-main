import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaCheck,
  FaClock,
  FaMicrophone,
  FaStop,
  FaTimesCircle,
  FaTrash,
} from 'react-icons/fa';

import EchoAmbient from '../EchooSystem/EchoAmbient';
import EchoAvatar from '../EchooSystem/EchoAvatar';
import EchoWave from '../EchooSystem/EchoWave';
import batch2Service from '../../services/batch2Service';
import batch3Service from '../../services/batch3Service';
import {
  startLiveKitPublishing,
  stopLiveKitPublishing,
} from '../../services/livekitPublisher';
import './CreatorBroadcastUnified.css';

const pad = (value) => String(value).padStart(2, '0');
const defaultDate = () => {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const CreatorLiveConnectedWorkspace = ({
  studioName = 'Creator',
  profileImage = null,
  initialBroadcastId = '',
  onNavigate,
  onClearPreparedBroadcast,
}) => {
  const preparedBroadcastId = initialBroadcastId || sessionStorage.getItem('echooPreparedBroadcastId') || '';
  const requestedMode = sessionStorage.getItem('echooBroadcastMode') || 'now';
  const requestedStationId = sessionStorage.getItem('echooSelectedStationId') || '';

  const [stations, setStations] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [stationId, setStationId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState(requestedMode === 'later' ? 'later' : 'now');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [savedBroadcast, setSavedBroadcast] = useState(null);
  const [currentLiveBroadcast, setCurrentLiveBroadcast] = useState(null);
  const [presence, setPresence] = useState({ listenerCount: 0, peakListeners: 0, creatorConnected: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [ending, setEnding] = useState(false);
  const [actionId, setActionId] = useState('');
  const [micState, setMicState] = useState('idle');
  const [inputLevel, setInputLevel] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const frameRef = useRef(null);
  const dataRef = useRef(null);

  const clearPreparedBroadcast = useCallback(() => {
    sessionStorage.removeItem('echooPreparedBroadcastId');
    onClearPreparedBroadcast?.();
  }, [onClearPreparedBroadcast]);

  const releaseMicTest = useCallback((resetState = true) => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (contextRef.current) contextRef.current.close().catch(() => {});
    contextRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;
    if (resetState) {
      setInputLevel(0);
      setMicState('idle');
    }
  }, []);

  const runMeter = useCallback(() => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return;
    analyser.getByteTimeDomainData(data);
    let total = 0;
    for (let index = 0; index < data.length; index += 1) {
      const normalized = (data[index] - 128) / 128;
      total += normalized * normalized;
    }
    setInputLevel(Math.max(0, Math.min(1, Math.sqrt(total / data.length) * 4.2)));
    frameRef.current = requestAnimationFrame(runMeter);
  }, []);

  const hydrateBroadcast = (broadcast) => {
    if (!broadcast) return;
    setSavedBroadcast(broadcast);
    setStationId(broadcast.stationId || '');
    setTitle(broadcast.title || '');
    setDescription(broadcast.description || '');
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
          hydrateBroadcast(live);
          setMode('now');
          clearPreparedBroadcast();
          return;
        }

        if (preparedBroadcastId) {
          let prepared = realBroadcasts.find((item) => String(item.id) === String(preparedBroadcastId));
          if (!prepared) prepared = (await batch3Service.getBroadcast(preparedBroadcastId))?.data || null;
          if (prepared && ['scheduled', 'failed'].includes(prepared.status)) {
            hydrateBroadcast(prepared);
            setMode('now');
            setMessage('Scheduled broadcast loaded. Check your microphone, then start when you are ready.');
            return;
          }
          clearPreparedBroadcast();
        }

        const selected = realStations.some((station) => String(station.id) === String(requestedStationId))
          ? requestedStationId
          : realStations[0]?.id || '';
        setStationId(selected);
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load Broadcast Studio.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      releaseMicTest(false);
    };
  }, [preparedBroadcastId, requestedStationId, releaseMicTest, clearPreparedBroadcast]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) return undefined;
    let active = true;
    const refreshPresence = async () => {
      try {
        const next = await batch3Service.getPresence(currentLiveBroadcast.id);
        if (active) setPresence(next);
      } catch {
        // Live audio must not fail because presence reporting is temporarily unavailable.
      }
    };
    refreshPresence();
    const interval = window.setInterval(refreshPresence, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentLiveBroadcast?.id]);

  const planned = useMemo(
    () => broadcasts
      .filter((broadcast) => broadcast.status === 'scheduled')
      .sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0)),
    [broadcasts]
  );

  const setBroadcastMode = (nextMode) => {
    if (nextMode === 'now' && currentLiveBroadcast) return;
    setMode(nextMode);
    sessionStorage.setItem('echooBroadcastMode', nextMode);
    setMessage('');
    setError('');
    if (nextMode === 'later') releaseMicTest();
  };

  const startMicTest = async () => {
    setError('');
    setMessage('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported by this browser.');
      return;
    }
    releaseMicTest();
    try {
      setMicState('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Audio testing is not available in this browser.');
      const context = new AudioContextClass();
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.fftSize);
      setMicState('ready');
      runMeter();
    } catch (micError) {
      releaseMicTest();
      setError(micError?.message || 'Echoo could not access your microphone.');
    }
  };

  const saveImmediateSetup = async () => {
    if (!stationId || !title.trim() || saving) return null;
    try {
      setSaving(true);
      setError('');
      if (savedBroadcast?.id && savedBroadcast.status === 'scheduled') {
        const response = await batch2Service.updateBroadcast(savedBroadcast.id, {
          title: title.trim(), description: description.trim(),
        });
        setSavedBroadcast(response?.data || savedBroadcast);
        return response?.data || savedBroadcast;
      }

      const start = new Date(Date.now() + 5 * 60 * 1000);
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
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
      if (!response?.data?.id) throw new Error('Could not prepare this broadcast.');
      setSavedBroadcast(response.data);
      setBroadcasts((current) => [...current, response.data]);
      return response.data;
    } catch (saveError) {
      setError(saveError?.message || 'Could not prepare the broadcast.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const goLive = async () => {
    if (goingLive || currentLiveBroadcast) return;
    if (!stationId) return setError('Choose a station first.');
    if (!title.trim()) return setError('Add a broadcast title first.');
    if (micState !== 'ready') return setError('Test your microphone before going live.');

    let broadcast = null;
    let backendStarted = false;
    try {
      setGoingLive(true);
      setError('');
      setMessage('Starting your broadcast...');
      broadcast = await saveImmediateSetup();
      if (!broadcast?.id) throw new Error('Could not prepare the broadcast.');
      releaseMicTest();
      const response = await batch3Service.startBroadcast(broadcast.id);
      backendStarted = true;
      const connection = response?.livekit;
      const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
      if (!connection?.token || !liveKitUrl) throw new Error('Echoo could not open the live audio room.');
      await startLiveKitPublishing({ url: liveKitUrl, token: connection.token, broadcastId: broadcast.id });
      const confirmed = await batch3Service.confirmBroadcastLive(broadcast.id);
      const liveBroadcast = confirmed?.data || { ...broadcast, status: 'live', isLive: true };
      setCurrentLiveBroadcast(liveBroadcast);
      setSavedBroadcast(liveBroadcast);
      setBroadcasts((current) => current.map((item) => item.id === liveBroadcast.id ? liveBroadcast : item));
      setMessage('You are live.');
      clearPreparedBroadcast();
    } catch (liveError) {
      await stopLiveKitPublishing().catch(() => {});
      if (backendStarted && broadcast?.id) await batch3Service.cancelBroadcast(broadcast.id).catch(() => {});
      setCurrentLiveBroadcast(null);
      setError(liveError?.message || 'Echoo could not start the broadcast.');
    } finally {
      setGoingLive(false);
    }
  };

  const scheduleBroadcast = async () => {
    if (!stationId || !title.trim() || !date || !time || saving) return;
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const start = new Date(`${date}T${time}`);
      if (Number.isNaN(start.getTime()) || start <= new Date()) throw new Error('Choose a future date and time.');
      const end = new Date(start.getTime() + (Number(duration) || 60) * 60 * 1000);
      const station = stations.find((item) => String(item.id) === String(stationId));
      const response = await batch2Service.createBroadcast({
        title: title.trim(), description: description.trim(), stationId,
        startTime: start.toISOString(), endTime: end.toISOString(), type: 'live',
        isRecurring: false, isPublic: true, tags: [], coverArt: station?.coverArt || null,
      });
      if (!response?.data?.id) throw new Error('Could not schedule this broadcast.');
      setBroadcasts((current) => [...current, response.data]);
      setMessage('Broadcast scheduled.');
      setTitle('');
      setDescription('');
      setDate(defaultDate());
      setTime('18:00');
    } catch (scheduleError) {
      setError(scheduleError?.message || 'Could not schedule the broadcast.');
    } finally {
      setSaving(false);
    }
  };

  const enterScheduled = (broadcast) => {
    releaseMicTest();
    hydrateBroadcast(broadcast);
    setMode('now');
    sessionStorage.setItem('echooPreparedBroadcastId', String(broadcast.id));
    sessionStorage.setItem('echooBroadcastMode', 'now');
    setMessage('Scheduled broadcast loaded. Test your microphone, then start when ready.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelBroadcast = async (broadcast) => {
    if (!window.confirm(`Cancel “${broadcast.title}”?`)) return;
    try {
      setActionId(broadcast.id);
      await batch3Service.cancelBroadcast(broadcast.id);
      setBroadcasts((current) => current.map((item) => item.id === broadcast.id ? { ...item, status: 'cancelled' } : item));
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
      await batch2Service.deleteBroadcast(broadcast.id);
      setBroadcasts((current) => current.filter((item) => item.id !== broadcast.id));
      setMessage('Broadcast deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete the broadcast.');
    } finally {
      setActionId('');
    }
  };

  const reconnectMicrophone = async () => {
    if (!currentLiveBroadcast?.id || goingLive) return;
    try {
      setGoingLive(true);
      setError('');
      const connection = await batch3Service.getLiveKitToken(currentLiveBroadcast.id);
      const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
      if (!connection?.token || !liveKitUrl) throw new Error('Could not reconnect the microphone.');
      await startLiveKitPublishing({ url: liveKitUrl, token: connection.token, broadcastId: currentLiveBroadcast.id });
      setMessage('Microphone reconnected.');
    } catch (reconnectError) {
      setError(reconnectError?.message || 'Could not reconnect the microphone.');
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
      setBroadcasts((current) => current.map((item) => item.id === currentLiveBroadcast.id ? { ...item, status: 'completed' } : item));
      setCurrentLiveBroadcast(null);
      setSavedBroadcast(null);
      setPresence({ listenerCount: 0, peakListeners: 0, creatorConnected: false });
      setTitle('');
      setDescription('');
      setMessage('Broadcast ended. You can start another station when you are ready.');
      clearPreparedBroadcast();
    } catch (endError) {
      setError(endError?.message || 'Could not end the broadcast.');
    } finally {
      setEnding(false);
    }
  };

  const selectedStation = stations.find((station) => String(station.id) === String(stationId));
  const microphoneReady = micState === 'ready';
  const formReady = Boolean(stationId && title.trim());
  const speaking = microphoneReady && inputLevel > 0.055;

  if (loading) return <section className="ebu"><div className="ebu-card ebu-empty">Loading Broadcast Studio...</div></section>;

  if (!stations.length) {
    return (
      <section className="ebu">
        <header className="ebu-heading"><span>BROADCAST</span><h1>Create a station first.</h1><p>Every broadcast belongs to a station.</p></header>
        <div className="ebu-card ebu-empty large">
          <FaBroadcastTower />
          <h2>No stations yet</h2>
          <p>Create your first station, then return here to go live or schedule a broadcast.</p>
          <button type="button" className="ebu-button primary" onClick={() => onNavigate?.('Stations')}>Create station</button>
        </div>
      </section>
    );
  }

  return (
    <section className="ebu">
      <header className="ebu-heading">
        <div>
          <span>BROADCAST</span>
          <h1>{currentLiveBroadcast ? 'You are live.' : 'Start a broadcast.'}</h1>
          <p>{currentLiveBroadcast ? 'Your microphone is live. You can still schedule another broadcast for later.' : 'Choose a station, add the details, then go live now or schedule for later.'}</p>
        </div>
        <div className={`ebu-state ${currentLiveBroadcast ? 'live' : ''}`}><FaBroadcastTower /> {currentLiveBroadcast ? 'LIVE' : 'Studio ready'}</div>
      </header>

      {message && <div className="ebu-message success">{message}</div>}
      {error && <div className="ebu-message error">{error}</div>}

      {currentLiveBroadcast ? (
        <section className="ebu-live-grid">
          <div className="ebu-live-card">
            <EchoAmbient density="low" />
            <div className="ebu-live-copy">
              <span className="ebu-live-pill">ON AIR</span>
              <EchoAvatar image={profileImage} name={studioName} size="xl" state="speaking" />
              <h2>{currentLiveBroadcast.title}</h2>
              <p>{currentLiveBroadcast.stationName || selectedStation?.name || 'Station'} · {studioName}</p>
              <EchoWave state="speaking" />
              <div className="ebu-live-stats"><span><strong>{presence.listenerCount || 0}</strong> listening</span><span><strong>{presence.peakListeners || 0}</strong> peak</span><span><strong>{presence.creatorConnected ? 'Connected' : 'Checking'}</strong> microphone</span></div>
              <div className="ebu-actions centered">
                <button type="button" className="ebu-button" onClick={reconnectMicrophone} disabled={goingLive}><FaMicrophone /> Reconnect microphone</button>
                <button type="button" className="ebu-button danger" onClick={endBroadcast} disabled={ending}><FaStop /> {ending ? 'Ending...' : 'End broadcast'}</button>
              </div>
            </div>
          </div>

          <aside className="ebu-card ebu-live-side">
            <span className="ebu-small-label">CURRENT BROADCAST</span>
            <h2>{currentLiveBroadcast.title}</h2>
            <dl><div><dt>Station</dt><dd>{currentLiveBroadcast.stationName || selectedStation?.name || 'Station'}</dd></div><div><dt>Listeners</dt><dd>{presence.listenerCount || 0}</dd></div><div><dt>Peak</dt><dd>{presence.peakListeners || 0}</dd></div></dl>
            <div className="ebu-live-lock"><FaCheck /> One live broadcast is active on this creator account.</div>
            <button type="button" className="ebu-button full" onClick={() => setBroadcastMode('later')}><FaCalendarAlt /> Schedule another broadcast</button>
          </aside>
        </section>
      ) : (
        <>
          <div className="ebu-mode-switch">
            <button type="button" className={mode === 'now' ? 'active' : ''} onClick={() => setBroadcastMode('now')}><FaMicrophone /><span><strong>Go live now</strong><small>Start broadcasting immediately</small></span></button>
            <button type="button" className={mode === 'later' ? 'active' : ''} onClick={() => setBroadcastMode('later')}><FaCalendarAlt /><span><strong>Schedule for later</strong><small>Choose a future date and time</small></span></button>
          </div>

          <div className="ebu-setup-grid">
            <section className="ebu-card">
              <div className="ebu-section-head"><div><span>1</span><h2>Broadcast details</h2></div><p>Choose where this broadcast belongs and what listeners will see.</p></div>
              <div className="ebu-fields">
                <label><span>Station</span><select value={stationId} disabled={Boolean(savedBroadcast?.id)} onChange={(event) => { setStationId(event.target.value); setSavedBroadcast(null); }}><option value="">Select station</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select><small>Need another station? <button type="button" onClick={() => onNavigate?.('Stations')}>Create it in Stations</button>.</small></label>
                <label><span>Broadcast title</span><input value={title} maxLength={200} placeholder="e.g. Sunday Evening Service" onChange={(event) => setTitle(event.target.value)} /></label>
                <label className="wide"><span>Description</span><textarea value={description} maxLength={2000} placeholder="Tell listeners what this broadcast is about." onChange={(event) => setDescription(event.target.value)} /></label>
              </div>
            </section>

            {mode === 'now' ? (
              <section className="ebu-card">
                <div className="ebu-section-head"><div><span>2</span><h2>Microphone check</h2></div><p>Test your input before listeners can hear you.</p></div>
                <div className="ebu-mic-preview">
                  <div className="ebu-mic-orbit"><FaMicrophone /></div>
                  <div className="ebu-meter"><div><span>Microphone level</span><strong>{microphoneReady ? 'Ready' : 'Not tested'}</strong></div><div className="ebu-meter-track"><i style={{ width: `${inputLevel * 100}%` }} /></div></div>
                  <EchoWave state={speaking ? 'speaking' : microphoneReady ? 'playing' : 'idle'} />
                  <div className="ebu-actions centered">
                    {microphoneReady ? <button type="button" className="ebu-button" onClick={() => releaseMicTest()}><FaStop /> Stop test</button> : <button type="button" className="ebu-button primary" onClick={startMicTest} disabled={micState === 'requesting'}><FaMicrophone /> {micState === 'requesting' ? 'Checking...' : 'Test microphone'}</button>}
                  </div>
                </div>
                <div className="ebu-ready-row"><span className={formReady ? 'done' : ''}><FaCheck /> Station and title</span><span className={microphoneReady ? 'done' : ''}><FaCheck /> Microphone ready</span></div>
                <button type="button" className="ebu-button primary full large" onClick={goLive} disabled={!formReady || !microphoneReady || goingLive || saving}><FaBroadcastTower /> {goingLive || saving ? 'Starting...' : 'Start broadcast'}</button>
              </section>
            ) : (
              <section className="ebu-card">
                <div className="ebu-section-head"><div><span>2</span><h2>Schedule</h2></div><p>Set when this broadcast should happen.</p></div>
                <div className="ebu-fields schedule">
                  <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
                  <label><span>Start time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
                  <label><span>Duration</span><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="240">4 hours</option></select></label>
                </div>
                <button type="button" className="ebu-button primary full large" onClick={scheduleBroadcast} disabled={!formReady || saving || !date || !time}><FaCalendarAlt /> {saving ? 'Scheduling...' : 'Schedule broadcast'}</button>
              </section>
            )}
          </div>
        </>
      )}

      {currentLiveBroadcast && mode === 'later' && (
        <section className="ebu-card ebu-inline-schedule">
          <div className="ebu-section-head"><div><span>+</span><h2>Schedule another broadcast</h2></div><p>Your current broadcast stays live while you plan this one.</p></div>
          <div className="ebu-fields inline">
            <label><span>Station</span><select value={stationId} onChange={(event) => setStationId(event.target.value)}>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
            <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Broadcast title" /></label>
            <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label><span>Time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
            <label><span>Duration</span><select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="30">30 min</option><option value="60">1 hour</option><option value="90">1.5 hours</option><option value="120">2 hours</option></select></label>
          </div>
          <div className="ebu-actions"><button type="button" className="ebu-button" onClick={() => setMode('now')}>Close</button><button type="button" className="ebu-button primary" onClick={scheduleBroadcast} disabled={!formReady || saving}><FaCalendarAlt /> {saving ? 'Scheduling...' : 'Schedule'}</button></div>
        </section>
      )}

      <section className="ebu-card ebu-planned">
        <div className="ebu-panel-head"><div><h2>Planned broadcasts</h2><p>Scheduled sessions can enter this same studio when it is time.</p></div><button type="button" className="ebu-button" onClick={() => setBroadcastMode('later')}><FaCalendarAlt /> Schedule for later</button></div>
        {planned.length ? (
          <div className="ebu-list">
            {planned.map((broadcast) => (
              <article key={broadcast.id}>
                <div><span className="ebu-pill">SCHEDULED</span><small>{broadcast.stationName || 'Station'}</small><h3>{broadcast.title}</h3><p><FaClock /> {formatDateTime(broadcast.startTime)} · {broadcast.duration || '—'} min</p></div>
                <div className="ebu-list-actions"><button type="button" className="ebu-button primary" onClick={() => enterScheduled(broadcast)}><FaMicrophone /> Enter studio</button><button type="button" className="ebu-button" disabled={actionId === broadcast.id} onClick={() => cancelBroadcast(broadcast)}><FaTimesCircle /> Cancel</button><button type="button" className="ebu-button danger ghost" disabled={actionId === broadcast.id} onClick={() => deleteBroadcast(broadcast)}><FaTrash /></button></div>
              </article>
            ))}
          </div>
        ) : <div className="ebu-empty compact"><FaCalendarAlt /><strong>Nothing scheduled yet</strong><p>Scheduled broadcasts will appear here.</p></div>}
      </section>
    </section>
  );
};

export default CreatorLiveConnectedWorkspace;
