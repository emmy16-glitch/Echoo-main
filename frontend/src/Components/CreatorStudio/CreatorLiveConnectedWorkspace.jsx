import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaCheck,
  FaMicrophone,
  FaSave,
  FaStop,
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
import './CreatorBroadcastFlow.css';

const CreatorLiveConnectedWorkspace = ({
  studioName = 'Creator',
  profileImage = null,
  initialBroadcastId = '',
  onNavigate,
  onClearPreparedBroadcast,
}) => {
  const preparedBroadcastId =
    initialBroadcastId ||
    sessionStorage.getItem('echooPreparedBroadcastId') ||
    '';

  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [savedBroadcast, setSavedBroadcast] = useState(null);
  const [currentLiveBroadcast, setCurrentLiveBroadcast] = useState(null);
  const [presence, setPresence] = useState({
    listenerCount: 0,
    peakListeners: 0,
    creatorConnected: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [ending, setEnding] = useState(false);
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
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (contextRef.current) {
      contextRef.current.close().catch(() => {});
      contextRef.current = null;
    }

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

    const rms = Math.sqrt(total / data.length);
    setInputLevel(Math.max(0, Math.min(1, rms * 4.2)));
    frameRef.current = requestAnimationFrame(runMeter);
  }, []);

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

        const realStations = Array.isArray(stationResult?.data)
          ? stationResult.data
          : [];
        const broadcasts = Array.isArray(broadcastResult?.data)
          ? broadcastResult.data
          : [];

        setStations(realStations);

        const live = broadcasts.find((item) => item.status === 'live') || null;
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
          let prepared = broadcasts.find(
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
            setMessage('Scheduled broadcast loaded. Check your microphone, then go live.');
            return;
          }

          clearPreparedBroadcast();
        }

        setStationId(realStations[0]?.id || '');
      } catch (loadError) {
        if (active) {
          setError(loadError?.message || 'Could not load Creator Live.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
      releaseMicTest(false);
    };
  }, [preparedBroadcastId, releaseMicTest, clearPreparedBroadcast]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) return undefined;

    let active = true;
    const refreshPresence = async () => {
      try {
        const next = await batch3Service.getPresence(currentLiveBroadcast.id);
        if (active) setPresence(next);
      } catch {
        // A presence refresh failure must not interrupt audio publishing.
      }
    };

    refreshPresence();
    const interval = window.setInterval(refreshPresence, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentLiveBroadcast?.id]);

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

      if (!AudioContextClass) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Web Audio is not available in this browser.');
      }

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

  const saveSetup = async () => {
    if (!stationId || !title.trim() || saving) return null;

    try {
      setSaving(true);
      setError('');
      setMessage('');

      let response;
      if (savedBroadcast?.id && savedBroadcast.status !== 'live') {
        response = await batch2Service.updateBroadcast(savedBroadcast.id, {
          title: title.trim(),
          description: description.trim(),
        });
      } else {
        const scheduledStart = new Date(Date.now() + 10 * 60 * 1000);
        const plannedEnd = new Date(
          scheduledStart.getTime() + 4 * 60 * 60 * 1000
        );
        const station = stations.find(
          (item) => String(item.id) === String(stationId)
        );

        response = await batch2Service.createBroadcast({
          title: title.trim(),
          description: description.trim(),
          stationId,
          startTime: scheduledStart.toISOString(),
          endTime: plannedEnd.toISOString(),
          type: 'live',
          isRecurring: false,
          isPublic: true,
          tags: [],
          coverArt: station?.coverArt || null,
        });
      }

      if (!response?.data?.id) {
        throw new Error('Echoo did not return a broadcast ID.');
      }

      setSavedBroadcast(response.data);
      setMessage('Broadcast setup saved.');
      return response.data;
    } catch (saveError) {
      setError(saveError?.message || 'Could not save the broadcast.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const goLive = async () => {
    if (goingLive || currentLiveBroadcast) return;
    if (!stationId) return setError('Choose a station first.');
    if (!title.trim()) return setError('Add a broadcast title first.');
    if (micState !== 'ready') {
      return setError('Test your microphone before going live.');
    }

    let broadcast = null;
    let backendStarted = false;

    try {
      setGoingLive(true);
      setError('');
      setMessage('Preparing your LiveKit room...');

      broadcast = await saveSetup();
      if (!broadcast?.id) {
        throw new Error('Could not save the broadcast before going live.');
      }

      releaseMicTest();

      const response = await batch3Service.startBroadcast(broadcast.id);
      backendStarted = true;
      const connection = response?.livekit;
      const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;

      if (!connection?.token || !liveKitUrl) {
        throw new Error('Echoo did not return complete LiveKit connection details.');
      }

      await startLiveKitPublishing({
        url: liveKitUrl,
        token: connection.token,
        broadcastId: broadcast.id,
      });

      const confirmed = await batch3Service.confirmBroadcastLive(broadcast.id);
      const liveBroadcast = confirmed?.data || {
        ...broadcast,
        status: 'live',
        isLive: true,
      };

      setSavedBroadcast(liveBroadcast);
      setCurrentLiveBroadcast(liveBroadcast);
      setMessage(`${liveBroadcast.title} is live.`);
      clearPreparedBroadcast();
    } catch (liveError) {
      await stopLiveKitPublishing().catch(() => {});

      if (backendStarted && broadcast?.id) {
        await batch3Service.cancelBroadcast(broadcast.id).catch(() => {});
      }

      setCurrentLiveBroadcast(null);
      setError(liveError?.message || 'Echoo could not start the live broadcast.');
    } finally {
      setGoingLive(false);
    }
  };

  const reconnectMicrophone = async () => {
    if (!currentLiveBroadcast?.id || goingLive) return;

    try {
      setGoingLive(true);
      setError('');
      const connection = await batch3Service.getLiveKitToken(currentLiveBroadcast.id);
      const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;

      if (!connection?.token || !liveKitUrl) {
        throw new Error('Could not obtain LiveKit connection details.');
      }

      await startLiveKitPublishing({
        url: liveKitUrl,
        token: connection.token,
        broadcastId: currentLiveBroadcast.id,
      });
      setMessage('Broadcast microphone connected.');
    } catch (reconnectError) {
      setError(reconnectError?.message || 'Could not reconnect the microphone.');
    } finally {
      setGoingLive(false);
    }
  };

  const endBroadcast = async () => {
    if (!currentLiveBroadcast?.id || ending) return;
    if (!window.confirm(`End "${currentLiveBroadcast.title}" now?`)) return;

    try {
      setEnding(true);
      setError('');
      await stopLiveKitPublishing();
      await batch3Service.endBroadcast(currentLiveBroadcast.id);
      setMessage(`${currentLiveBroadcast.title} has ended.`);
      setCurrentLiveBroadcast(null);
      setSavedBroadcast(null);
      setPresence({ listenerCount: 0, peakListeners: 0, creatorConnected: false });
      setTitle('');
      setDescription('');
      clearPreparedBroadcast();
    } catch (endError) {
      setError(endError?.message || 'Could not end the broadcast.');
    } finally {
      setEnding(false);
    }
  };

  const microphoneReady = micState === 'ready';
  const formReady = Boolean(stationId && title.trim());
  const backendReady = Boolean(savedBroadcast?.id);
  const isLive = Boolean(currentLiveBroadcast?.id);
  const speaking = microphoneReady && inputLevel > 0.055;

  if (loading) {
    return (
      <section className="cbf-page">
        <div className="cbf-card cbf-empty">Connecting Creator Live...</div>
      </section>
    );
  }

  return (
    <section className="cbf-page">
      <header className="cbf-header">
        <div>
          <span className="cbf-kicker">CREATOR LIVE</span>
          <h1>{isLive ? 'You are live.' : 'Prepare your broadcast.'}</h1>
          <p>
            {isLive
              ? 'Your microphone is connected to LiveKit and listeners can hear this broadcast.'
              : 'Every live broadcast belongs to a station. Create stations only from the Stations workspace, then prepare audio here.'}
          </p>
        </div>
        <span className={`cbf-status ${isLive ? 'live' : ''}`}>
          <FaBroadcastTower /> {isLive ? 'LIVE · LiveKit' : 'LiveKit ready'}
        </span>
      </header>

      <div className="cbf-grid">
        <section className="cbf-card cbf-stage">
          <EchoAmbient density="low" />
          <div className="cbf-stage-inner">
            <EchoAvatar
              image={profileImage}
              name={studioName}
              state={isLive || speaking ? 'speaking' : microphoneReady ? 'listening' : 'idle'}
              size="xl"
            />
            <div>
              <h2 className="cbf-stage-title">
                {currentLiveBroadcast?.title || title.trim() || 'Your live conversation'}
              </h2>
              <div className="cbf-stage-subtitle">{studioName}</div>
            </div>
            <EchoWave state={isLive || speaking ? 'speaking' : microphoneReady ? 'playing' : 'idle'} />

            {!isLive && (
              <>
                <div className="cbf-meter">
                  <div className="cbf-meter-label">
                    <span>Microphone level</span>
                    <span>{microphoneReady ? 'Ready' : 'Not tested'}</span>
                  </div>
                  <div className="cbf-meter-track">
                    <span style={{ width: `${inputLevel * 100}%` }} />
                  </div>
                </div>
                <div className="cbf-actions">
                  {microphoneReady ? (
                    <button type="button" className="cbf-button" onClick={() => releaseMicTest()}>
                      <FaStop /> Stop test
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cbf-button primary"
                      onClick={startMicTest}
                      disabled={micState === 'requesting'}
                    >
                      <FaMicrophone /> {micState === 'requesting' ? 'Requesting...' : 'Test microphone'}
                    </button>
                  )}
                </div>
              </>
            )}

            {isLive && (
              <>
                <div className="cbf-item-meta">
                  <span>{presence.listenerCount || 0} listening</span>
                  <span>Peak {presence.peakListeners || 0}</span>
                  <span>{presence.creatorConnected ? 'Creator connected' : 'Checking connection'}</span>
                </div>
                <div className="cbf-actions">
                  <button type="button" className="cbf-button" onClick={reconnectMicrophone} disabled={goingLive}>
                    <FaMicrophone /> {goingLive ? 'Connecting...' : 'Reconnect microphone'}
                  </button>
                  <button type="button" className="cbf-button danger" onClick={endBroadcast} disabled={ending}>
                    <FaStop /> {ending ? 'Ending...' : 'End broadcast'}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="cbf-card">
          <h2>{isLive ? 'Live broadcast' : 'Broadcast setup'}</h2>
          <p>
            {isLive
              ? 'The broadcast lifecycle is controlled by the Echoo backend.'
              : preparedBroadcastId
                ? 'This scheduled broadcast is using the same studio as Go Live Now.'
                : 'Save the setup, test the microphone and start when you are ready.'}
          </p>

          {!isLive && stations.length === 0 ? (
            <div className="cbf-empty" style={{ marginTop: 20 }}>
              <FaBroadcastTower />
              <strong>No station yet</strong>
              <p>Create your station once in the Stations workspace.</p>
              <button type="button" className="cbf-button primary" onClick={() => onNavigate?.('Stations')}>
                Open Stations
              </button>
            </div>
          ) : !isLive ? (
            <>
              <div className="cbf-fields">
                <label className="cbf-field">
                  <span>Station</span>
                  <select
                    value={stationId}
                    disabled={Boolean(preparedBroadcastId) || Boolean(savedBroadcast?.id)}
                    onChange={(event) => {
                      setStationId(event.target.value);
                      setSavedBroadcast(null);
                    }}
                  >
                    <option value="">Select a station</option>
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
                    placeholder="What are you talking about?"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>

                <label className="cbf-field">
                  <span>Description</span>
                  <textarea
                    value={description}
                    maxLength={2000}
                    placeholder="Give listeners a reason to join."
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              </div>

              {preparedBroadcastId && savedBroadcast?.startTime && (
                <div className="cbf-message success">
                  <FaCalendarAlt /> Scheduled for {new Date(savedBroadcast.startTime).toLocaleString()}.
                </div>
              )}

              <div className="cbf-checklist">
                <div className={`cbf-check ${formReady ? 'complete' : ''}`}>
                  <span><FaCheck /></span> Choose a station and title
                </div>
                <div className={`cbf-check ${microphoneReady ? 'complete' : ''}`}>
                  <span><FaCheck /></span> Test your microphone
                </div>
                <div className={`cbf-check ${backendReady ? 'complete' : ''}`}>
                  <span><FaCheck /></span> Save broadcast to Echoo
                </div>
              </div>

              <div className="cbf-actions">
                <button type="button" className="cbf-button" onClick={saveSetup} disabled={!formReady || saving}>
                  <FaSave /> {saving ? 'Saving...' : 'Save setup'}
                </button>
                <button type="button" className="cbf-button primary" onClick={goLive} disabled={!formReady || !microphoneReady || goingLive}>
                  <FaBroadcastTower /> {goingLive ? 'Starting...' : 'Go live'}
                </button>
              </div>

              <p className="cbf-note">
                Microphone testing stays on this device. Echoo publishes only after Go live, then confirms the broadcast live after the creator is connected to LiveKit.
              </p>
            </>
          ) : (
            <div className="cbf-message success">
              <strong>{currentLiveBroadcast.title}</strong><br />
              LiveKit direct audio is active. Listeners join the same room with receive-only permissions.
            </div>
          )}

          {message && <div className="cbf-message success">{message}</div>}
          {error && <div className="cbf-message error">{error}</div>}
        </section>
      </div>
    </section>
  );
};

export default CreatorLiveConnectedWorkspace;
