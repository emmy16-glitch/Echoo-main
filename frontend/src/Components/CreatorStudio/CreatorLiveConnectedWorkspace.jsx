import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBroadcastTower,
  FaCalendarAlt,
  FaCheck,
  FaClock,
  FaDownload,
  FaMicrophone,
  FaPause,
  FaPlay,
  FaSave,
  FaShareAlt,
  FaStop,
  FaTimesCircle,
  FaTrash,
} from 'react-icons/fa';

import EchoWave from '../EchooSystem/EchoWave';
import CreatorBroadcastAudioSurface from './CreatorBroadcastAudioSurface';
import CreatorLiveChatPanel from './CreatorLiveChatPanel';
import CreatorLiveInsights from './CreatorLiveInsights';
import CreatorBroadcastProcessing from './CreatorBroadcastProcessing';
import batch2Service from '../../services/batch2Service';
import batch3Service from '../../services/batch3Service';
import {
  getEchooMixerOutputTrack,
  getEchooMixerState,
  ensureHostInput,
  resetEchooMixer,
  setMasterMuted,
  setCreatorAudioSettings,
  stopEchooMixer,
} from '../../services/echooMixerService';
import {
  DEFAULT_CREATOR_AUDIO_SETTINGS,
  saveCreatorAudioSettings,
} from '../../services/creatorAudioPreferences';
import {
  getLiveKitPublishingState,
  setLiveKitPublishingPaused,
  startLiveKitPublishing,
  stopLiveKitPublishing,
} from '../../services/livekitPublisher';
import { getWhisperFlowState } from '../../services/whisperFlowService';
import { getBroadcastRecordingState } from '../../services/broadcastRecordingService';
import transcriptService from '../../services/transcriptService';
import realtimeService from '../../services/realtimeService';
import settingsService from '../../services/settingsService';
import './CreatorBroadcastStudioExact.css';
import './CreatorLiveBroadcastConsole.css';
import './CreatorBroadcastStudioV2.css';
import './CreatorBroadcastProcessing.css';

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

const buildAudioSnapshot = (state) => {
  const settings = state?.processing?.settings || DEFAULT_CREATOR_AUDIO_SETTINGS;
  const sourceDefinitions = [
    ['host', 'microphone', 'Host microphone'],
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
        label: source.label || fallbackLabel,
        gain: Math.max(0, Math.min(1.5, Number(source.gain) || 0)),
      };
    }),
  };
};

const CreatorLiveConnectedWorkspace = ({
  studioName = 'Creator',
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
  const [processingBroadcast, setProcessingBroadcast] = useState(null);
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false);
  const [presence, setPresence] = useState({
    listenerCount: 0,
    peakListeners: 0,
    creatorConnected: false,
  });
  const [mixerState, setMixerState] = useState(() => getEchooMixerState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [ending, setEnding] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [publisherHealth, setPublisherHealth] = useState(() => getLiveKitPublishingState());
  const [whisperHealth, setWhisperHealth] = useState(() => getWhisperFlowState());
  const [recordingHealth, setRecordingHealth] = useState(() => getBroadcastRecordingState());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [transcriptPreferences, setTranscriptPreferences] = useState({
    language: 'en',
  });
  const [transcriptionReadiness, setTranscriptionReadiness] = useState({
    status: 'checking',
    providerReady: false,
    model: 'faster-whisper-large-v3-turbo',
  });

  const clearPreparedBroadcast = useCallback(() => {
    sessionStorage.removeItem('echooPreparedBroadcastId');
    onClearPreparedBroadcast?.();
  }, [onClearPreparedBroadcast]);

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

        const interruptedStart =
          realBroadcasts.find((item) => item.status === 'starting') || null;

        if (interruptedStart) {
          setSavedBroadcast(interruptedStart);
          setStationId(interruptedStart.stationId || '');
          setTitle(interruptedStart.title || '');
          setDescription(interruptedStart.description || '');
          setMode('now');
          sessionStorage.setItem('echooPreparedBroadcastId', String(interruptedStart.id));
          sessionStorage.setItem('echooBroadcastMode', 'now');
          setMessage('Live start was interrupted. Test your microphone, then resume going live.');
          return;
        }

        const unfinishedProcessing = realBroadcasts.find((item) =>
          item.status === 'completed' && (
            ['pending', 'processing'].includes(item.assetStatus?.audio) ||
            ['processing', 'ready_for_review', 'editing'].includes(item.assetStatus?.transcript)
          )
        );
        if (unfinishedProcessing) {
          setProcessingBroadcast(unfinishedProcessing);
          setSavedBroadcast(unfinishedProcessing);
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
  }, [preparedBroadcastId, clearPreparedBroadcast]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([settingsService.get(), transcriptService.getReadiness()]).then((results) => {
      if (!active) return;
      const settings = results[0].status === 'fulfilled'
        ? results[0].value?.data?.preferences?.creatorTranscript
        : null;
      if (settings) setTranscriptPreferences({
        language: settings.language || 'en',
      });
      const readiness = results[1].status === 'fulfilled' ? results[1].value?.data : null;
      setTranscriptionReadiness(readiness || {
        status: 'unavailable', providerReady: false, model: 'medium',
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!stations.length) return;
    const stationExists = stations.some((station) => String(station.id) === String(stationId));
    if (!stationExists) setStationId(stations[0].id);
  }, [stations, stationId]);

  useEffect(() => {
    const onPublisherHealth = (event) => setPublisherHealth(event.detail);
    const onWhisperHealth = (event) => setWhisperHealth(event.detail);
    window.addEventListener('echoo:publisher-health', onPublisherHealth);
    window.addEventListener('echoo:whisper-health', onWhisperHealth);
    return () => {
      window.removeEventListener('echoo:publisher-health', onPublisherHealth);
      window.removeEventListener('echoo:whisper-health', onWhisperHealth);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setRecordingHealth(getBroadcastRecordingState()), 1500);
    return () => window.clearInterval(timer);
  }, []);

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
    if (!currentLiveBroadcast?.id) return undefined;
    let active = true;
    let socket = null;

    realtimeService.joinBroadcast(currentLiveBroadcast.id).then((connectedSocket) => {
      if (!active) return;
      socket = connectedSocket;
      const onStatus = (payload) => {
        if (String(payload?.broadcastId) !== String(currentLiveBroadcast.id)) return;
        setCurrentLiveBroadcast((current) => current ? { ...current, ...payload } : current);
        setPresence((current) => ({
          ...current,
          listenerCount: Number(payload.listenerCount ?? current.listenerCount) || 0,
          peakListeners: Number(payload.peakListeners ?? current.peakListeners) || 0,
        }));
        console.info('[Echoo Broadcast] creator received authoritative state', payload);
      };
      const onTranscriptStatus = (payload) => {
        if (String(payload?.broadcastId) !== String(currentLiveBroadcast.id)) return;
        setWhisperHealth((current) => ({ ...current, status: payload?.state || current.status }));
      };
      const onPresence = (payload) => {
        if (payload?.broadcastId && String(payload.broadcastId) !== String(currentLiveBroadcast.id)) return;
        setPresence((current) => ({ ...current, ...payload }));
      };
      connectedSocket.on('broadcast:status', onStatus);
      connectedSocket.on('transcript:status', onTranscriptStatus);
      connectedSocket.on('presence:changed', onPresence);
      onStatus(connectedSocket.__echooBroadcastSnapshots?.get(String(currentLiveBroadcast.id)));
      socket.__echooCreatorHealthCleanup = () => {
        connectedSocket.off('broadcast:status', onStatus);
        connectedSocket.off('transcript:status', onTranscriptStatus);
        connectedSocket.off('presence:changed', onPresence);
      };
    }).catch((realtimeError) => {
      console.warn('[Echoo Broadcast] realtime health unavailable; presence polling continues:', realtimeError?.message || realtimeError);
    });

    return () => {
      active = false;
      socket?.__echooCreatorHealthCleanup?.();
      realtimeService.leaveBroadcast(currentLiveBroadcast.id).catch(() => {});
    };
  }, [currentLiveBroadcast?.id]);

  useEffect(() => {
    if (!currentLiveBroadcast?.id) return undefined;

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
  const audioSourceReady = Boolean(
    mixerState?.channels?.host?.connected ||
    mixerState?.channels?.guest?.connected ||
    mixerState?.channels?.media?.connected ||
    mixerState?.channels?.screen?.connected
  );
  const formReady = Boolean(stationId && title.trim());
  const setupReady = formReady && audioSourceReady;

  useEffect(() => {
    if (!selectedStation || savedBroadcast?.id || title.trim()) return;
    setTitle(selectedStation.name || '');
    setDescription(selectedStation.description || '');
  }, [savedBroadcast?.id, selectedStation, title]);

  const updateTranscriptPreference = async (key, value) => {
    const next = { ...transcriptPreferences, [key]: value };
    setTranscriptPreferences(next);
    try {
      await settingsService.updatePreferences({ creatorTranscript: next });
      setMessage('Transcript setup saved.');
    } catch (preferenceError) {
      setError(preferenceError?.message || 'Could not save transcript setup.');
    }
  };

  const resetSetup = async () => {
    setError('');
    setMessage('Setup reset to Echoo defaults.');
    setMode('now');
    setSavedBroadcast(null);
    setTitle(selectedStation?.name || '');
    setDescription(selectedStation?.description || '');
    setDetailsOpen(false);
    clearPreparedBroadcast();
    resetEchooMixer();
    await setCreatorAudioSettings(DEFAULT_CREATOR_AUDIO_SETTINGS);
    await saveCreatorAudioSettings(DEFAULT_CREATOR_AUDIO_SETTINGS).catch(() => null);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    sessionStorage.setItem('echooBroadcastMode', nextMode);
    setMessage('');
    setError('');
  };

  const prepareImmediateBroadcast = async () => {
    const audioSnapshot = buildAudioSnapshot(getEchooMixerState());
    if (savedBroadcast?.id && savedBroadcast.status !== 'live') {
      try {
        const response = await batch2Service.updateBroadcast(savedBroadcast.id, {
          title: title.trim(),
          description: description.trim(),
          captionSettings: {
            showToListeners: false,
            language: transcriptPreferences.language,
          },
          ...audioSnapshot,
        });
        return response?.data || savedBroadcast;
      } catch (updateError) {
        if (!isMissingBroadcastError(updateError)) throw updateError;

        setSavedBroadcast(null);
        setBroadcasts((current) =>
          current.filter((item) => String(item.id) !== String(savedBroadcast.id))
        );
        clearPreparedBroadcast();
      }
    }

    const start = new Date(Date.now() + 10 * 60 * 1000);
    const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
    const writableStation =
      stations.find((station) => String(station.id) === String(stationId)) ||
      stations[0] ||
      null;

    if (!writableStation?.id) {
      throw new Error('Create a station before starting a broadcast.');
    }

    if (String(writableStation.id) !== String(stationId)) {
      setStationId(writableStation.id);
    }

    const response = await batch2Service.createBroadcast({
      title: title.trim(),
      description: description.trim(),
      stationId: writableStation.id,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      type: 'live',
      isRecurring: false,
      isPublic: true,
      tags: [],
      coverArt: writableStation.coverArt || null,
      captionSettings: {
        showToListeners: false,
        language: transcriptPreferences.language,
      },
      ...audioSnapshot,
    });

    if (!response?.data?.id) throw new Error('Could not prepare this broadcast.');
    setSavedBroadcast(response.data);
    setBroadcasts((current) => [...current, response.data]);
    return response.data;
  };

  const saveDraft = async () => {
    if (!formReady || saving) {
      setError('Choose a station and add a broadcast title before saving.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      await prepareImmediateBroadcast();
      setMessage('Draft saved to your account.');
    } catch (draftError) {
      setError(draftError?.message || 'Could not save this draft.');
    } finally {
      setSaving(false);
    }
  };

  const goLive = async () => {
    if (goingLive || currentLiveBroadcast) return;
    if (!formReady) return setError('Choose a station and add a broadcast title.');
    if (!audioSourceReady) return setError('Connect at least one audio source before going live.');

    const mediaTrack = getEchooMixerOutputTrack();
    if (!mediaTrack) return setError('The studio mixer output is not ready.');

    let broadcast = null;
    let backendStarted = false;

    try {
      setGoingLive(true);
      setError('');
      setMessage('Opening your live room...');

      broadcast = await prepareImmediateBroadcast();

      let connection = null;
      if (broadcast.status === 'starting') {
        connection = await batch3Service.getLiveKitToken(broadcast.id);
        backendStarted = true;
        setMessage('Reconnecting to your prepared live room...');
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
      });

      let confirmed = null;
      try {
        confirmed = await batch3Service.confirmBroadcastLive(broadcast.id);
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        confirmed = await batch3Service.confirmBroadcastLive(broadcast.id);
      }

      const liveBroadcast = confirmed?.data || { ...broadcast, status: 'live', isLive: true };

      console.info('[Echoo Broadcast] creator observed live state', {
        broadcastId: liveBroadcast.id,
        status: liveBroadcast.status,
        mediaState: liveBroadcast.mediaState,
      });

      setSavedBroadcast(liveBroadcast);
      setCurrentLiveBroadcast(liveBroadcast);
      setElapsed(0);
      setBroadcasts((current) =>
        current.map((item) => item.id === liveBroadcast.id ? liveBroadcast : item)
      );
      setMessage('You are live.');
      clearPreparedBroadcast();
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
        captionSettings: {
          showToListeners: false,
          language: transcriptPreferences.language,
        },
        ...buildAudioSnapshot(getEchooMixerState()),
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
      if (!audioSourceReady) {
        await ensureHostInput();
        setMixerState(getEchooMixerState());
      }
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

  const toggleBroadcastPause = async () => {
    if (!currentLiveBroadcast?.id || pausing) return;
    const paused = currentLiveBroadcast.mediaState === 'audio_paused';
    try {
      setPausing(true);
      setError('');
      // Pause the post-master program itself so LiveKit, recording and Whisper
      // observe the same silence and remain synchronized.
      setMasterMuted(!paused);
      await setLiveKitPublishingPaused(!paused);
      const response = paused
        ? await batch3Service.resumeBroadcast(currentLiveBroadcast.id)
        : await batch3Service.pauseBroadcast(currentLiveBroadcast.id);
      setCurrentLiveBroadcast(response?.data || {
        ...currentLiveBroadcast,
        mediaState: paused ? 'audio_live' : 'audio_paused',
      });
      setMessage(paused ? 'Broadcast audio resumed.' : 'Broadcast audio paused.');
    } catch (pauseError) {
      setMasterMuted(paused);
      await setLiveKitPublishingPaused(paused).catch(() => null);
      setError(pauseError?.message || 'Could not change the broadcast audio state.');
    } finally {
      setPausing(false);
    }
  };

  const endBroadcast = async () => {
    if (!currentLiveBroadcast?.id || ending) return;

    try {
      setEnding(true);
      setError('');
      setEndConfirmationOpen(false);

      const endedResponse = await batch3Service.endBroadcast(currentLiveBroadcast.id);
      const endedBroadcast = endedResponse?.data || currentLiveBroadcast;

      const cleanupWarnings = [];
      try {
        await stopLiveKitPublishing();
      } catch (cleanupError) {
        cleanupWarnings.push(cleanupError?.message || 'LiveKit cleanup failed.');
      }

      try {
        await stopEchooMixer();
      } catch (cleanupError) {
        cleanupWarnings.push(cleanupError?.message || 'Mixer cleanup failed.');
      }

      setBroadcasts((current) => current.map((item) =>
        item.id === currentLiveBroadcast.id
          ? { ...item, ...endedBroadcast, status: endedBroadcast.status || 'completed' }
          : item
      ));
      setProcessingBroadcast({
        ...currentLiveBroadcast,
        ...endedBroadcast,
        status: endedBroadcast.status || 'completed',
      });
      setCurrentLiveBroadcast(null);
      setSavedBroadcast(null);
      setElapsed(0);
      setPresence({ listenerCount: 0, peakListeners: 0, creatorConnected: false });
      setMixerState(getEchooMixerState());
      setTitle('');
      setDescription('');
      setMessage('Broadcast ended.');
      clearPreparedBroadcast();

      if (cleanupWarnings.length) {
        setError(`Broadcast ended, but local cleanup reported: ${cleanupWarnings.join(' ')}`);
      }
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

  const exportTranscript = async () => {
    if (!currentLiveBroadcast?.id) return;
    try {
      const response = await transcriptService.getBroadcast(currentLiveBroadcast.id, { final: true, limit: 200 });
      const lines = (response?.data || []).map((segment) => `${formatTimer((segment.startMs || 0) / 1000)}  ${segment.speaker || 'Creator'}\n${segment.text}`).join('\n\n');
      const blob = new Blob([lines || 'No confirmed transcript is available yet.'], { type: 'text/plain;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `echoo-${currentLiveBroadcast.id}-transcript.txt`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (downloadError) {
      setError(downloadError?.message || 'Could not export the transcript.');
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

  if (processingBroadcast) {
    return <CreatorBroadcastProcessing broadcast={processingBroadcast} onStartAnother={() => {
      setProcessingBroadcast(null);
      setSavedBroadcast(null);
      setTitle(selectedStation?.name || '');
      setDescription(selectedStation?.description || '');
      clearPreparedBroadcast();
      setMessage('');
      setError('');
    }} />;
  }

  if (currentLiveBroadcast) {
    const liveStation = stations.find(
      (station) => String(station.id) === String(currentLiveBroadcast.stationId)
    ) || selectedStation;
    const liveKitLabel = publisherHealth.livekit === 'connected' ? 'Connected' : publisherHealth.livekit || 'Disconnected';
    const audioLabel = currentLiveBroadcast.mediaState === 'audio_paused' || publisherHealth.audio === 'paused'
      ? 'Paused'
      : currentLiveBroadcast.mediaState === 'audio_live' || publisherHealth.audio === 'published'
      ? 'Published'
      : currentLiveBroadcast.mediaState === 'creator_connecting'
        ? 'Connecting'
        : 'Disconnected';
    const whisperLabel = currentLiveBroadcast.transcriptState === 'disabled' && whisperHealth.status === 'disabled'
      ? 'Disabled'
      : whisperHealth.status === 'connected' || currentLiveBroadcast.transcriptState === 'connected'
        ? 'Connected'
        : whisperHealth.status === 'reconnecting' || currentLiveBroadcast.transcriptState === 'reconnecting'
          ? 'Reconnecting'
          : whisperHealth.status === 'failed' || currentLiveBroadcast.transcriptState === 'failed'
            ? 'Unavailable'
            : 'Connecting';
    const connectionHealthy = liveKitLabel === 'Connected' && audioLabel === 'Published';

    return (
      <section className="ebsx ecbs ecbs-live-page">
        <section className="ecbs-live-hero">
          <header><div><span className="ecbs-live-dot" /> <strong>LIVE NOW</strong><small>You&apos;re broadcasting to your listeners.</small></div><div className="ecbs-hero-timer"><span><EchoWave state="playing" /></span><small>Elapsed time</small><strong>{formatTimer(elapsed)}</strong></div></header>
          <div className="ecbs-live-hero-body">
            <div className="ecbs-live-art">{liveStation?.coverArt ? <img src={liveStation.coverArt} alt="" /> : <FaBroadcastTower />}</div>
            <div className="ecbs-live-identity"><h1>{currentLiveBroadcast.title}</h1><p>with {studioName}</p><div><span>Public</span><span className={connectionHealthy ? 'good' : ''}><i /> {connectionHealthy ? 'Good connection' : 'Checking connection'}</span></div></div>
            <dl><div><dt>{presence.listenerCount || 0}</dt><dd>Listeners now</dd></div><div><dt>{presence.peakListeners || 0}</dt><dd>Peak listeners</dd></div><div><dt className={connectionHealthy ? 'good' : ''}>{connectionHealthy ? 'Excellent' : 'Checking'}</dt><dd>Connection quality</dd></div></dl>
            <div className="ecbs-live-actions"><button type="button" onClick={shareBroadcast}><FaShareAlt /> Share</button><button type="button" onClick={toggleBroadcastPause} disabled={pausing}>{audioLabel === 'Paused' ? <FaPlay /> : <FaPause />} {pausing ? 'Updating...' : audioLabel === 'Paused' ? 'Resume' : 'Pause'}</button><button type="button" onClick={exportTranscript}><FaDownload /> Export transcript</button><button type="button" className="danger" onClick={() => setEndConfirmationOpen(true)} disabled={ending}><FaStop /> {ending ? 'Ending...' : 'End broadcast'}</button></div>
          </div>
        </section>

        {(message && message !== 'You are live.') && <div className="ebsx-message success">{message}</div>}
        {error && <div className="ebsx-message error">{error}</div>}

        <section className="ecbs-health-bar">
          <article className={audioLabel === 'Published' ? 'healthy' : ''}><i /><div><strong>Audio {audioLabel}</strong><small>{audioLabel === 'Published' ? 'Audience mix is live' : audioLabel === 'Paused' ? 'Program track is muted' : 'Reconnect the studio mix'}</small></div></article>
          <article className={liveKitLabel === 'Connected' ? 'healthy' : ''}><i /><div><strong>LiveKit {liveKitLabel}</strong><small>Real-time streaming</small></div></article>
          <article className={whisperLabel === 'Connected' ? 'healthy' : ''}><i /><div><strong>Transcript {whisperLabel}</strong><small>Background draft processing</small></div></article>
          <article className={recordingHealth.recording ? 'healthy' : ''}><i /><div><strong>Recording {recordingHealth.recording ? 'Active' : 'Checking'}</strong><small>{recordingHealth.recording ? 'Saving the audience mix' : 'Local recording status'}</small></div></article>
          <article className={mixerState?.channels?.screen?.connected ? 'healthy' : ''}><i /><div><strong>Screen/Tab {mixerState?.channels?.screen?.connected ? 'Active' : 'Inactive'}</strong><small>{mixerState?.channels?.screen?.connected ? 'Shared audio is in the mix' : 'No shared audio'}</small></div></article>
          <button type="button" onClick={reconnectMicrophone} disabled={goingLive}><FaMicrophone /> {goingLive ? 'Reconnecting...' : 'Reconnect'}</button>
        </section>

        <div className="ecbs-live-grid">
          <main><CreatorBroadcastAudioSurface variant="live" onStateChange={setMixerState} /></main>
          <aside><CreatorLiveChatPanel broadcastId={currentLiveBroadcast.id} listenerCount={presence.listenerCount} /><CreatorLiveInsights broadcastId={currentLiveBroadcast.id} presence={presence} onOpenAnalytics={() => onNavigate?.('Analytics')} /></aside>
        </div>
        {endConfirmationOpen && <div className="ecbs-end-dialog" role="presentation" onMouseDown={() => setEndConfirmationOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="end-broadcast-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="end-broadcast-title">End Broadcast?</h2>
            <p>Your live session will end for listeners.</p>
            <ul><li>Recording will be saved</li><li>Transcript will continue processing</li><li>Highlights will be generated</li><li>You can publish when ready</li></ul>
            <footer><button type="button" onClick={() => setEndConfirmationOpen(false)}>Cancel</button><button type="button" className="danger" onClick={endBroadcast} disabled={ending}><FaStop /> {ending ? 'Ending...' : 'End Broadcast'}</button></footer>
          </section>
        </div>}
      </section>
    );
  }

  return (
    <section className="ebsx setup-page">
      <header className="ebsx-setup-header ecbs-setup-title">
        <div><span>BROADCAST STUDIO</span><h1>Get ready to <strong>go live</strong></h1><p>You&apos;re almost live. Complete the steps to share your voice with the world.</p></div>
        <div><button type="button" onClick={saveDraft} disabled={saving}><FaSave /> {saving ? 'Saving...' : 'Save draft'}</button><button type="button" onClick={resetSetup}><FaClock /> Reset setup</button></div>
      </header>

      <div className={`ecbs-studio-status ${setupReady ? 'ready' : 'attention'}`}>
        {setupReady ? <FaCheck /> : <FaMicrophone />}
        <strong>{setupReady ? 'Studio ready.' : 'Setup needs attention.'}</strong>
        <span>{setupReady ? 'Finish the final checks before you go live.' : !formReady ? 'Choose a station and complete the broadcast details.' : 'Connect at least one audio source before you go live.'}</span>
      </div>
      {message && <div className="ebsx-message success">{message}</div>}
      {error && <div className="ebsx-message error">{error}</div>}

      <div className="ebsx-setup-layout">
        <main className="ebsx-setup-main">
          <section className="ebsx-station-hero ecbs-station-card">
            <b className="ecbs-section-number">1</b>
            <div className="ebsx-station-art">
              {selectedStation?.coverArt ? <img src={selectedStation.coverArt} alt="" /> : <FaBroadcastTower />}
            </div>
            <div className="ebsx-station-copy">
              <span>READY TO BROADCAST <FaCheck /></span>
              <h2>{selectedStation?.name || 'Choose a station'}</h2>
              <p>{selectedStation?.category || 'Station'} · {studioName}</p>
              <small>{Number(selectedStation?.followerCount || 0).toLocaleString()} followers · {selectedStation?.isLive ? 'Live now' : 'Ready'}</small>
            </div>
            <div className="ecbs-station-actions"><button type="button" className="ecbs-change-station" onClick={() => onNavigate?.('Stations')}>Change station</button><button type="button" className="ecbs-change-station" onClick={() => setDetailsOpen((value) => !value)}>Edit broadcast details</button></div>
          </section>

          {detailsOpen && <section className="ecbs-broadcast-details"><header><b>2</b><div><h2>Broadcast details</h2><p>Set the title and description listeners will see.</p></div></header><label>Title<input value={title} maxLength={200} placeholder="Broadcast title" onChange={(event) => { setTitle(event.target.value); setSavedBroadcast(null); }} /></label><label>Description<textarea value={description} maxLength={2000} placeholder="Describe this broadcast" onChange={(event) => setDescription(event.target.value)} /></label></section>}

          <CreatorBroadcastAudioSurface variant="setup" showMonitoring={false} onStateChange={setMixerState} />
        </main>

        <aside className="ecbs-setup-rail">
          <CreatorBroadcastAudioSurface variant="monitor" onStateChange={setMixerState} />

          <section className="ecbs-transcript-ready-card"><header><b>6</b><div><h2>Transcript readiness</h2><p>A private draft will be prepared from the final studio mix.</p></div><span className={transcriptionReadiness.providerReady ? 'ready' : 'waiting'}>{transcriptionReadiness.status === 'checking' ? 'Checking' : transcriptionReadiness.providerReady ? 'Ready' : 'Unavailable'}</span></header><label>Language<select value={transcriptPreferences.language} onChange={(event) => updateTranscriptPreference('language', event.target.value)}><option value="en">English</option><option value="yo">Yoruba</option><option value="pcm">Nigerian Pidgin</option><option value="ha">Hausa</option></select></label><small>{transcriptionReadiness.providerReady ? `${transcriptionReadiness.model} is ready to prepare a private transcript draft.` : 'Live audio continues even when transcription is unavailable.'}</small></section>

          <section className="ebsx-planned-card ecbs-planned-rail">
            <div className="ebsx-section-title"><div><span>UPCOMING</span><h2>Planned broadcasts</h2><p>Scheduled sessions return to this studio.</p></div><button type="button" onClick={() => changeMode(mode === 'later' ? 'now' : 'later')}><FaCalendarAlt /> {mode === 'later' ? 'Close' : 'Schedule for later'}</button></div>
            {mode === 'later' && <div className="ecbs-schedule-form"><div><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div><label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="240">4 hours</option></select></label></div>}
            {planned.length ? <div className="ebsx-planned-list">{planned.slice(0, 3).map((broadcast) => <article key={broadcast.id}><div><span>SCHEDULED</span><h3>{broadcast.title}</h3><p><FaClock /> {formatDateTime(broadcast.startTime)}</p></div><div><button type="button" className="primary" onClick={() => enterScheduled(broadcast)}><FaMicrophone /></button><button type="button" disabled={actionId === broadcast.id} onClick={() => cancelBroadcast(broadcast)}><FaTimesCircle /></button><button type="button" className="danger" disabled={actionId === broadcast.id} onClick={() => deleteBroadcast(broadcast)}><FaTrash /></button></div></article>)}</div> : <div className="ebsx-empty-line"><FaCalendarAlt /> Nothing scheduled yet.</div>}
          </section>
        </aside>
      </div>

      <footer className="ecbs-setup-action"><div>{setupReady ? <FaCheck /> : <FaMicrophone />}<span><strong>{setupReady ? 'Ready to broadcast' : 'Complete your setup'}</strong><small>{setupReady ? `${microphoneReady ? 'Microphone' : 'Shared/media audio'} and studio mix are ready.` : !formReady ? 'Choose a station and complete broadcast details.' : 'Connect at least one audio source before going live.'}</small></span></div><button type="button" className="ebsx-blue-button" onClick={mode === 'later' ? scheduleBroadcast : goLive} disabled={mode === 'later' ? (!formReady || saving || !date || !time) : (!setupReady || goingLive || saving)}>{mode === 'later' ? <FaCalendarAlt /> : <FaBroadcastTower />} {mode === 'later' ? (saving ? 'Scheduling...' : 'Schedule broadcast') : (goingLive || saving ? 'Starting...' : savedBroadcast?.status === 'starting' ? 'Resume going live' : 'Go live now')}</button></footer>
    </section>
  );
};

export default CreatorLiveConnectedWorkspace;
