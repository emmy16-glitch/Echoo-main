import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiCopy,
  FiLoader,
  FiRadio,
  FiSquare,
  FiX,
} from 'react-icons/fi';

import CreatorAudioMixer from './CreatorAudioMixer';
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
  initialBroadcastId = '',
  onNavigate,
  audioLibrary = [],
  onClearPreparedBroadcast,
}) => {
  const preparedBroadcastId =
    initialBroadcastId || sessionStorage.getItem('echooPreparedBroadcastId') || '';

  const [stations, setStations] = useState([]);
  const [, setBroadcasts] = useState([]);
  const [, setStationId] = useState('');
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
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const endBroadcastButtonRef = useRef(null);
  const endBroadcastDialogRef = useRef(null);
  const endingDialogRef = useRef(null);
  const keepLiveButtonRef = useRef(null);
  const endingRequestRef = useRef(false);
  const offAirNoticeTimeoutRef = useRef(null);

  const clearPreparedBroadcast = useCallback(() => {
    sessionStorage.removeItem('echooPreparedBroadcastId');
    onClearPreparedBroadcast?.();
  }, [onClearPreparedBroadcast]);

  const markOffAir = useCallback((notice = 'Broadcast ended. Your workstation is still ready.') => {
    window.clearTimeout(offAirNoticeTimeoutRef.current);
    setCurrentLiveBroadcast(null);
    setSavedBroadcast(null);
    setElapsed(0);
    setLinkCopied(false);
    setPresence({ listenerCount: 0, peakListeners: 0, creatorConnected: false });
    setConfirmEndOpen(false);
    setMixerState(getEchooMixerState());
    setMessage(notice);
    if (notice) {
      offAirNoticeTimeoutRef.current = window.setTimeout(() => setMessage(''), 3000);
    }
    clearPreparedBroadcast();
    window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
  }, [clearPreparedBroadcast]);

  useEffect(() => () => window.clearTimeout(offAirNoticeTimeoutRef.current), []);

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

          if (prepared && ['processing', 'ready_for_review', 'editing', 'failed'].includes(prepared.status)) {
            onNavigate?.('Broadcast', { broadcastId: prepared._id });
            return;
          }

          if (prepared && ['scheduled', 'starting', 'draft'].includes(prepared.status)) {
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
  }, [preparedBroadcastId, clearPreparedBroadcast, onNavigate]);

  useEffect(() => {
    const onPublisherHealth = (event) => setPublisherHealth(event.detail);
    window.addEventListener('echoo:publisher-health', onPublisherHealth);
    return () => window.removeEventListener('echoo:publisher-health', onPublisherHealth);
  }, []);

  useEffect(() => {
    if (!currentLiveBroadcast?.id || ending) return undefined;

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
  }, [currentLiveBroadcast?.id, ending]);

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
  }, [currentLiveBroadcast?.id, currentLiveBroadcast?.startedAt, currentLiveBroadcast?.startTime, ending]);

  const closeEndConfirmation = useCallback(() => {
    if (ending) return;
    setConfirmEndOpen(false);
    window.requestAnimationFrame(() => endBroadcastButtonRef.current?.focus());
  }, [ending]);

  useEffect(() => {
    if (!confirmEndOpen) return undefined;

    keepLiveButtonRef.current?.focus();

    const handleDialogKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEndConfirmation();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        endBroadcastDialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => document.removeEventListener('keydown', handleDialogKeyDown);
  }, [closeEndConfirmation, confirmEndOpen]);

  useEffect(() => {
    if (ending) endingDialogRef.current?.focus();
  }, [ending]);

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

    const clickStartedAt = performance.now();
    let broadcast = null;
    let backendStarted = false;

    try {
      setGoingLive(true);
      setError('');
      setMessage('Connecting your live room…');
      setMixerState(liveMixerSnapshot);
      const prepareStartedAt = performance.now();
      broadcast = await prepareImmediateBroadcast(liveMixerSnapshot);
      const preparedAt = performance.now();

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

      const publishResult = await startLiveKitPublishing({
        url: liveKitUrl,
        token: connection.token,
        broadcastId: broadcast.id,
        mediaTrack,
        qualityProfile: realtimeQualityProfile,
      });

      // A successful canonical-program publication is the honest LIVE moment.
      // Recorder startup and backend presence propagation are background work.
      const liveBroadcast = {
        ...broadcast,
        status: 'live',
        isLive: true,
        mediaState: 'audio_live',
        startedAt: new Date().toISOString(),
      };
      setSavedBroadcast(liveBroadcast);
      setCurrentLiveBroadcast(liveBroadcast);
      setElapsed(0);
      setBroadcasts((current) => current.map(
        (item) => String(item.id) === String(liveBroadcast.id) ? liveBroadcast : item
      ));
      setMessage('You are live.');
      clearPreparedBroadcast();
      window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
      console.info('[Echoo Perf] go-live', {
        prepareMs: Math.round(preparedAt - prepareStartedAt),
        liveKitConnectMs: publishResult?.connectMs ?? null,
        publishMs: publishResult?.publishMs ?? null,
        timeToLiveMs: Math.round(performance.now() - clickStartedAt),
      });

      void batch3Service.confirmBroadcastLive(broadcast.id).then((confirmed) => {
        const reconciled = confirmed?.data;
        if (!reconciled?.id) return;
        setCurrentLiveBroadcast((current) => String(current?.id) === String(broadcast.id) ? { ...current, ...reconciled } : current);
        setSavedBroadcast((current) => String(current?.id) === String(broadcast.id) ? { ...current, ...reconciled } : current);
        console.info('[Echoo Perf] confirm-live complete', { broadcastId: broadcast.id, confirmMs: Math.round(performance.now() - clickStartedAt) });
      }).catch(async (confirmError) => {
        console.warn('[Echoo Live] confirmation failed after publication:', confirmError?.message || confirmError);
        // Publication is already real at this point. Server presence may lag
        // behind LiveKit, so never tear down a listener-facing stream merely
        // because this non-critical reconciliation later fails.
        setError('You are live, but Echoo is still reconciling the server session.');
      });
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

  const requestEndBroadcast = () => {
    if (!currentLiveBroadcast?.id || ending) return;
    setError('');
    setConfirmEndOpen(true);
  };

  const endBroadcast = async () => {
    if (!currentLiveBroadcast?.id || ending || endingRequestRef.current) return;

    const broadcastId = currentLiveBroadcast.id;
    const broadcastSnapshot = currentLiveBroadcast;
    const endStartedAt = performance.now();
    try {
      endingRequestRef.current = true;
      setConfirmEndOpen(false);
      setEnding(true);
      setError('');
      setMessage('Ending broadcast…');

      // Realtime shutdown is first. Recording flush deliberately follows it.
      const backendEnd = batch3Service.endBroadcastRealtime(broadcastId);
      const unpublishStartedAt = performance.now();
      await stopLiveKitPublishing();
      setMasterMuted(false);
      markOffAir('Broadcast audio stopped. Saving your recording…');
      setEnding(false);
      console.info('[Echoo Perf] end-broadcast realtime stopped', {
        timeToUnpublishMs: Math.round(performance.now() - unpublishStartedAt),
        timeToOffAirMs: Math.round(performance.now() - endStartedAt),
      });

      void (async () => {
        const finalizeStartedAt = performance.now();
        let endedResponse = null;
        try {
          endedResponse = await backendEnd;
        } catch (backendError) {
          setError('Broadcast audio stopped, but Echoo could not finalize the server session. Retry cleanup from Broadcast settings.');
          console.warn('[Echoo Live] server end failed after local unpublish:', backendError?.message || backendError);
        }
        const recordingResult = await batch3Service.finalizeBroadcastRecording(broadcastId, endedResponse?.data || broadcastSnapshot);
        if (!recordingResult.recordingReady) {
          setError((current) => current || 'Broadcast ended, but recording finalization needs attention. Your local master is protected.');
        }
        console.info('[Echoo Perf] end-broadcast', {
          timeToOffAirMs: Math.round(performance.now() - endStartedAt),
          backendEndMs: Math.round(performance.now() - endStartedAt),
          recordingFinalizeMs: Math.round(performance.now() - finalizeStartedAt),
        });
      })();
    } catch (endError) {
      setError(endError?.message || 'Could not end the broadcast.');
      setMessage('');
    } finally {
      endingRequestRef.current = false;
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
      <section className="ec2-no-channel" aria-labelledby="ec2-no-channel-title">
        <div className="ec2-no-channel-copy">
          <span className="ec2-no-channel-eyebrow">CHANNEL SETUP</span>
          <h1 id="ec2-no-channel-title">Set up your Channel</h1>
          <p>
            Your Channel is your public home on Echoo. Listeners will find your live broadcasts, recordings and collections here.
          </p>
          <ul>
            <li><FiCheckCircle aria-hidden="true" /> Choose a Channel name and category</li>
            <li><FiCheckCircle aria-hidden="true" /> Add your artwork</li>
            <li><FiCheckCircle aria-hidden="true" /> Start broadcasting</li>
          </ul>
          <button type="button" onClick={() => onNavigate?.('Station')}>
            Set up Channel
          </button>
        </div>
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
  const heroState = ending ? 'ending' : isLive ? 'live' : 'off-air';

  return (
    <section className={`ec2-broadcast ${isLive ? 'is-live' : ''}`} aria-label="Broadcast workstation">
      <section className={`ec2-hero is-${heroState}`} aria-live="polite">
        {heroState === 'live' ? (
          <>
            <div className="ec2-live-banner">
              <span className="ec2-status-pill" aria-label="Live"><i /> LIVE</span>
              <span className="ec2-sr-only">You&apos;re broadcasting now.</span>
              <div className="ec2-live-ticker">
                <div className="ec2-live-ticker-track" aria-hidden="true">
                  {[0, 1].map((group) => (
                    <div className="ec2-live-ticker-group" key={group}>
                      {Array.from({ length: 4 }, (_, index) => (
                        <span key={index}>YOU&apos;RE BROADCASTING NOW.</span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="ec2-live-details" aria-label="Live broadcast status">
              <aside className="ec2-station-identity">
                <span>CHANNEL</span>
                <strong>{liveStation?.name || 'Your Channel'}</strong>
              </aside>
              <div className="ec2-live-identity">
                <span>CATEGORY</span>
                <strong>{liveStation?.category || 'Your Echoo Channel'}</strong>
              </div>
              <div className="ec2-live-fact"><FiRadio aria-hidden="true" /><strong>{presence.listenerCount || 0}</strong><span>listening</span></div>
              <div className={`ec2-live-fact ${mixerState?.recordingTapActive ? 'is-recording' : ''}`}><strong>{mixerState?.recordingTapActive ? 'Recording' : 'Preparing recording'}</strong></div>
              <div className="ec2-live-fact"><FiClock aria-hidden="true" /><strong>Live for {formatTimer(elapsed)}</strong></div>
              <span className={`ec2-live-connection ${connectionHealthy ? 'is-healthy' : ''}`}>
                {connectionHealthy ? 'Connected' : 'Connecting…'}
              </span>
              <button type="button" className="ec2-copy-live ec2-copy-live--hero" onClick={copyLiveLink}>
                <FiCopy /> {linkCopied ? 'Copied' : 'Copy live link'}
              </button>
            </div>
          </>
        ) : heroState === 'ending' ? (
          <>
            <div className="ec2-live-banner ec2-ending-banner">
              <span className="ec2-status-pill"><i /> ENDING</span>
              <strong>ENDING BROADCAST…</strong>
            </div>
            <div className="ec2-live-details ec2-ending-details">
              <aside className="ec2-station-identity">
                <span>CHANNEL</span>
                <strong>{liveStation?.name || 'Your Channel'}</strong>
              </aside>
              <div className="ec2-live-identity">
                <span>CATEGORY</span>
                <strong>{liveStation?.category || 'Your Echoo Channel'}</strong>
              </div>
              <span className="ec2-live-fact"><FiClock aria-hidden="true" /> {formatTimer(elapsed)}</span>
              <p>Disconnecting listeners and finalizing your recording.</p>
            </div>
          </>
        ) : (
          <>
            <div className="ec2-live-banner ec2-off-air-banner">
              <span className="ec2-status-pill" aria-label="Off air"><i /> OFF AIR</span>
              <strong>READY TO BROADCAST</strong>
            </div>
            <div className="ec2-live-details ec2-off-air-details">
              <aside className="ec2-station-identity">
                <span>CHANNEL</span>
                <strong>{liveStation?.name || 'Your Channel'}</strong>
              </aside>
              <div className="ec2-live-identity">
                <span>CATEGORY</span>
                <strong>{liveStation?.category || 'Your Echoo Channel'}</strong>
              </div>
              <span className="ec2-live-fact">Not live</span>
              <p>Connect your inputs, test your mix, and go live.</p>
            </div>
          </>
        )}
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

      {isLive && !ending && (
        <div className="ec2-live-action-panel" aria-label="Live broadcast actions">
          <button ref={endBroadcastButtonRef} type="button" className="ec2-end-live" onClick={requestEndBroadcast} disabled={ending}>
            <FiSquare /> End broadcast
          </button>
        </div>
      )}

      {confirmEndOpen && (
        <div
          className="ec2-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEndConfirmation();
          }}
        >
          <section
            ref={endBroadcastDialogRef}
            className="ec2-end-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ec2-end-dialog-title"
            aria-describedby="ec2-end-dialog-description"
          >
            <button type="button" className="ec2-dialog-close" onClick={closeEndConfirmation} aria-label="Close">
              <FiX />
            </button>
            <div className="ec2-dialog-icon is-warning"><FiAlertTriangle /></div>
            <h2 id="ec2-end-dialog-title">End broadcast?</h2>
            <p id="ec2-end-dialog-description">
              Your live broadcast will stop for everyone.<br />Your recording will be saved automatically.
            </p>
            <div className="ec2-dialog-actions">
              <button ref={keepLiveButtonRef} type="button" className="ec2-keep-live" onClick={closeEndConfirmation}>Keep live</button>
              <button type="button" className="ec2-confirm-end" onClick={endBroadcast} disabled={ending}>End broadcast</button>
            </div>
          </section>
        </div>
      )}

      {ending && (
        <div className="ec2-dialog-backdrop" role="presentation">
          <section
            ref={endingDialogRef}
            className="ec2-end-dialog ec2-ending-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ec2-ending-title"
            aria-describedby="ec2-ending-description"
            tabIndex={-1}
          >
            <FiLoader className="ec2-ending-spinner" aria-hidden="true" />
            <h2 id="ec2-ending-title">Ending broadcast…</h2>
            <p id="ec2-ending-description">Please wait while we disconnect your live session and save your recording.</p>
          </section>
        </div>
      )}
    </section>
  );
};

export default CreatorLiveConnectedWorkspace;
