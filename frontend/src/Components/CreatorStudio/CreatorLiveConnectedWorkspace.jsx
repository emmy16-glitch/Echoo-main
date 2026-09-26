import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertTriangle,
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
  toggleMasterMute,
} from '../../services/echooMixerService';
import { DEFAULT_CREATOR_AUDIO_SETTINGS } from '../../services/creatorAudioPreferences';
import {
  getRealtimeAudioProfile,
  getSavedRealtimeAudioProfile,
  normalizeRealtimeAudioProfile,
  saveRealtimeAudioProfile,
} from '../../services/realtimeAudioQuality';
import {
  getLiveKitPublishingState,
  retryLiveKitPublishingRecovery,
  startLiveKitPublishing,
  stopLiveKitPublishing,
} from '../../services/livekitPublisher';
import realtimeService from '../../services/realtimeService';
import { prepareEndBroadcastDeviceSave } from '../../services/recordingAutosave';
import {
  formatElapsedTime,
  transferProgressText,
  updateTransferEstimate,
} from '../../services/progressTiming';
import { notifyDesktop, onDesktopRoomCommand, setDesktopRoomState } from '../../services/desktopBridge';
import './CreatorBroadcastApproved.css';

const pad = (value) => String(value).padStart(2, '0');
const RECORDING_UPLOAD_EVENT = 'echoo:recording-upload';
const RECORDING_FINALIZATION_WARNING =
  'Broadcast ended, but recording finalization needs attention. Your local master is protected.';

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
      audioMode: settings.audioMode === 'enhanced' ? 'enhanced' : 'raw',
      noiseReduction: percentToRatio(settings.noiseReduction, 0),
      echoRemoval: settings.echoRemoval === true,
      voiceWarmth: percentToRatio(settings.voiceWarmth, 0),
      voiceClarity: percentToRatio(settings.voiceClarity, 0),
      deEsser: percentToRatio(settings.deEsser, 0),
      volumeBalance: percentToRatio(settings.volumeBalance, 0),
      protectLoudSounds: settings.protectLoudSounds === true,
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
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const [bootstrapError, setBootstrapError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [goingLive, setGoingLive] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [recordingProgress, setRecordingProgress] = useState(null);
  const [sessionOperation, setSessionOperation] = useState(null);
  const endBroadcastButtonRef = useRef(null);
  const endBroadcastDialogRef = useRef(null);
  const endingDialogRef = useRef(null);
  const keepLiveButtonRef = useRef(null);
  const endingRequestRef = useRef(false);
  const offAirNoticeTimeoutRef = useRef(null);
  // Baseline for desktop "new listener joined" alerts. Reset when the
  // broadcast ends so the next session starts clean.
  const lastListenerCountRef = useRef(null);

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
    lastListenerCountRef.current = null;
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
        setLoadingElapsed(0);
        setBootstrapError('');
        const [stationResult, broadcastResult] = await Promise.all([
          batch2Service.getMyStations({ timeoutMs: 10_000 }),
          batch3Service.getCreatorBroadcasts({ timeoutMs: 10_000 }),
        ]);
        if (!active) return;

        const realStations = Array.isArray(stationResult?.data) ? stationResult.data : [];
        const realBroadcasts = Array.isArray(broadcastResult?.data) ? broadcastResult.data : [];
        setStations(realStations);
        setBroadcasts(realBroadcasts);

        const activeBroadcast = realBroadcasts.find(
          (item) => item.status === 'live'
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

        // An ending row means listeners are already meant to be off air.
        // Never trap the creator in a full-screen ending/loading state while
        // cleanup or recording recovery continues behind the scenes.
        const endingBroadcast = realBroadcasts.find(
          (item) => item.status === 'ending'
        ) || null;
        if (endingBroadcast) {
          setCurrentLiveBroadcast(null);
          setSavedBroadcast(null);
          setStationId(realStations[0]?.id || '');
          setTitle(realStations[0]?.name || endingBroadcast.title || '');
          setDescription(realStations[0]?.description || endingBroadcast.description || '');
          clearPreparedBroadcast();
          setMessage('Broadcast ended. Your recording is being prepared in the background.');
          void batch3Service.recoverBroadcast(endingBroadcast.id).then(() => {
            window.dispatchEvent(new CustomEvent('echoo:creator-state-changed'));
          }).catch((recoveryError) => {
            console.warn('[Echoo Live] background end recovery delayed:', recoveryError?.message || recoveryError);
          });
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
        if (active) {
          setBootstrapError(
            loadError?.code === 'REQUEST_TIMEOUT'
              ? 'Echoo did not respond within 10 seconds. Your studio is safe; retry the connection.'
              : loadError?.message || 'Could not load Broadcast Studio.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [preparedBroadcastId, clearPreparedBroadcast, onNavigate, loadAttempt]);

  useEffect(() => {
    if (!loading) return undefined;
    const startedAt = Date.now();
    const tick = () => setLoadingElapsed(
      Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [loading, loadAttempt]);

  useEffect(() => {
    const onPublisherHealth = (event) => setPublisherHealth(event.detail);
    window.addEventListener('echoo:publisher-health', onPublisherHealth);
    return () => window.removeEventListener('echoo:publisher-health', onPublisherHealth);
  }, []);

  useEffect(() => {
    const onRecordingUpload = (event) => {
      const detail = event?.detail || {};
      const status = String(detail.status || '');

      if (status === 'started') {
        setSessionOperation(null);
        setRecordingProgress({
          key: detail.key,
          title: detail.title || 'Broadcast recording',
          stage: 'preparing',
          startedAt: Date.now(),
          elapsedSeconds: 0,
          percent: 0,
          loaded: 0,
          total: 0,
        });
        if (!currentLiveBroadcast?.id) {
          setMessage('Recording is safe. Finishing your Echoo recording…');
        }
        return;
      }

      if (status === 'device-saving') {
        setRecordingProgress({
          key: detail.key,
          title: detail.title || 'Broadcast recording',
          stage: 'device-saving',
          format: detail.format || 'mp3',
          startedAt: Date.now(),
          elapsedSeconds: 0,
          percent: 0,
          loaded: 0,
          total: 0,
        });
        return;
      }

      if (status === 'device-progress') {
        setRecordingProgress((current) => {
          if (current?.key && detail.key && current.key !== detail.key) return current;
          return {
            ...(current || {}),
            key: detail.key || current?.key,
            title: detail.title || current?.title || 'Broadcast recording',
            stage: 'device-saving',
            format: detail.format || current?.format || 'mp3',
            percent: Math.max(0, Math.min(100, Number(detail.percent) || 0)),
            startedAt: current?.startedAt || Date.now(),
          };
        });
        return;
      }

      if (status === 'finalizing') {
        setRecordingProgress((current) => ({
          ...(current || {}),
          key: detail.key || current?.key,
          title: detail.title || current?.title || 'Broadcast recording',
          stage: 'finalizing',
          localSaved: Boolean(detail.localSaved || detail.localCopy?.saved),
          startedAt: current?.startedAt || Date.now(),
        }));
        return;
      }

      if (status === 'progress') {
        setRecordingProgress((current) => {
          if (current?.key && detail.key && current.key !== detail.key) return current;
          const next = updateTransferEstimate(current, {
            loaded: detail.loaded || 0,
            total: detail.total || current?.total || 0,
          });
          return {
            ...(current || {}),
            ...next,
            key: detail.key || current?.key,
            title: detail.title || current?.title || 'Broadcast recording',
            stage: next.percent >= 100 ? 'verifying' : 'uploading',
          };
        });
        return;
      }

      if (status === 'done') {
        setError((current) => current === RECORDING_FINALIZATION_WARNING ? '' : current);
        setRecordingProgress((current) => current
          ? { ...current, stage: 'done', percent: 100, completedAt: Date.now() }
          : null);
        window.clearTimeout(offAirNoticeTimeoutRef.current);
        setMessage('Recording saved safely to Recordings.');
        offAirNoticeTimeoutRef.current = window.setTimeout(() => {
          setMessage('');
          setRecordingProgress(null);
        }, 4200);
        return;
      }

      if (status === 'recovered') {
        setRecordingProgress({
          key: detail.key || 'recovered',
          title: detail.title || 'Recovered recording',
          stage: 'recovered',
          startedAt: Date.now(),
          elapsedSeconds: 0,
          percent: 0,
          loaded: 0,
          total: 0,
        });
        if (!currentLiveBroadcast?.id) {
          setMessage('A protected recording was recovered. Echoo will keep it until the saved recording is finished.');
        }
        return;
      }

      if (status === 'error') {
        setRecordingProgress((current) => ({
          ...(current || {}),
          key: detail.key || current?.key,
          title: detail.title || current?.title || 'Broadcast recording',
          stage: navigator.onLine === false ? 'waiting-network' : 'error',
          message: detail.message || RECORDING_FINALIZATION_WARNING,
          failedAt: Date.now(),
        }));
        setError(detail.message || RECORDING_FINALIZATION_WARNING);
      }
    };

    window.addEventListener(RECORDING_UPLOAD_EVENT, onRecordingUpload);
    return () => window.removeEventListener(RECORDING_UPLOAD_EVENT, onRecordingUpload);
  }, [currentLiveBroadcast?.id]);

  useEffect(() => {
    if (!recordingProgress || ['done', 'error'].includes(recordingProgress.stage)) return undefined;
    const ticker = window.setInterval(() => {
      setRecordingProgress((current) => {
        if (!current?.startedAt) return current;
        return {
          ...current,
          elapsedSeconds: Math.max(0, (Date.now() - current.startedAt) / 1000),
        };
      });
    }, 1000);
    return () => window.clearInterval(ticker);
    // Intentional deps: only restart ticker on stage/startedAt change, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingProgress?.stage, recordingProgress?.startedAt]);

  useEffect(() => {
    if (!sessionOperation?.startedAt) return undefined;
    const ticker = window.setInterval(() => {
      setSessionOperation((current) => current?.startedAt
        ? {
            ...current,
            elapsedSeconds: Math.max(0, (Date.now() - current.startedAt) / 1000),
          }
        : current);
    }, 1000);
    return () => window.clearInterval(ticker);
  }, [sessionOperation?.startedAt, sessionOperation?.stage]);

  useEffect(() => {
    const onOffline = () => {
      setRecordingProgress((current) => current && !['done', 'error'].includes(current.stage)
        ? { ...current, stage: 'waiting-network' }
        : current);
    };
    const onOnline = () => {
      setRecordingProgress((current) => current?.stage === 'waiting-network'
        ? { ...current, stage: 'uploading', lastAt: Date.now(), lastLoaded: current.loaded || 0 }
        : current);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
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
        // Keep the listener-join baseline fresh when counts arrive via status too.
        if (Number.isFinite(Number(payload.listenerCount))) {
          lastListenerCountRef.current = Number(payload.listenerCount);
        }
        setPresence((current) => ({
          ...current,
          listenerCount: Number(payload.listenerCount ?? current.listenerCount) || 0,
          peakListeners: Number(payload.peakListeners ?? current.peakListeners) || 0,
        }));
      };

      const onPresence = (payload) => {
        if (payload?.broadcastId && String(payload.broadcastId) !== String(currentLiveBroadcast.id)) return;
        // Native desktop alert when the audience grows (creator side).
        // No-op in browsers — notifyDesktop only fires inside Echoo Desktop.
        const nextCount = Number(payload?.listenerCount);
        const lastCount = lastListenerCountRef.current;
        lastListenerCountRef.current = Number.isFinite(nextCount) ? nextCount : lastCount;
        if (Number.isFinite(nextCount) && lastCount !== null && nextCount > lastCount) {
          notifyDesktop('listener-joined');
        }
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
      setSessionOperation({
        kind: 'go-live',
        stage: 'preparing',
        startedAt: Date.now(),
        elapsedSeconds: 0,
      });
      setMessage('Preparing your broadcast…');
      setMixerState(liveMixerSnapshot);
      const prepareStartedAt = performance.now();
      broadcast = await prepareImmediateBroadcast(liveMixerSnapshot);
      const preparedAt = performance.now();
      setSessionOperation((current) => current
        ? { ...current, stage: 'opening-room' }
        : current);
      setMessage('Opening the live audio room…');

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

      setSessionOperation((current) => current
        ? { ...current, stage: 'publishing-audio' }
        : current);
      setMessage('Connecting your audio to listeners…');

      const publishResult = await startLiveKitPublishing({
        url: liveKitUrl,
        token: connection.token,
        broadcastId: broadcast.id,
        mediaTrack,
        qualityProfile: realtimeQualityProfile,
        credentialProvider: () => batch3Service.getLiveKitToken(broadcast.id),
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
      setSessionOperation(null);
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
        setError('You are live. Echoo is still syncing the broadcast status.');
      });
    } catch (liveError) {
      if (backendStarted && broadcast?.id) {
        await batch3Service.cancelBroadcast(broadcast.id).catch(() => {});
      }
      await stopLiveKitPublishing().catch(() => {});
      // Clear the in-progress notice — otherwise "Connecting your live room…"
      // lingers under the error after a failed attempt.
      setMessage('');
      setSessionOperation(null);
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

  // Native tray integration (Echoo Desktop): report live-room state so the
  // tray can offer Mute/Unmute + Leave actions, and honor commands sent back
  // from the tray. Mirrors the listener-side wiring in ListenerRealLiveRoom.
  useEffect(() => {
    setDesktopRoomState({
      active: Boolean(currentLiveBroadcast?.id),
      muted: Boolean(mixerState?.master?.muted),
      canToggleMute: Boolean(currentLiveBroadcast?.id),
    });

    return () => {
      setDesktopRoomState({ active: false, muted: false, canToggleMute: false });
    };
  }, [currentLiveBroadcast?.id, mixerState?.master?.muted]);

  useEffect(
    () =>
      onDesktopRoomCommand((command) => {
        if (command === 'toggle-mute' && currentLiveBroadcast?.id) {
          toggleMasterMute();
        }
        if (command === 'leave-room' && currentLiveBroadcast?.id && !ending) {
          requestEndBroadcast();
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentLiveBroadcast?.id, ending]
  );

  const endBroadcast = async () => {
    if (!currentLiveBroadcast?.id || ending || endingRequestRef.current) return;

    const broadcastId = currentLiveBroadcast.id;
    const broadcastSnapshot = currentLiveBroadcast;

    // Invoke the PC save picker before any await/network work while the
    // confirmed End Broadcast button click still owns browser user activation.
    // The resulting promise/handle is consumed only after the local master
    // closes, so choosing a destination never puts encoding on the live path.
    const deviceSaveReservation = prepareEndBroadcastDeviceSave({
      broadcast: broadcastSnapshot,
    });

    const endStartedAt = performance.now();
    try {
      endingRequestRef.current = true;
      setConfirmEndOpen(false);
      setEnding(true);
      setError('');
      setSessionOperation({
        kind: 'end-broadcast',
        stage: 'stopping-live-audio',
        startedAt: Date.now(),
        elapsedSeconds: 0,
      });
      setMessage('Stopping live audio…');

      // Start backend cleanup immediately, but normalize it into a settled
      // outcome so local device saving never depends on this request and a
      // network rejection cannot become temporarily unhandled.
      const backendEnd = batch3Service.endBroadcastRealtime(broadcastId).then(
        (response) => ({ ok: true, response }),
        (error) => ({ ok: false, error })
      );
      const unpublishStartedAt = performance.now();
      await stopLiveKitPublishing();
      setMasterMuted(false);
      markOffAir('Broadcast ended. Your recording is safe and Echoo is finishing it in the background.');
      setSessionOperation((current) => current
        ? { ...current, stage: 'finalizing-local-master' }
        : current);

      // Stop the OPFS/local recorder now, not after server cleanup. As soon
      // as this local master is complete, announce it to the device-save flow.
      // That flow may save MP3/WAV immediately, while its server-finalization
      // branch waits independently for backend End Broadcast to settle.
      const localRecording = batch3Service.finalizeBroadcastRecording(
        broadcastId,
        broadcastSnapshot,
        { announce: false }
      );

      setEnding(false);
      console.info('[Echoo Perf] end-broadcast realtime stopped', {
        timeToUnpublishMs: Math.round(performance.now() - unpublishStartedAt),
        timeToOffAirMs: Math.round(performance.now() - endStartedAt),
      });

      void (async () => {
        const finalizeStartedAt = performance.now();
        const recordingResult = await localRecording;

        if (recordingResult.recordingReady && recordingResult.decision) {
          // Do this before awaiting backendEnd. A slow/dead server must never
          // prevent the creator from saving the already-complete local master.
          batch3Service.announceFinalizedBroadcastRecording(
            recordingResult.decision,
            broadcastSnapshot,
            {
              serverEndPromise: backendEnd,
              deviceSaveReservation,
            }
          );
        }

        const backendOutcome = await backendEnd;
        const endedResponse = backendOutcome?.ok ? backendOutcome.response : null;
        if (!backendOutcome?.ok) {
          const backendError = backendOutcome?.error;
          setError('Broadcast ended and your recording is safe. Echoo is still finishing the saved recording in the background; you can save MP3 or WAV to this device now.');
          console.warn('[Echoo Live] server end failed after local unpublish:', backendError?.message || backendError);
        }

        setSessionOperation((current) => current
          ? { ...current, stage: 'preparing-server-save' }
          : current);
        if (!recordingResult.recordingReady) {
          setSessionOperation((current) => current
            ? { ...current, stage: 'local-safe' }
            : current);
          setError((current) => current || RECORDING_FINALIZATION_WARNING);
        } else {
          // The upload event takes over the visible progress from here.
          window.setTimeout(() => {
            setSessionOperation((current) => current?.kind === 'end-broadcast' ? null : current);
          }, 1200);
        }
        console.info('[Echoo Perf] end-broadcast', {
          timeToOffAirMs: Math.round(performance.now() - endStartedAt),
          backendEndMs: Math.round(performance.now() - endStartedAt),
          recordingFinalizeMs: Math.round(performance.now() - finalizeStartedAt),
        });
      })();
    } catch (endError) {
      setSessionOperation(null);
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
    try {
      // new URL() throws on file:// (packaged desktop: origin 'null') — a
      // share link needs an http(s) origin the desktop shell cannot provide.
      const configuredOrigin = String(import.meta.env?.VITE_PUBLIC_APP_ORIGIN || '')
        .trim()
        .replace(/\/$/, '');
      const shareOrigin = configuredOrigin || window.location.origin;
      const url = new URL(path, shareOrigin).toString();
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setError('');
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setError('Could not copy the live link. Copy it from your browser after opening the Listener experience.');
    }
  };

  const retryAudioConnection = async () => {
    if (!currentLiveBroadcast?.id || goingLive || ending) return;

    const broadcastId = currentLiveBroadcast.id;
    try {
      setGoingLive(true);
      setError('');
      setMessage('Recovering the live audio connection…');

      const publishingState = getLiveKitPublishingState();
      let recovered = false;

      // A transient LiveKit disconnect retains an in-memory publisher session,
      // so use its credential refresh and bounded retry policy first.
      if (String(publishingState?.broadcastId || '') === String(broadcastId)) {
        try {
          recovered = await retryLiveKitPublishingRecovery();
        } catch (recoveryError) {
          if (!/no active broadcast to recover/i.test(recoveryError?.message || '')) {
            throw recoveryError;
          }
        }
      }

      // A page reload (including a dev-server/HMR restart) destroys the
      // module-level LiveKit session. Rebuild it against the already-live
      // broadcast instead of leaving the creator and listeners in a permanent
      // "Reconnecting" state.
      if (!recovered) {
        const liveMixerSnapshot = getEchooMixerState();
        const liveSourceIds = getValidAudioSourceIds(liveMixerSnapshot);
        if (!liveSourceIds.length) {
          throw new Error(
            'Your browser audio was disconnected. Use Add audio to share the browser tab again, then choose Reconnect live audio.'
          );
        }

        const mediaTrack = getEchooMixerOutputTrack();
        if (!mediaTrack || mediaTrack.readyState === 'ended') {
          throw new Error(
            'The studio mix is not ready. Reconnect an audio source, then choose Reconnect live audio.'
          );
        }

        const connection = await batch3Service.getLiveKitToken(broadcastId);
        const liveKitUrl = connection?.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
        if (!connection?.token || !liveKitUrl) {
          throw new Error('Echoo could not refresh the live audio room credentials.');
        }

        await startLiveKitPublishing({
          url: liveKitUrl,
          token: connection.token,
          broadcastId,
          mediaTrack,
          qualityProfile: realtimeQualityProfile,
          credentialProvider: () => batch3Service.getLiveKitToken(broadcastId),
        });
        recovered = true;
      }

      if (!recovered) throw new Error('Automatic audio recovery is still unavailable.');
      setMixerState(getEchooMixerState());
      setMessage('Live audio recovered.');
      void batch3Service.confirmBroadcastLive(broadcastId).catch((confirmError) => {
        console.warn('[Echoo Live] recovery confirmation delayed:', confirmError?.message || confirmError);
      });
    } catch (recoveryError) {
      setMessage('');
      setError(recoveryError?.message || 'Could not recover the live audio connection.');
    } finally {
      setGoingLive(false);
    }
  };

  if (loading) {
    return (
      <section className="ebsx-loading ebsx-loading--timed" role="status" aria-live="polite">
        <FiLoader className="spin" aria-hidden="true" />
        <strong>Getting your studio ready</strong>
        <span>Connecting to your Channel and broadcasts · {loadingElapsed}s</span>
        <small>
          {loadingElapsed >= 6
            ? 'This is taking longer than usual. Echoo will stop waiting at 10 seconds.'
            : 'Your controls will appear as soon as the connection is ready.'}
        </small>
      </section>
    );
  }

  if (bootstrapError && !stations.length && !currentLiveBroadcast) {
    return (
      <section className="ebsx-loading ebsx-loading--failed" role="alert">
        <FiAlertTriangle aria-hidden="true" />
        <strong>Studio connection needs another try</strong>
        <span>{bootstrapError}</span>
        <button
          type="button"
          className="eb-press"
          onClick={() => setLoadAttempt((value) => value + 1)}
        >
          Retry Studio
        </button>
      </section>
    );
  }

  if (!stations.length && !currentLiveBroadcast) {
    return (
      <section className="ec2-no-channel" aria-labelledby="ec2-no-channel-title">
        <div className="ec2-no-channel-copy">
          <span className="ec2-no-channel-eyebrow">CHANNEL SETUP</span>
          <h1 id="ec2-no-channel-title">Create your Channel</h1>
          <p>
            Your Channel is your public home on Echoo. Choose a name and category, add artwork if you want, then start broadcasting when you are ready.
          </p>
          <button type="button" onClick={() => onNavigate?.('Station')}>
            Create Channel
          </button>
        </div>
      </section>
    );
  }

  const isLive = Boolean(currentLiveBroadcast?.id);
  // Channel identity is independent of the selected program/broadcast. The
  // canonical station is always the first backend-ordered station.
  const liveStation = selectedStation;
  const connectionHealthy = Boolean(
    isLive &&
    publisherHealth?.connected === true &&
    String(publisherHealth?.broadcastId || '') === String(currentLiveBroadcast?.id || '')
  );
  const connectionLabel = connectionHealthy
    ? 'Connected'
    : publisherHealth?.phase === 'failed'
      ? 'Audio connection lost'
      : publisherHealth?.phase === 'recovering'
        ? 'Recovering audio…'
        : 'Reconnecting…';
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
                {connectionLabel}
              </span>
              {!connectionHealthy && (
                <button
                  type="button"
                  className="ec2-copy-live"
                  onClick={retryAudioConnection}
                  disabled={goingLive || ending}
                >
                  {goingLive ? <FiLoader aria-hidden="true" /> : <FiRadio aria-hidden="true" />}
                  {goingLive ? 'Reconnecting…' : 'Reconnect live audio'}
                </button>
              )}
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
              <p>Taking you off air and securing your recording.</p>
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

      {sessionOperation && (
        <div className="ec2-operation-progress" role="status" aria-live="polite">
          <div className="ec2-operation-progress__head">
            <strong>
              {sessionOperation.stage === 'preparing'
                ? 'Preparing broadcast'
                : sessionOperation.stage === 'opening-room'
                  ? 'Opening live audio room'
                  : sessionOperation.stage === 'publishing-audio'
                    ? 'Connecting audio to listeners'
                    : sessionOperation.stage === 'stopping-live-audio'
                      ? 'Stopping live audio'
                      : sessionOperation.stage === 'finalizing-local-master'
                        ? 'Securing your recording'
                        : sessionOperation.stage === 'preparing-server-save'
                          ? 'Finishing your recording'
                          : 'Recording is safe'}
            </strong>
            <span>{formatElapsedTime(sessionOperation.elapsedSeconds || 0)} elapsed</span>
          </div>
          <small>
            {sessionOperation.stage === 'local-safe'
              ? 'Your recording is safe on this device. Echoo will keep trying to finish the saved recording in the background.'
              : sessionOperation.stage === 'publishing-audio'
                ? 'Echoo is waiting for the live audio publication to become usable by listeners.'
                : sessionOperation.stage === 'finalizing-local-master'
                  ? 'The broadcast is already off air. Echoo is closing your recording safely.'
                  : 'This stage has no trustworthy percentage, so Echoo shows elapsed time instead.'}
          </small>
        </div>
      )}

      {recordingProgress && !['done', 'error'].includes(recordingProgress.stage) && (
        <div className="ec2-operation-progress" role="status" aria-live="polite">
          <div className="ec2-operation-progress__head">
            <strong>
              {recordingProgress.stage === 'waiting-network'
                ? 'Waiting for connection'
                : recordingProgress.stage === 'recovered'
                  ? 'Recovered recording is protected locally'
                  : recordingProgress.stage === 'device-saving'
                    ? `Saving ${String(recordingProgress.format || 'mp3').toUpperCase()} to this device`
                    : recordingProgress.stage === 'finalizing'
                      ? recordingProgress.localSaved
                        ? 'Device copy saved · finishing Echoo recording'
                        : 'Recording ready locally · finishing on Echoo'
                      : recordingProgress.stage === 'verifying'
                        ? 'Transfer complete · verifying recording'
                        : recordingProgress.stage === 'preparing'
                          ? 'Preparing recording save'
                          : 'Saving recording to Echoo'}
            </strong>
            <span>
              {recordingProgress.stage === 'uploading' ||
              (recordingProgress.stage === 'device-saving' && recordingProgress.format === 'mp3')
                ? `${Math.max(0, Math.min(100, Math.round(recordingProgress.percent || 0)))}%`
                : `${formatElapsedTime(recordingProgress.elapsedSeconds || 0)} elapsed`}
            </span>
          </div>
          {recordingProgress.stage === 'uploading' || recordingProgress.stage === 'verifying' ||
          (recordingProgress.stage === 'device-saving' && recordingProgress.format === 'mp3') ? (
            <>
              <div className="ec2-operation-progress__bar" aria-hidden="true">
                <i style={{ width: `${Math.max(2, Math.min(100, recordingProgress.percent || 0))}%` }} />
              </div>
              <small>
                {recordingProgress.stage === 'verifying'
                  ? `Verifying saved recording · ${formatElapsedTime(recordingProgress.elapsedSeconds || 0)} elapsed`
                  : recordingProgress.stage === 'device-saving'
                    ? 'Encoding the MP3 locally after OFF AIR. This does not use the Echoo server.'
                    : transferProgressText(recordingProgress)}
              </small>
            </>
          ) : (
            <small>
              {recordingProgress.stage === 'waiting-network'
                ? 'Your local master is safe. Echoo will continue when the connection is available.'
                : recordingProgress.stage === 'finalizing'
                  ? recordingProgress.localSaved
                    ? 'The file on this device is already safe. Echoo is finishing its separate saved copy.'
                    : 'Your browser master is protected. Echoo is finishing its separate saved copy in the background.'
                  : recordingProgress.stage === 'preparing'
                    ? 'Closing the local recording safely before any server recovery work starts.'
                    : 'Your protected recovery copy stays on this device until Echoo finishes safely.'}
            </small>
          )}
        </div>
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
