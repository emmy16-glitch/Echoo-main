import { useCallback, useEffect, useMemo, useState } from 'react';
import { FaBroadcastTower } from 'react-icons/fa';
import { FiCopy, FiSquare } from 'react-icons/fi';

import CreatorAudioMixer from './CreatorAudioMixer';
import BroadcastWaveform from './BroadcastWaveform';
import batch2Service from '../../services/batch2Service';
import batch3Service from '../../services/batch3Service';
import {
  getEchooMixerOutputTrack,
  getEchooMixerState,
  getMixerChannelTrack,
  setMasterMuted,
} from '../../services/echooMixerService';
import { DEFAULT_CREATOR_AUDIO_SETTINGS } from '../../services/creatorAudioPreferences';
import {
  getRealtimeAudioProfile,
  getSavedRealtimeAudioProfile,
  normalizeRealtimeAudioProfile,
  saveRealtimeAudioProfile,
} from '../../services/realtimeAudioQuality';
import {
  getActiveLiveKitRoom,
  getLiveKitPublishingState,
  startLiveKitPublishing,
  stopLiveKitPublishing,
} from '../../services/livekitPublisher';
import realtimeService from '../../services/realtimeService';
import './CreatorBroadcastApproved.css';

const pad = (value) => String(value).padStart(2, '0');

const formatTimer = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
};

const isMissingBroadcastError = (error) =>
  error?.status === 404 &&
  (
    error?.code === 'NOT_FOUND' ||
    error?.data?.error?.code === 'NOT_FOUND' ||
    /broadcast not found/i.test(error?.message || '')
  );

const percentToRatio = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number / 100)) : fallback;
};

const buildAudioSnapshot = (state, qualityProfile) => {
  const settings = state?.processing?.settings || DEFAULT_CREATOR_AUDIO_SETTINGS;
  const realtimeAudio = getRealtimeAudioProfile(qualityProfile);
  const sourceDefinitions = [
    ['host', 'microphone', 'Host microphone'],
    ['channel2', 'microphone', 'Channel 2 input'],
    ['guest', 'guest_microphone', 'Guest microphone'],
    ['media', 'music', 'Music / FX'],
    ['screen', 'screen_share', 'Screen / tab audio'],
  ];

  return {
    audioConfiguration: {
      audioMode: settings.audioMode === 'raw' ? 'raw' : 'enhanced',
      noiseReduction: percentToRatio(settings.noiseReduction, 0.45),
      echoRemoval: settings.echoRemoval !== false,
      voiceWarmth: percentToRatio(settings.voiceWarmth, 0.35),
      voiceClarity: percentToRatio(settings.voiceClarity, 0.45),
      deEsser: percentToRatio(settings.deEsser, 0.3),
      volumeBalance: percentToRatio(settings.volumeBalance, 0.45),
      protectLoudSounds: settings.protectLoudSounds !== false,
      masterVolume: Math.max(0, Math.min(1.5, Number(state?.master?.gain) || 0)),
    },
    audioSources: sourceDefinitions.map(([key, type, fallbackLabel]) => {
      const source = state?.channels?.[key] || {};
      return {
        type,
        status: source.connected ? (source.muted ? 'muted' : 'active') : 'inactive',
        label: source.sourceLabel || fallbackLabel,
        gain: Math.max(0, Math.min(1.5, Number(source.gain) || 0)),
      };
    }),
    realtimeAudio: {
      codec: 'opus',
      requestedSampleRate: realtimeAudio.sampleRate,
      requestedChannels: realtimeAudio.channels,
      requestedMaxBitrate: realtimeAudio.maxBitrate,
      qualityProfile: realtimeAudio.id,
    },
  };
};

const getValidAudioSourceIds = (state) => ['host', 'channel2', 'guest', 'media', 'screen'].filter(
  (channelId) => state?.channels?.[channelId]?.connected && Boolean(getMixerChannelTrack(channelId))
);

const CreatorLiveConnectedWorkspace = ({
  studioName = 'Creator',
  initialBroadcastId = '',
  onNavigate,
  audioLibrary = [],
  onClearPreparedBroadcast,
}) => {
  const preparedBroadcastId =
    initialBroadcastId || sessionStorage.getItem('echooPreparedBroadcastId') || '';

  const [stations, setStations] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [stationId, setStationId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [realtimeQualityProfile, setRealtimeQualityProfile] = useState(getSavedRealtimeAudioProfile);
  const [savedBroadcast, setSavedBroadcast] = useState(null);
  const [currentLiveBroadcast, setCurrentLiveBroadcast] = useState(null);
  const [presence, setPresence] = useState({
    listenerCount: 0,
    peakListeners: 0,
    creatorConnected: false,
  });
  const [mixerState, setMixerState] = useState(() => getEchooMixerState());
  const [publisherHealth, setPublisherHealth] = useState(() => getLiveKitPublishingState());
  const [loading, setLoading] = useState(true);
  const [goingLive, setGoingLive] = useState(false);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const clearPreparedBroadcast = useCallback(() => {
    sessionStorage.removeItem('echooPreparedBroadcastId');
    onClearPreparedBroadcast?.();
  }, [onClearPreparedBroadcast]);

  const markOffAir = useCallback((notice = 'Broadcast ended. Your workstation is still ready.') => {
    setCurrentLiveBroadcast(null);
    setSavedBroadcast(null);
    setElapsed(0);
    setLinkCopied(false);
    setPresence({ listenerCount: 0, peakListeners: 0, creatorConnected: false });
    setMixerState(getEchooMixerState());
    setMessage(notice);
    clearPreparedBroadcast();
    window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
  }, [clearPreparedBroadcast]);

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

        const activeBroadcast = realBroadcasts.find(
          (item) => item.status === 'live' || item.status === 'ending'
        ) || null;

        if (activeBroadcast) {
          setCurrentLiveBroadcast(activeBroadcast);
          setSavedBroadcast(activeBroadcast);
          setRealtimeQualityProfile(normalizeRealtimeAudioProfile(
            activeBroadcast.realtimeAudio?.qualityProfile || getSavedRealtimeAudioProfile()
          ));
          setStationId(realStations[0]?.id || '');
          setTitle(activeBroadcast.title || realStations[0]?.name || '');
          setDescription(activeBroadcast.description || realStations[0]?.description || '');
          clearPreparedBroadcast();
          return;
        }

        const interruptedStart = realBroadcasts.find((item) => item.status === 'starting') || null;
        if (interruptedStart) {
          setSavedBroadcast(interruptedStart);
          setRealtimeQualityProfile(normalizeRealtimeAudioProfile(
            interruptedStart.realtimeAudio?.qualityProfile || getSavedRealtimeAudioProfile()
          ));
          setStationId(realStations[0]?.id || '');
          setTitle(interruptedStart.title || realStations[0]?.name || '');
          setDescription(interruptedStart.description || realStations[0]?.description || '');
          sessionStorage.setItem('echooPreparedBroadcastId', String(interruptedStart.id));
          setMessage('Your previous live start was interrupted. Your workstation is ready to reconnect.');
          return;
        }

        if (preparedBroadcastId) {
          let prepared = realBroadcasts.find(
            (item) => String(item.id) === String(preparedBroadcastId)
          );

          if (!prepared) {
            try {
              const response = await batch3Service.getBroadcast(preparedBroadcastId);
              prepared = response?.data || null;
            } catch (preparedError) {
              if (!isMissingBroadcastError(preparedError)) throw preparedError;
              prepared = null;
            }
          }

          if (prepared && ['scheduled', 'starting', 'failed', 'draft'].includes(prepared.status)) {
            setSavedBroadcast(prepared);
            setRealtimeQualityProfile(normalizeRealtimeAudioProfile(
              prepared.realtimeAudio?.qualityProfile || getSavedRealtimeAudioProfile()
            ));
            setStationId(realStations[0]?.id || '');
            setTitle(prepared.title || realStations[0]?.name || '');
            setDescription(prepared.description || realStations[0]?.description || '');
            return;
          }

          clearPreparedBroadcast();
        }

        const canonicalStation = realStations[0] || null;
        setStationId(canonicalStation?.id || '');
        setTitle(canonicalStation?.name || '');
        setDescription(canonicalStation?.description || '');
      } catch (loadError) {
        if (active) setError(loadError?.message || 'Could not load Broadcast Studio.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [preparedBroadcastId, clearPreparedBroadcast]);

  useEffect(() => {
    const onPublisherHealth = (event) => setPublisherHealth(event.detail);
    window.addEventListener('echoo:publisher-health', onPublisherHealth);
    return () => window.removeEventListener('echoo:publisher-health', onPublisherHealth);
  }, []);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) return undefined;

    let active = true;
    const refreshPresence = async () => {
      try {
        const next = await batch3Service.getPresence(currentLiveBroadcast.id);
        if (active) setPresence(next);
      } catch {
        // Presence is helpful but never allowed to stop an active broadcast.
      }
    };

    refreshPresence();
    const interval = window.setInterval(refreshPresence, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [currentLiveBroadcast?.id]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) return undefined;
    let active = true;
    let socket = null;

    realtimeService.joinBroadcast(currentLiveBroadcast.id).then((connectedSocket) => {
      if (!active) return;
      socket = connectedSocket;

      const onStatus = (payload) => {
        if (!payload || String(payload.broadcastId || '') !== String(currentLiveBroadcast.id)) return;
        if (['completed', 'cancelled', 'failed'].includes(payload.status)) {
          markOffAir('Broadcast ended. Your workstation is still ready.');
          return;
        }
        setCurrentLiveBroadcast((current) => current ? { ...current, ...payload } : current);
        setPresence((current) => ({
          ...current,
          listenerCount: Number(payload.listenerCount ?? current.listenerCount) || 0,
          peakListeners: Number(payload.peakListeners ?? current.peakListeners) || 0,
        }));
      };

      const onPresence = (payload) => {
        if (payload?.broadcastId && String(payload.broadcastId) !== String(currentLiveBroadcast.id)) return;
        setPresence((current) => ({ ...current, ...payload }));
      };

      connectedSocket.on('broadcast:status', onStatus);
      connectedSocket.on('presence:changed', onPresence);
      socket.__echooCreatorCleanup = () => {
        connectedSocket.off('broadcast:status', onStatus);
        connectedSocket.off('presence:changed', onPresence);
      };
    }).catch(() => {
      // Presence polling above remains available when realtime transport is unavailable.
    });

    return () => {
      active = false;
      socket?.__echooCreatorCleanup?.();
      realtimeService.leaveBroadcast(currentLiveBroadcast.id).catch(() => {});
    };
  }, [currentLiveBroadcast?.id, markOffAir]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) return undefined;
    const startedAt = new Date(
      currentLiveBroadcast.startedAt || currentLiveBroadcast.startTime || Date.now()
    ).getTime();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [currentLiveBroadcast?.id, currentLiveBroadcast?.startedAt, currentLiveBroadcast?.startTime]);

  const selectedStation = useMemo(
    () => stations[0] || null,
    [stations]
  );

  useEffect(() => {
    if (!selectedStation || savedBroadcast?.id || currentLiveBroadcast?.id) return;
    setTitle(selectedStation.name || '');
    setDescription(selectedStation.description || '');
  }, [selectedStation, savedBroadcast?.id, currentLiveBroadcast?.id]);

  const prepareImmediateBroadcast = async (snapshot = getEchooMixerState()) => {
    const audioSnapshot = buildAudioSnapshot(snapshot, realtimeQualityProfile);

    if (savedBroadcast?.id && savedBroadcast.status !== 'live') {
      try {
        const response = await batch2Service.updateBroadcast(savedBroadcast.id, {
          title: title.trim(),
          description: description.trim(),
          ...audioSnapshot,
        });
        const updated = response?.data || savedBroadcast;
        setSavedBroadcast(updated);
        return updated;
      } catch (updateError) {
        if (!isMissingBroadcastError(updateError)) throw updateError;
        setSavedBroadcast(null);
        setBroadcasts((current) => current.filter(
          (item) => String(item.id) !== String(savedBroadcast.id)
        ));
        clearPreparedBroadcast();
      }
    }

    const station = selectedStation || stations[0] || null;
    if (!station?.id) throw new Error('Complete your Channel setup before going live.');

    const start = new Date(Date.now() + 10 * 60 * 1000);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const response = await batch2Service.createBroadcast({
      title: title.trim() || station.name || 'Live broadcast',
      description: description.trim(),
      stationId: station.id,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      type: 'live',
      isRecurring: false,
      isPublic: true,
      tags: [],
      coverArt: station.coverArt || station.logo || null,
      ...audioSnapshot,
    });

    if (!response?.data?.id) throw new Error('Could not prepare this broadcast.');
    setSavedBroadcast(response.data);
    setBroadcasts((current) => [...current, response.data]);
    sessionStorage.setItem('echooPreparedBroadcastId', String(response.data.id));
    return response.data;
  };

  const goLive = async () => {
    if (goingLive || currentLiveBroadcast?.id) return;
    const station = selectedStation || stations[0] || null;
    if (!station?.id) {
      setError('Complete your Channel setup before going live.');
      return;
    }

    const liveMixerSnapshot = getEchooMixerState();
    const liveSourceIds = getValidAudioSourceIds(liveMixerSnapshot);
    if (!liveSourceIds.length) {
      setError('Connect a microphone, audio source, or shared browser tab with a live signal before going live.');
      return;
    }

    const mediaTrack = getEchooMixerOutputTrack();
    if (!mediaTrack) {
      setError('The studio mix is not ready yet.');
      return;
    }

    let broadcast = null;
    let backendStarted = false;

    try {
      setGoingLive(true);
      setError('');
      setMessage('Opening your live room…');
      setMixerState(liveMixerSnapshot);
      broadcast = await prepareImmediateBroadcast(liveMixerSnapshot);

      let connection = null;
      if (broadcast.status === 'starting') {
        connection = await batch3Service.getLiveKitToken(broadcast.id);
        backendStarted = true;
      } else {
        const response = await batch3Service.startBroadcast(broadcast.id);
        backendStarted = true;
        connection = response?.livekit;
      }

      const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
      if (!connection?.token || !liveKitUrl) {
        throw new Error('Echoo could not open the live audio room.');
      }

      await startLiveKitPublishing({
        url: liveKitUrl,
        token: connection.token,
        broadcastId: broadcast.id,
        mediaTrack,
        qualityProfile: realtimeQualityProfile,
      });

      let confirmed = null;
      try {
        confirmed = await batch3Service.confirmBroadcastLive(broadcast.id);
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        confirmed = await batch3Service.confirmBroadcastLive(broadcast.id);
      }

      const liveBroadcast = confirmed?.data || { ...broadcast, status: 'live', isLive: true };
      setSavedBroadcast(liveBroadcast);
      setCurrentLiveBroadcast(liveBroadcast);
      setElapsed(0);
      setBroadcasts((current) => current.map(
        (item) => String(item.id) === String(liveBroadcast.id) ? liveBroadcast : item
      ));
      setMessage('You are live.');
      clearPreparedBroadcast();
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
    } catch (liveError) {
      if (backendStarted && broadcast?.id) {
        await batch3Service.cancelBroadcast(broadcast.id).catch(() => {});
      }
      await stopLiveKitPublishing().catch(() => {});
      setError(liveError?.message || 'Echoo could not start the broadcast.');
    } finally {
      setGoingLive(false);
    }
  };

  const endBroadcast = async () => {
    if (!currentLiveBroadcast?.id || ending) return;
    const confirmed = window.confirm('End broadcast? Your listeners will be disconnected, but your workstation setup will stay ready.');
    if (!confirmed) return;

    const broadcastId = currentLiveBroadcast.id;
    try {
      setEnding(true);
      setError('');
      setMessage('Ending broadcast…');

      const endedResponse = await batch3Service.endBroadcast(broadcastId);
      const publishingResult = await Promise.allSettled([
        stopLiveKitPublishing(),
        Promise.resolve().then(() => setMasterMuted(false)),
      ]);

      const publishingWarning = publishingResult.find((result) => result.status === 'rejected');
      markOffAir('Broadcast ended. Your workstation is still ready.');
      if (publishingWarning) {
        setError('The broadcast ended, but Echoo could not fully close the local live connection. Refresh before starting another live session.');
      }

      if (!endedResponse?.data) {
        setMessage('Broadcast ended. Your workstation is still ready.');
      }
    } catch (endError) {
      setError(endError?.message || 'Could not end the broadcast.');
      setMessage('');
    } finally {
      setEnding(false);
    }
  };

  const copyLiveLink = async () => {
    if (!currentLiveBroadcast?.id || typeof window === 'undefined') return;
    const path = `/listen/live/${encodeURIComponent(currentLiveBroadcast.id)}`;
    const url = new URL(path, window.location.origin).toString();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setError('');
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setError('Could not copy the live link. Copy it from your browser after opening the Listener experience.');
    }
  };

  if (loading) {
    return <div className="ebsx-loading">Loading Broadcast Studio...</div>;
  }

  if (!stations.length && !currentLiveBroadcast) {
    return (
      <section className="ebsx-empty-page">
        <FaBroadcastTower />
        <h1>Complete your Channel setup.</h1>
        <p>Your Echoo Channel is required before you can broadcast.</p>
            <button type="button" onClick={() => onNavigate?.('Station')}>Open Channel</button>
      </section>
    );
  }

  const isLive = Boolean(currentLiveBroadcast?.id);
  // Channel identity is independent of the selected program/broadcast. The
  // canonical station is always the first backend-ordered station.
  const liveStation = selectedStation;
  const activeRoom = isLive ? getActiveLiveKitRoom() : null;
  const creatorConnected = presence.creatorConnected || Boolean(activeRoom);
  const audioPublished =
    currentLiveBroadcast?.mediaState === 'audio_live' ||
    publisherHealth?.audio === 'published';
  const connectionHealthy = creatorConnected && audioPublished;

  return (
    <section className={`ec2-broadcast ${isLive ? 'is-live' : ''}`} aria-label="Broadcast workstation">
      <section className={`ec2-hero ${isLive ? 'is-live' : ''}`} aria-live="polite">
        <div>
          <span className="ec2-status-pill"><i /> {isLive ? 'LIVE' : 'OFF AIR'}</span>
          <h1>{isLive ? 'LIVE' : 'OFF AIR'}</h1>
          {isLive ? (
            <>
              <p>You&apos;re broadcasting now.</p>
              <div className="ec2-live-meta" aria-label="Live broadcast status">
                <span>{formatTimer(elapsed)}</span>
                <span>{presence.listenerCount || 0} listening</span>
                <span className={connectionHealthy ? 'is-healthy' : ''}>
                  {connectionHealthy ? 'Connected' : 'Connecting…'}
                </span>
              </div>
            </>
          ) : (
            <>
              <p>You are not live yet.</p>
              <p>Connect your inputs, test your mix and go live.</p>
            </>
          )}
        </div>
        <div className="ec2-waveform-wrap">
          <BroadcastWaveform level={mixerState?.master?.level || 0} />
        </div>
        <aside className="ec2-station-identity">
          <span>CHANNEL</span>
          <strong>{liveStation?.name || 'Your Channel'}</strong>
          <small>{liveStation?.category || 'Your Echoo Channel'}</small>
        </aside>
      </section>

      <header className="ec2-workstation-heading">
        <h2>Workstation</h2>
        <p>{isLive ? 'Your live mix stays exactly where you prepared it.' : 'Mix, monitor and go live.'}</p>
      </header>

      {error && <div className="ec2-notice" role="alert">{error}</div>}
      {message && message !== 'You are live.' && (
        <div className="ec2-notice ec2-notice--info" role="status">{message}</div>
      )}

      <CreatorAudioMixer
        approved
        sessionState={mixerState}
        onStateChange={setMixerState}
        audioLibrary={audioLibrary}
        onGoLive={goLive}
        goLiveBusy={goingLive}
        qualityProfile={realtimeQualityProfile}
        onQualityProfileChange={(value) => setRealtimeQualityProfile(saveRealtimeAudioProfile(value))}
      />

      {isLive && (
        <div className="ec2-live-action-panel" aria-label="Live broadcast actions">
          <button type="button" className="ec2-copy-live" onClick={copyLiveLink}>
            <FiCopy /> {linkCopied ? 'Copied' : 'Copy live link'}
          </button>
          <button type="button" className="ec2-end-live" onClick={endBroadcast} disabled={ending}>
            <FiSquare /> {ending ? 'Ending…' : 'End broadcast'}
          </button>
        </div>
      )}
    </section>
  );
};

export default CreatorLiveConnectedWorkspace;
