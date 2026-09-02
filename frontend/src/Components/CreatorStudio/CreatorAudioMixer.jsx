import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaDesktop,
  FaExclamationTriangle,
  FaHeadphones,
  FaInfoCircle,
  FaMicrophone,
  FaPlay,
  FaPlug,
  FaRedo,
  FaStop,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';
import { FiChevronDown, FiCircle, FiHeadphones, FiMinus, FiPause, FiPlay, FiPlus, FiRadio, FiTrash2, FiVolume2 } from 'react-icons/fi';

import {
  ECHOO_MIXER_LIMITS,
  connectGuestInput,
  connectSecondInput,
  connectMediaFile,
  connectMediaUrl,
  connectSystemAudio,
  disconnectMixerChannel,
  ensureHostInput,
  gainToDb,
  getEchooMixerState,
  listAudioInputs,
  listAudioOutputs,
  playMonitorTestTone,
  resetEchooMixer,
  setCreatorAudioSettings,
  setMixerChannelGainDb,
  setMasterGainDb,
  setMonitorEnabled,
  setMonitorGain,
  setMonitorOutputDevice,
  subscribeEchooMixer,
  subscribeEchooMeters,
  toggleMasterMute,
  toggleMixerChannelMute,
  toggleMixerChannelSolo,
  toggleMediaPlayback,
  seekMedia,
} from '../../services/echooMixerService';
import { applyProgramTrackQuality, audioQualityLabel } from '../../services/audioQualityProfile';
import {
  ECHOO_REALTIME_AUDIO_PROFILES,
  normalizeRealtimeAudioProfile,
} from '../../services/realtimeAudioQuality';
import studioService from '../../services/studioService';
import {
  getCachedCreatorAudioSettings,
  loadCreatorAudioSettings,
  normalizeCreatorAudioSettings,
  saveCreatorAudioSettings,
} from '../../services/creatorAudioPreferences';
import './CreatorAudioMixer.css';

const DEFAULT_INPUT_VALUE = '__echoo_default_input__';

const formatDb = (value) => {
  const db = Number(value);
  if (!Number.isFinite(db) || db <= ECHOO_MIXER_LIMITS.minDb + 0.1) return '-∞ dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
};

const formatMediaTime = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
};

const getLibraryAudioUrl = async (item = {}) => {
  const directUrl = item.audioUrl || item.fileUrl || item.url || item.streamUrl || item.audioFile || '';
  if (directUrl) return directUrl;
  const audioId = item.id || item._id;
  if (!audioId) return '';
  const stream = await studioService.getAudioStreamUrl(audioId);
  return stream?.streamUrl || '';
};

const SOURCE_COPY = Object.freeze({
  host: {
    helper: 'Host microphone input',
    empty: 'Connect a host microphone.',
  },
  guest: {
    helper: 'Guest microphone input',
    empty: 'Connect a guest microphone when needed.',
  },
  media: {
    helper: 'Music and FX source',
    empty: 'Add music or an FX source.',
  },
  screen: {
    helper: 'Audio from a shared screen or browser tab',
    empty: 'No screen or tab audio is being shared.',
  },
});

const InfoTip = ({ title, children }) => (
  <span className="eam-info-tip">
    <button type="button" aria-label={`About ${title}`} title={`${title}: ${children}`}>
      <FaInfoCircle />
    </button>
    <span role="tooltip"><strong>{title}</strong>{children}</span>
  </span>
);

const ProcessingSlider = ({ title, description, tooltip, value, disabled, onChange }) => (
  <div className={`eam-processing-control ${disabled ? 'disabled' : ''}`}>
    <span className="eam-processing-title">
      <strong>{title}</strong>
      <InfoTip title={title}>{tooltip}</InfoTip>
    </span>
    <small>{description}</small>
    <span className="eam-processing-range">
      <em>Less</em>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={title}
      />
      <em>More</em>
    </span>
  </div>
);

const getLevelState = ({ connected, peakDb, master = false }) => {
  if (!connected) {
    return { id: 'off', label: 'Not connected', helper: 'No signal yet.' };
  }

  const peak = Number(peakDb);
  if (!Number.isFinite(peak) || peak <= -48) {
    return { id: 'quiet', label: 'No signal', helper: 'Make some sound to check this level.' };
  }

  if (peak < -24) {
    return { id: 'quiet', label: 'A little quiet', helper: 'Raise the level slightly for a clearer broadcast.' };
  }

  if (peak < (master ? -7 : -8)) {
    return { id: 'good', label: 'Good level', helper: 'This is sitting in a healthy broadcast range.' };
  }

  if (peak < -2) {
    return { id: 'strong', label: 'Strong', helper: 'Loud but still controlled. Keep an eye on the meter.' };
  }

  return { id: 'hot', label: 'Too loud', helper: 'Lower the level to avoid distortion.' };
};

const LevelMeter = ({ connected = true, level = 0, peakDb, master = false }) => {
  const state = getLevelState({ connected, peakDb, master });
  const width = connected ? Math.max(2, Math.min(100, Number(level || 0) * 100)) : 0;

  return (
    <div className={`eam-level ${state.id}`}>
      <div className="eam-level-track" aria-label={`${state.label}. Peak ${formatDb(peakDb)}`}>
        <span style={{ width: `${width}%` }} />
        <i className="eam-zone-low" />
        <i className="eam-zone-good" />
        <i className="eam-zone-hot" />
      </div>
      <div className="eam-level-copy">
        <strong>{state.label}</strong>
        <span>{state.helper}</span>
      </div>
    </div>
  );
};

const parentStateSignature = (snapshot = {}) => [
  snapshot.ready ? '1' : '0',
  snapshot.engineSampleRate || '',
  snapshot.channels?.host?.connected ? '1' : '0',
  snapshot.channels?.host?.deviceId || '',
  snapshot.channels?.host?.sourceLabel || '',
  snapshot.channels?.host?.gain ?? '',
  snapshot.channels?.host?.muted ? '1' : '0',
  snapshot.channels?.host?.solo ? '1' : '0',
  snapshot.channels?.channel2?.connected ? '1' : '0',
  snapshot.channels?.channel2?.deviceId || '',
  snapshot.channels?.channel2?.sourceLabel || '',
  snapshot.channels?.channel2?.gain ?? '',
  snapshot.channels?.channel2?.muted ? '1' : '0',
  snapshot.channels?.channel2?.solo ? '1' : '0',
  snapshot.channels?.guest?.connected ? '1' : '0',
  snapshot.channels?.guest?.deviceId || '',
  snapshot.channels?.guest?.gain ?? '',
  snapshot.channels?.guest?.muted ? '1' : '0',
  snapshot.channels?.guest?.solo ? '1' : '0',
  snapshot.channels?.media?.connected ? '1' : '0',
  snapshot.channels?.media?.sourceLabel || '',
  snapshot.channels?.media?.gain ?? '',
  snapshot.channels?.media?.muted ? '1' : '0',
  snapshot.channels?.media?.solo ? '1' : '0',
  snapshot.channels?.media?.playing ? '1' : '0',
  Math.floor(Number(snapshot.channels?.media?.currentTime) || 0),
  snapshot.channels?.screen?.connected ? '1' : '0',
  snapshot.channels?.screen?.sourceLabel || '',
  snapshot.channels?.screen?.gain ?? '',
  snapshot.channels?.screen?.muted ? '1' : '0',
  snapshot.channels?.screen?.solo ? '1' : '0',
  snapshot.master?.gain ?? '',
  snapshot.master?.muted ? '1' : '0',
  snapshot.monitoring?.enabled ? '1' : '0',
  snapshot.monitoring?.gain ?? '',
  snapshot.monitoring?.outputDeviceId || '',
].join('|');

const CreatorAudioMixer = ({ compact = false, approved = false, sessionState = null, onStateChange, audioLibrary = [], onGoLive, goLiveBusy = false, qualityProfile = 'broadcast_high', onQualityProfileChange }) => {
  const [mixer, setMixer] = useState(() => sessionState || getEchooMixerState());
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [hostDeviceId, setHostDeviceId] = useState('');
  const [channel2DeviceId, setChannel2DeviceId] = useState('');
  const [guestDeviceId, setGuestDeviceId] = useState('');
  const [monitorDeviceId, setMonitorDeviceId] = useState('');
  const [workingChannel, setWorkingChannel] = useState('');
  const [monitorWorking, setMonitorWorking] = useState(false);
  const [testingOutput, setTestingOutput] = useState(false);
  const [testingAudio, setTestingAudio] = useState(false);
  const [advancedProcessingOpen, setAdvancedProcessingOpen] = useState(false);
  const [audioSettings, setAudioSettings] = useState(getCachedCreatorAudioSettings);
  const mediaFileInputRef = useRef(null);
  const [qualitySummary, setQualitySummary] = useState({});
  const [error, setError] = useState('');
  const parentSignatureRef = useRef('');
  const preferenceSaveTimerRef = useRef(null);
  const monitorWasEnabledBeforeTestRef = useRef(false);
  const approvedMeterRefs = useRef(new Map());
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() =>
    subscribeEchooMixer((next) => {
      const signature = parentStateSignature(next);
      if (!approved || signature !== parentSignatureRef.current) setMixer(next);
      if (signature !== parentSignatureRef.current) {
        parentSignatureRef.current = signature;
        onStateChange?.(next);
      }
    }), [approved, onStateChange]);

  useEffect(() => {
    if (!approved) return undefined;
    return subscribeEchooMeters((next) => {
      const levels = {
        hostLeft: next.channels?.host?.leftLevel,
        hostRight: next.channels?.host?.rightLevel,
        channel2Left: next.channels?.channel2?.leftLevel,
        channel2Right: next.channels?.channel2?.rightLevel,
        guestLeft: next.channels?.guest?.leftLevel,
        guestRight: next.channels?.guest?.rightLevel,
        media: next.channels?.media?.level,
        screen: next.channels?.screen?.level,
        masterLeft: next.master?.leftLevel,
        masterRight: next.master?.rightLevel,
      };
      Object.entries(levels).forEach(([key, rawLevel]) => {
        const node = approvedMeterRefs.current.get(key);
        if (!node) return;
        const level = Math.max(0, Math.min(1, Number(rawLevel) || 0));
        const active = Math.round(level * 14);
        node.querySelectorAll('i').forEach((segment, index) => segment.classList.toggle('active', index < active));
        node.setAttribute('aria-valuenow', String(Math.round(level * 100)));
      });
    });
  }, [approved]);

  const channels = useMemo(() => mixer?.channels || {}, [mixer]);
  const master = mixer?.master || {
    gain: 1,
    muted: false,
    level: 0,
    rmsDb: ECHOO_MIXER_LIMITS.minDb,
    peakDb: ECHOO_MIXER_LIMITS.minDb,
  };
  const monitoring = mixer?.monitoring || {
    enabled: false,
    gain: 0.72,
    outputDeviceId: '',
    outputDeviceLabel: 'System default',
    outputSelectionSupported: false,
    playing: false,
  };
  const processingStatus = mixer?.processing?.status || { noiseReduction: 'idle', error: '' };

  useEffect(() => {
    let cancelled = false;
    void setCreatorAudioSettings(audioSettings);

    loadCreatorAudioSettings().then((loaded) => {
      if (cancelled) return;
      setAudioSettings(loaded);
      void setCreatorAudioSettings(loaded);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(preferenceSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAudioSetting = (key, value) => {
    setError('');
    const next = normalizeCreatorAudioSettings({ ...audioSettings, [key]: value });
    setAudioSettings(next);
    void setCreatorAudioSettings(next);
    window.clearTimeout(preferenceSaveTimerRef.current);
    preferenceSaveTimerRef.current = window.setTimeout(() => {
      saveCreatorAudioSettings(next).catch(() => {
        setError('Your audio changes are active and saved on this device, but account sync is unavailable.');
      });
    }, 500);
  };

  const refreshDevices = async () => {
    try {
      const [nextInputs, nextOutputs] = await Promise.all([
        listAudioInputs(),
        listAudioOutputs(),
      ]);

      setInputs(nextInputs);
      setOutputs(nextOutputs);

      setHostDeviceId((current) => {
        // This is UI intent, not the physical ID returned by the browser.
        // Keep the default-device choice selected across enumerateDevices and
        // devicechange, even when the browser resolves it to a concrete ID.
        if (current === DEFAULT_INPUT_VALUE) return current;
        return current && nextInputs.some((device) => device.deviceId === current)
          ? current
          : '';
      });

      setChannel2DeviceId((current) =>
        current && nextInputs.some((device) => device.deviceId === current)
          ? current
          : ''
      );

      setGuestDeviceId((current) => {
        if (current && nextInputs.some((device) => device.deviceId === current)) {
          return current;
        }
        return '';
      });

      setMonitorDeviceId((current) =>
        current && nextOutputs.some((device) => device.deviceId === current)
          ? current
          : ''
      );
    } catch {
      setInputs([]);
      setOutputs([]);
    }
  };

  useEffect(() => {
    refreshDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return undefined;
    mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, []);

  const connectHost = async () => {
    try {
      setWorkingChannel('host');
      setError('');
      const deviceId = hostDeviceId === DEFAULT_INPUT_VALUE
        ? ''
        : hostDeviceId || channels.host?.deviceId || '';
      await ensureHostInput(deviceId);
      await refreshDevices();
      return true;
    } catch (connectError) {
      setError(connectError?.message || 'Could not connect the host microphone.');
      return false;
    } finally {
      setWorkingChannel('');
    }
  };

  const connectGuest = async () => {
    try {
      setWorkingChannel('guest');
      setError('');

      const nextDeviceId =
        guestDeviceId ||
        channels.guest?.deviceId ||
        inputs.find((device) => device.deviceId !== channels.host?.deviceId)?.deviceId ||
        '';

      if (!nextDeviceId) {
        throw new Error('Choose a second microphone or audio interface input for Guest Mic.');
      }

      if (nextDeviceId === channels.host?.deviceId) {
        throw new Error('Host Mic and Guest Mic cannot use the same hardware input at the same time.');
      }

      await connectGuestInput(nextDeviceId);
    } catch (connectError) {
      setError(connectError?.message || 'Could not connect the guest microphone.');
    } finally {
      setWorkingChannel('');
    }
  };

  const connectMedia = async () => {
    try {
      setWorkingChannel('media');
      setError('');
      const track = await connectSystemAudio();
      const summary = applyProgramTrackQuality(track);
      setQualitySummary((current) => ({ ...current, media: summary }));
    } catch (connectError) {
      setError(connectError?.message || 'Could not connect shared audio.');
    } finally {
      setWorkingChannel('');
    }
  };

  const handleMonitoring = async () => {
    try {
      setMonitorWorking(true);
      setError('');
      await setMonitorEnabled(!monitoring.enabled);
    } catch (monitorError) {
      setError(monitorError?.message || 'Could not start studio monitoring.');
    } finally {
      setMonitorWorking(false);
    }
  };

  const handleListenOnly = async (channelId) => {
    const channel = channels[channelId];
    if (!channel?.connected) return;

    try {
      setError('');
      if (!monitoring.enabled) {
        setMonitorWorking(true);
        await setMonitorEnabled(true);
      }
      toggleMixerChannelSolo(channelId);
    } catch (monitorError) {
      setError(monitorError?.message || 'Could not start headphone monitoring.');
    } finally {
      setMonitorWorking(false);
    }
  };

  const changeMonitorOutput = async (deviceId) => {
    try {
      setMonitorWorking(true);
      setError('');
      const selected = outputs.find((device) => device.deviceId === deviceId);
      await setMonitorOutputDevice(deviceId, selected?.label || 'System default');
      setMonitorDeviceId(deviceId);
    } catch (outputError) {
      setError(outputError?.message || 'Could not switch monitoring output.');
    } finally {
      setMonitorWorking(false);
    }
  };

  const testOutput = async () => {
    try {
      setTestingOutput(true);
      setError('');
      await playMonitorTestTone();
    } catch (testError) {
      setError(testError?.message || 'Could not test the monitoring output.');
    } finally {
      window.setTimeout(() => setTestingOutput(false), 450);
    }
  };

  const testProcessedAudio = async () => {
    try {
      setMonitorWorking(true);
      setError('');
      if (testingAudio && monitoring.enabled) {
        await setMonitorEnabled(monitorWasEnabledBeforeTestRef.current);
        setTestingAudio(false);
        return;
      }

      if (!channels.host?.connected) {
        const connected = await connectHost();
        if (!connected) return;
      }
      monitorWasEnabledBeforeTestRef.current = monitoring.enabled;
      await setMonitorEnabled(true);
      setTestingAudio(true);
    } catch (testError) {
      setError(testError?.message || 'Could not start your audio test.');
      setTestingAudio(false);
    } finally {
      setMonitorWorking(false);
    }
  };

  const renderChannel = (channelId, icon) => {
    const channel = channels[channelId] || {
      name: channelId,
      sourceLabel: 'Not connected',
      deviceId: '',
      gain: 1,
      muted: false,
      solo: false,
      level: 0,
      rmsDb: ECHOO_MIXER_LIMITS.minDb,
      peakDb: ECHOO_MIXER_LIMITS.minDb,
      connected: false,
    };
    const copy = SOURCE_COPY[channelId] || SOURCE_COPY.host;
    const faderDb = gainToDb(channel.gain);
    const isWorking = workingChannel === channelId;
    const summary = qualitySummary[channelId];

    return (
      <article className={`eam-source-card ${channel.connected ? 'connected' : ''}`} key={channelId}>
        <div className="eam-source-head">
          <span className="eam-source-icon">{icon}</span>
          <div className="eam-source-title">
            <strong>{channel.name}</strong>
            <span className={channel.connected ? 'connected' : ''}>
              <i /> {channel.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
        </div>

        {!compact && <>
          <p className="eam-source-purpose">{copy.helper}</p>
          <small className="eam-source-device">
            {channel.connected ? channel.sourceLabel : copy.empty}
          </small>
        </>}
        {compact && <small className="eam-live-source-summary">{channel.connected ? channel.sourceLabel : 'Connect a source to add it to the live mix.'}</small>}
        {!compact && channelId === 'media' && !channel.connected && (
          <small className="eam-source-tip">
            In the browser picker, select a tab or window and turn on Share audio before confirming.
          </small>
        )}

        {(channelId === 'host' || channelId === 'guest') && !channel.connected && (
          <select
            className="eam-device-select"
            value={channelId === 'host' ? hostDeviceId : guestDeviceId}
            onChange={(event) => {
              if (channelId === 'host') setHostDeviceId(event.target.value);
              else setGuestDeviceId(event.target.value);
            }}
            aria-label={`${channel.name} source`}
          >
            <option value="">System default input</option>
            {inputs.map((device) => (
              <option value={device.deviceId} key={`${channelId}:${device.deviceId}`}>
                {device.label}
              </option>
            ))}
          </select>
        )}

        <div className={compact ? 'eam-live-channel-body' : ''}>
          <div className="eam-level-control">
            <div className="eam-control-label">
              <span>{compact ? 'Channel level' : 'Level'}</span>
              <strong>{formatDb(faderDb)}</strong>
            </div>
            <input
              type="range"
              min={ECHOO_MIXER_LIMITS.minDb}
              max={ECHOO_MIXER_LIMITS.maxChannelDb}
              step="0.5"
              value={faderDb}
              disabled={!channel.connected}
              onChange={(event) => setMixerChannelGainDb(channelId, event.target.value)}
              onDoubleClick={() => setMixerChannelGainDb(channelId, 0)}
              aria-label={`${channel.name} level`}
            />
          </div>

          <LevelMeter connected={channel.connected} level={channel.level} peakDb={channel.peakDb} />

          {!compact && channel.connected && (channelId === 'host' || channelId === 'guest') && (
            <div className="eam-quality-chip">
              <FaCheckCircle /> {audioSettings.audioMode === 'raw' ? 'Raw audio' : 'Enhanced audio'}
            </div>
          )}
          {!compact && summary && channel.connected && channelId === 'media' && (
            <div className="eam-quality-chip">
              <FaCheckCircle /> {audioQualityLabel(summary)}
            </div>
          )}

          <div className="eam-source-actions">
            <button
              type="button"
              className={channel.muted ? 'active mute' : ''}
              onClick={() => toggleMixerChannelMute(channelId)}
              disabled={!channel.connected}
              aria-pressed={channel.muted}
            >
              <FaVolumeMute /> {channel.muted ? 'Muted' : 'Mute'}
            </button>
            <button
              type="button"
              className={`listen-only ${channel.solo ? 'active' : ''}`}
              onClick={() => handleListenOnly(channelId)}
              disabled={!channel.connected || monitorWorking}
              aria-pressed={Boolean(channel.solo)}
              title="Headphones only — this never changes the audience mix"
            >
              <FaHeadphones /> {channel.solo ? 'Listening' : 'Listen only'}
            </button>
            <button
              type="button"
              className="primary source-connect"
              disabled={isWorking}
              onClick={() => {
                if (channel.connected) {
                  if (channel.solo) toggleMixerChannelSolo(channelId);
                  disconnectMixerChannel(channelId);
                  return;
                }
                if (channelId === 'host') connectHost();
                else if (channelId === 'guest') connectGuest();
                else connectMedia();
              }}
            >
              <FaPlug />
              {isWorking
                ? 'Connecting...'
                : channel.connected
                  ? 'Disconnect'
                  : channelId === 'media'
                    ? 'Share audio'
                    : channelId === 'guest'
                      ? 'Connect guest'
                      : 'Connect mic'}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const masterState = getLevelState({ connected: true, peakDb: master.peakDb, master: true });

  const balanceAdvice = useMemo(() => {
    const host = channels.host;
    const media = channels.media;
    if (!host?.connected || !media?.connected) {
      return {
        tone: 'neutral',
        title: 'Set up your sources',
        copy: 'Connect a microphone first, then add music only when you need it.',
      };
    }

    const hostDb = Number(host.rmsDb);
    const mediaDb = Number(media.rmsDb);
    if (!Number.isFinite(hostDb) || !Number.isFinite(mediaDb) || hostDb <= -48 || mediaDb <= -48) {
      return {
        tone: 'neutral',
        title: 'Make some sound to check the balance',
        copy: 'Speak normally while your music is playing and Echoo will show which source is dominating.',
      };
    }

    const difference = mediaDb - hostDb;
    if (difference > 5) {
      return {
        tone: 'warn',
        title: 'Music is louder than your microphone',
        copy: 'Lower Music / System Audio a little so listeners can understand your voice clearly.',
      };
    }

    if (difference < -16) {
      return {
        tone: 'neutral',
        title: 'Music is much lower than your voice',
        copy: 'That can be fine for background music. Raise it only if you want it to be more present.',
      };
    }

    return {
      tone: 'good',
      title: 'Voice and music are balanced',
      copy: 'Your sources are sitting in a sensible range relative to each other.',
    };
  }, [channels.host, channels.media]);

  const chooseMediaFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setWorkingChannel('media');
      setError('');
      await connectMediaFile(file);
      setAudioMenuOpen(false);
    } catch (mediaError) {
      setError(mediaError?.message || 'Could not add that audio file.');
    } finally {
      setWorkingChannel('');
    }
  };

  const changeApprovedInput = async (channelId, deviceId) => {
    const defaultInputRequested = deviceId === DEFAULT_INPUT_VALUE;
    const resolvedDeviceId = defaultInputRequested ? '' : deviceId;

    if (channelId === 'host') {
      setHostDeviceId(defaultInputRequested ? DEFAULT_INPUT_VALUE : resolvedDeviceId);
    }
    if (channelId === 'channel2') setChannel2DeviceId(resolvedDeviceId);
    if (channelId === 'guest') setGuestDeviceId(resolvedDeviceId);

    try {
      setWorkingChannel(channelId);
      setError('');

      if (defaultInputRequested && channelId === 'host') {
        await ensureHostInput();
        await refreshDevices();
        return;
      }

      if (!resolvedDeviceId) {
        disconnectMixerChannel(channelId);
        return;
      }

      if (channelId === 'host') await ensureHostInput(resolvedDeviceId);
      if (channelId === 'channel2') await connectSecondInput(resolvedDeviceId);
      if (channelId === 'guest') await connectGuestInput(resolvedDeviceId);
      await refreshDevices();
    } catch (deviceError) {
      setError(deviceError?.message || 'Could not connect that audio input. Check browser microphone permission and try again.');
    } finally {
      setWorkingChannel('');
    }
  };

  if (approved) {
    const strips = [
      { id: 'host', title: 'HOST', role: 'Built-in Microphone', empty: 'Built-in Microphone' },
      { id: 'channel2', title: 'GUEST 1', role: 'Guest 1 source', empty: 'No source' },
      { id: 'guest', title: 'GUEST 2', role: 'Guest 2 / Call-in', empty: 'No source' },
    ];
    const dbLabels = ['0', '-10', '-20', '-30', '-40', '-50'];
    const APPROVED_UNITY_POSITION = 62;
    const dbToApprovedPosition = (db, maxDb) => {
      const value = Math.max(ECHOO_MIXER_LIMITS.minDb, Math.min(maxDb, Number(db) || 0));
      if (value <= 0) return ((value - ECHOO_MIXER_LIMITS.minDb) / -ECHOO_MIXER_LIMITS.minDb) * APPROVED_UNITY_POSITION;
      return APPROVED_UNITY_POSITION + ((value / maxDb) * (100 - APPROVED_UNITY_POSITION));
    };
    const approvedPositionToDb = (position, maxDb) => {
      const value = Math.max(0, Math.min(100, Number(position) || 0));
      if (value <= APPROVED_UNITY_POSITION) return ECHOO_MIXER_LIMITS.minDb + ((value / APPROVED_UNITY_POSITION) * -ECHOO_MIXER_LIMITS.minDb);
      return ((value - APPROVED_UNITY_POSITION) / (100 - APPROVED_UNITY_POSITION)) * maxDb;
    };
    const faderPosition = (position) => {
      const ratioFromTop = (100 - position) / 100;
      return `${ratioFromTop * 100}%`;
    };
    const renderApprovedMeter = (channel, label, meterKey) => {
      const active = Math.round(Math.max(0, Math.min(1, Number(channel?.level) || 0)) * 14);
      return <div ref={(node) => { if (node) approvedMeterRefs.current.set(meterKey, node); else approvedMeterRefs.current.delete(meterKey); }} className="eam-approved-meter" role="meter" aria-label={`${label} level`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((Number(channel?.level) || 0) * 100)}>{Array.from({ length: 14 }, (_, index) => <i key={index} className={index < active ? 'active' : ''} />)}</div>;
    };
    const renderApprovedStereoMeter = (channel, label, meterPrefix) => (
      <div className="eam-approved-stereo-meter" aria-label={`${label} stereo level`}>
        <div className="eam-approved-stereo-column"><span>L</span>{renderApprovedMeter({ level: channel.leftLevel, peakDb: channel.leftPeakDb }, `${label} left`, `${meterPrefix}Left`)}</div>
        <div className="eam-approved-stereo-column"><span>R</span>{renderApprovedMeter({ level: channel.rightLevel, peakDb: channel.rightPeakDb }, `${label} right`, `${meterPrefix}Right`)}</div>
      </div>
    );
    const renderApprovedStrip = ({ id, title, role }) => {
      const channel = channels[id] || {};
      const faderDb = gainToDb(channel.gain ?? 1);
      const approvedFaderValue = dbToApprovedPosition(faderDb, ECHOO_MIXER_LIMITS.maxChannelDb);
      const isHost = id === 'host';
      const selectedDeviceId = id === 'host' ? hostDeviceId : id === 'channel2' ? channel2DeviceId : guestDeviceId;
      const inputValue = isHost && selectedDeviceId === DEFAULT_INPUT_VALUE
        ? DEFAULT_INPUT_VALUE
        : selectedDeviceId || channel.deviceId || '';
      const unavailableIds = [channels.host?.deviceId, channels.channel2?.deviceId, channels.guest?.deviceId]
        .filter((deviceId) => deviceId && deviceId !== channel?.deviceId);
      const inputOptions = inputs.filter((device) => !unavailableIds.includes(device.deviceId));
      const sourceTitle = channel.connected ? channel.sourceLabel : role;
      return (
        <article className="eam-approved-strip" key={id}>
          <header><div><strong>{title}</strong><span>{sourceTitle}</span></div></header>
          <div className="eam-approved-controls">
            <div className="eam-approved-meter-area"><div className="eam-approved-db">{dbLabels.map((label) => <span key={label}>{label}</span>)}</div>{renderApprovedStereoMeter(channel, title, id)}</div>
            <label className="eam-approved-fader" style={{ '--fader-position': faderPosition(approvedFaderValue) }}><FiCircle className="eam-approved-fader-cap" aria-hidden="true" /><input type="range" min="0" max="100" step="1" value={approvedFaderValue} onChange={(event) => setMixerChannelGainDb(id, approvedPositionToDb(event.target.value, ECHOO_MIXER_LIMITS.maxChannelDb))} disabled={!channel.connected} aria-label={`${title} level`} aria-valuetext={formatDb(faderDb)} /><FiMinus className="eam-approved-fader-mark" aria-hidden="true" /></label>
          </div>
          <div className="eam-approved-actions">
            <button type="button" className={`eam-approved-monitor ${channel.solo ? 'active' : ''}`} onClick={() => handleListenOnly(id)} disabled={!channel.connected || monitorWorking} aria-pressed={Boolean(channel.solo)}><FiHeadphones /> Monitor</button>
            <button type="button" className={`eam-approved-mute ${channel.muted ? 'active' : ''}`} onClick={() => toggleMixerChannelMute(id)} disabled={!channel.connected} aria-pressed={Boolean(channel.muted)}><FaVolumeMute /> {channel.muted ? 'Muted' : 'Mute'}</button>
          </div>
          <label className="eam-approved-select">
            <select value={inputValue} onChange={(event) => changeApprovedInput(id, event.target.value)} aria-label={`${title} input`} disabled={workingChannel === id}>
              {isHost ? (
                <>
                  <option value="" disabled>Choose microphone</option>
                  <option value={DEFAULT_INPUT_VALUE}>Built-in Microphone</option>
                </>
              ) : (
                <option value="">Select guest source</option>
              )}
              {inputOptions.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
            <FiChevronDown />
          </label>
        </article>
      );
    };

    const masterDb = gainToDb(master.gain ?? 1);
    const approvedMasterFaderValue = dbToApprovedPosition(masterDb, ECHOO_MIXER_LIMITS.maxMasterDb);
    const activeMediaId = channels.media?.connected ? 'media' : channels.screen?.connected ? 'screen' : '';
    const activeMedia = activeMediaId ? channels[activeMediaId] : null;
    const addBrowserAudio = async () => {
      try {
        setWorkingChannel('screen');
        setError('');
        await connectSystemAudio();
        setAudioMenuOpen(false);
      } catch (browserAudioError) {
        setError(browserAudioError?.message || 'Could not share browser audio.');
      } finally {
        setWorkingChannel('');
      }
    };
    const addLibraryAudio = async (item) => {
      try {
        setWorkingChannel('media');
        setError('');
        const playableUrl = await getLibraryAudioUrl(item);
        await connectMediaUrl(playableUrl, item.title || item.name || 'Echoo library audio');
        setLibraryOpen(false);
        setAudioMenuOpen(false);
      } catch (libraryError) {
        setError(libraryError?.message || 'Could not add that Echoo library audio.');
      } finally {
        setWorkingChannel('');
      }
    };
    const mediaDuration = Number(channels.media?.duration) || 0;
    const mediaCurrentTime = Number(channels.media?.currentTime) || 0;
    return (
      <section className="eam-approved" aria-label="Workstation mixer">
        <input ref={mediaFileInputRef} className="eam-approved-file" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.webm" onChange={chooseMediaFile} />
        {error && <div className="eam-approved-error" role="alert"><FaExclamationTriangle /> {error}</div>}
        <div className="eam-approved-grid">
          {strips.map(renderApprovedStrip)}
          <article className="eam-approved-strip master">
            <header><div><strong>MASTER OUTPUT</strong><span>Main Mix</span></div></header>
            <div className="eam-approved-controls"><div className="eam-approved-meter-area"><div className="eam-approved-db">{dbLabels.map((label) => <span key={label}>{label}</span>)}</div>{renderApprovedStereoMeter(master, 'Master output', 'master')}</div><label className="eam-approved-fader" style={{ '--fader-position': faderPosition(approvedMasterFaderValue) }}><FiCircle className="eam-approved-fader-cap" aria-hidden="true" /><input type="range" min="0" max="100" step="1" value={approvedMasterFaderValue} onChange={(event) => setMasterGainDb(approvedPositionToDb(event.target.value, ECHOO_MIXER_LIMITS.maxMasterDb))} aria-label="Main mix level" aria-valuetext={formatDb(masterDb)} /><FiMinus className="eam-approved-fader-mark" aria-hidden="true" /></label></div>
            <button type="button" className={`eam-approved-monitor eam-approved-monitor-mix ${monitoring.enabled ? 'active' : ''}`} onClick={handleMonitoring} disabled={monitorWorking} aria-pressed={Boolean(monitoring.enabled)}><FiHeadphones /> Monitor Mix</button>
            <label className="eam-approved-select"><select value={monitorDeviceId || monitoring.outputDeviceId || ''} onChange={(event) => changeMonitorOutput(event.target.value)} disabled={monitorWorking || !monitoring.outputSelectionSupported} aria-label="Main mix output"><option value="">Default Output</option>{outputs.filter((device) => device.deviceId && device.deviceId !== 'default').map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select><FiChevronDown /></label>
          </article>
        </div>
        <div className={`eam-approved-lower ${activeMedia ? 'has-media' : ''}`}>
          <section className={`eam-approved-media-dock ${activeMedia ? 'populated' : ''}`}>
            {activeMedia ? (
              <>
                <header><div><strong>MEDIA</strong><span>1 item</span></div><button type="button" onClick={() => setAudioMenuOpen((open) => !open)}><FiPlus /> Add audio <FiChevronDown /></button></header>
                <div className="eam-approved-media-row">
                  <div className="eam-approved-media-art"><FiVolume2 /></div>
                  <div className="eam-approved-media-copy"><strong>{activeMediaId === 'screen' ? 'Browser audio' : activeMedia.sourceLabel}</strong><span>{activeMediaId === 'screen' ? 'Shared browser / tab source' : formatMediaTime(mediaDuration)}</span></div>
                  {activeMediaId === 'media' && <button type="button" className="eam-approved-play" onClick={toggleMediaPlayback} aria-label={channels.media.playing ? 'Pause audio' : 'Play audio'}>{channels.media.playing ? <FiPause /> : <FiPlay />}</button>}
                  {activeMediaId === 'media' && <div className="eam-approved-media-progress"><span>{formatMediaTime(mediaCurrentTime)} / {formatMediaTime(mediaDuration)}</span><input type="range" min="0" max={Math.max(1, mediaDuration)} step=".1" value={Math.min(mediaCurrentTime, mediaDuration)} onChange={(event) => seekMedia(event.target.value)} aria-label="Media position" /></div>}
                  <div className="eam-approved-media-levels"><div className="eam-approved-media-mini-meter">{renderApprovedMeter(activeMedia, 'Media', activeMediaId)}</div><label><FiVolume2 aria-hidden="true" /><input type="range" min={ECHOO_MIXER_LIMITS.minDb} max={ECHOO_MIXER_LIMITS.maxChannelDb} step="0.5" value={gainToDb(activeMedia.gain ?? 1)} onChange={(event) => setMixerChannelGainDb(activeMediaId, event.target.value)} aria-label="Media volume" /></label></div>
                  <div className="eam-approved-media-actions"><button type="button" className={activeMedia.solo ? 'active' : ''} onClick={() => handleListenOnly(activeMediaId)}><FiHeadphones /> Monitor</button><button type="button" className={activeMedia.muted ? 'active muted' : ''} onClick={() => toggleMixerChannelMute(activeMediaId)}><FaVolumeMute /> {activeMedia.muted ? 'Muted' : 'Mute'}</button><button type="button" className="remove" onClick={() => disconnectMixerChannel(activeMediaId)}><FiTrash2 /> {activeMediaId === 'screen' ? 'Stop sharing' : 'Remove'}</button></div>
                </div>
              </>
            ) : <button type="button" className="eam-approved-add-audio" onClick={() => setAudioMenuOpen((open) => !open)}><FiPlus /> Add audio <FiChevronDown /></button>}
            {audioMenuOpen && <div className="eam-approved-audio-menu"><button type="button" onClick={() => { setAudioMenuOpen(false); mediaFileInputRef.current?.click(); }}>Upload audio file</button><button type="button" onClick={() => setLibraryOpen(true)}>From Echoo library</button><button type="button" onClick={addBrowserAudio} disabled={workingChannel === 'screen'}>{workingChannel === 'screen' ? 'Opening browser picker…' : 'Share browser audio'}</button></div>}
            {libraryOpen && <div className="eam-approved-library" role="dialog" aria-modal="true" aria-label="Echoo audio library"><header><strong>Echoo library</strong><button type="button" onClick={() => setLibraryOpen(false)}>Close</button></header>{audioLibrary.length ? audioLibrary.map((item) => <button type="button" key={item.id || item._id || item.title} onClick={() => addLibraryAudio(item)} disabled={workingChannel === 'media'}><span>{item.title || item.name || 'Untitled audio'}</span><small>{item.genre || item.category || 'Audio'}</small></button>) : <p>Your Echoo library is empty.</p>}</div>}
          </section>
          <aside className="eam-approved-live-actions">
            <div className="eam-approved-quality" role="group" aria-labelledby="audio-quality-label">
              <span id="audio-quality-label">Audio quality</span>
              <div className="eam-approved-quality-options">
                {Object.values(ECHOO_REALTIME_AUDIO_PROFILES).map((profile) => (
                  <button
                    type="button"
                    key={profile.id}
                    className={normalizeRealtimeAudioProfile(qualityProfile) === profile.id ? 'active' : ''}
                    aria-pressed={normalizeRealtimeAudioProfile(qualityProfile) === profile.id}
                    onClick={() => onQualityProfileChange?.(profile.id)}
                  >
                    {profile.label}
                  </button>
                ))}
              </div>
              <small>{ECHOO_REALTIME_AUDIO_PROFILES[normalizeRealtimeAudioProfile(qualityProfile)].description}</small>
            </div>
            <button type="button" className="eam-approved-go-live" onClick={onGoLive} disabled={goLiveBusy}><FiRadio />{goLiveBusy ? 'Starting…' : 'Go Live'}</button><p>Review your mix before going live.</p><button type="button" className="eam-approved-test-mix" onClick={testProcessedAudio} disabled={monitorWorking || workingChannel === 'host'}><FiVolume2 /> {testingAudio && monitoring.enabled ? 'Stop testing' : 'Test your mix'}</button>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className={`eam ${compact ? 'compact eam-live-mixer' : ''}`}>
      <div className="eam-heading">
        <div>
          <span>{compact ? 'LIVE' : 'AUDIO'}</span>
          <h2>{compact ? 'Live Mixer' : 'Studio Mixer'}</h2>
          <p>{compact ? 'Control what your listeners hear right now.' : 'Simple controls for the exact sound your audience receives.'}</p>
        </div>
        <button type="button" className="eam-reset" onClick={resetEchooMixer}>
          <FaRedo /> Reset mix
        </button>
      </div>

      {compact && <button type="button" className="eam-advanced-toggle" onClick={() => setAdvancedProcessingOpen((open) => !open)} aria-expanded={advancedProcessingOpen}>
        <span><strong>Audio Processing</strong><small>Your Sound Check settings are active in this live mix.</small></span>
        {advancedProcessingOpen ? 'Hide settings' : 'Adjust settings'}
      </button>}

      {(!compact || advancedProcessingOpen) && <>
      <section className="eam-profile" aria-label="Audio mode">
        <div>
          <strong>Audio mode</strong>
          <span>Choose the sound that fits your microphone setup.</span>
        </div>
        <div className="eam-profile-options">
          <button
            type="button"
            className={audioSettings.audioMode === 'raw' ? 'active' : ''}
            onClick={() => updateAudioSetting('audioMode', 'raw')}
          >
            <strong>Raw Audio</strong>
            {!compact && <small>Your original microphone sound with only Master Volume applied.</small>}
          </button>
          <button
            type="button"
            className={audioSettings.audioMode === 'enhanced' ? 'active' : ''}
            onClick={() => updateAudioSetting('audioMode', 'enhanced')}
          >
            <strong>Enhanced Audio</strong>
            {!compact && <small>Cleaner, clearer and more even voice sound.</small>}
          </button>
        </div>
        <p>
          {audioSettings.audioMode === 'raw'
            ? 'Your microphone enters the mix without voice changes. Master Volume remains available.'
            : 'Your selected voice improvements are applied before the final mix.'}
        </p>
      </section>

      <section className={`eam-processing ${audioSettings.audioMode === 'raw' ? 'raw' : ''}`}>
        <div className="eam-processing-section">
          <header>
            <span>VOICE CLEAN</span>
            <p>Improve your voice by reducing unwanted sounds and making speech clearer.</p>
          </header>
          <div className="eam-processing-grid">
            <ProcessingSlider
              title="Background Noise Removal"
              description="Removes unwanted sounds like fans, traffic, keyboard sounds, and room noise."
              tooltip="Controls how strongly Echoo removes unwanted background sounds while keeping your voice natural."
              value={audioSettings.noiseReduction}
              disabled={audioSettings.audioMode === 'raw' || processingStatus.noiseReduction === 'unavailable'}
              onChange={(value) => updateAudioSetting('noiseReduction', value)}
            />
            <div className={`eam-processing-control ${audioSettings.audioMode === 'raw' ? 'disabled' : ''}`}>
              <span className="eam-processing-title">
                <strong>Echo Removal</strong>
                <InfoTip title="Echo Removal">Reduces sound that returns from speakers or reflects around your room.</InfoTip>
              </span>
              <small>Reduces the bouncing sound created when your voice reflects around a room.</small>
              <button
                type="button"
                className={`eam-switch ${audioSettings.echoRemoval ? 'active' : ''}`}
                disabled={audioSettings.audioMode === 'raw'}
                onClick={() => updateAudioSetting('echoRemoval', !audioSettings.echoRemoval)}
                aria-pressed={audioSettings.echoRemoval}
              >
                <span /> {audioSettings.echoRemoval ? 'On' : 'Off'}
              </button>
            </div>
          </div>
          {audioSettings.audioMode === 'enhanced' && processingStatus.noiseReduction === 'loading' && (
            <small className="eam-processing-status">Preparing Background Noise Removal...</small>
          )}
          {processingStatus.error && <small className="eam-processing-status error">{processingStatus.error}</small>}
        </div>

        <div className="eam-processing-section">
          <header>
            <span>AUDIO QUALITY</span>
            <p>Make your audio sound richer, clearer, and more professional.</p>
          </header>
          <div className="eam-processing-grid quality">
            <ProcessingSlider
              title="Voice Warmth"
              description="Adds more depth and fullness to your voice."
              tooltip="Adds gentle depth to your voice without changing your natural speaking style."
              value={audioSettings.voiceWarmth}
              disabled={audioSettings.audioMode === 'raw'}
              onChange={(value) => updateAudioSetting('voiceWarmth', value)}
            />
            <ProcessingSlider
              title="Voice Clarity"
              description="Makes your words easier to hear and understand."
              tooltip="Brings forward the part of your voice that helps listeners understand each word."
              value={audioSettings.voiceClarity}
              disabled={audioSettings.audioMode === 'raw'}
              onChange={(value) => updateAudioSetting('voiceClarity', value)}
            />
            <ProcessingSlider
              title="De-esser"
              description="Softens sharp S and T sounds without dulling your voice."
              tooltip="Reduces harsh high-frequency consonants in the same voice-processing chain used before and during your broadcast."
              value={audioSettings.deEsser}
              disabled={audioSettings.audioMode === 'raw'}
              onChange={(value) => updateAudioSetting('deEsser', value)}
            />
            <ProcessingSlider
              title="Volume Balance"
              description="Keeps your voice from becoming too quiet or suddenly too loud."
              tooltip="Smooths large changes in speaking volume while keeping your voice expressive."
              value={audioSettings.volumeBalance}
              disabled={audioSettings.audioMode === 'raw'}
              onChange={(value) => updateAudioSetting('volumeBalance', value)}
            />
            <div className={`eam-processing-control ${audioSettings.audioMode === 'raw' ? 'disabled' : ''}`}>
              <span className="eam-processing-title">
                <strong>Protect Loud Sounds</strong>
                <InfoTip title="Protect Loud Sounds">Prevents sudden loud moments from becoming harsh or distorted.</InfoTip>
              </span>
              <small>Prevents distortion when your audio becomes too loud.</small>
              <button
                type="button"
                className={`eam-switch ${audioSettings.protectLoudSounds ? 'active' : ''}`}
                disabled={audioSettings.audioMode === 'raw'}
                onClick={() => updateAudioSetting('protectLoudSounds', !audioSettings.protectLoudSounds)}
                aria-pressed={audioSettings.protectLoudSounds}
              >
                <span /> {audioSettings.protectLoudSounds ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </div>

        <div className="eam-preview-row">
          <div><strong>Test Audio</strong><span>Hear your current settings before you go live.</span></div>
          <button
            type="button"
            className={testingAudio && monitoring.enabled ? 'active' : ''}
            onClick={testProcessedAudio}
            disabled={monitorWorking || workingChannel === 'host'}
          >
            {testingAudio && monitoring.enabled ? <FaStop /> : <FaPlay />}
            {testingAudio && monitoring.enabled ? 'Stop Test Audio' : 'Test Audio'}
          </button>
        </div>
      </section>
      </>}

      {error && <div className="eam-error" role="alert"><FaExclamationTriangle /> {error}</div>}

      <div className="eam-workspace">
        <section className="eam-sources" aria-labelledby="live-audio-sources-title">
          <header className="eam-live-section-heading">
            <span aria-hidden="true" />
            <div><h3 id="live-audio-sources-title">Audio Sources</h3><p>Adjust the channels that are in your live audience mix.</p></div>
          </header>
          <div className="eam-source-grid">
            {renderChannel('host', <FaMicrophone />)}
            {renderChannel('guest', <FaMicrophone />)}
            {renderChannel('media', <FaDesktop />)}
            {channels.screen?.connected && renderChannel('screen', <FaDesktop />)}
          </div>

          {compact ? (
            <div className="eam-live-mix-status">
              <span><FaCheckCircle /></span>
              <div>
                <strong>Live mix status</strong>
                <p>{Object.values(channels).some((channel) => channel?.connected)
                  ? 'Your Sound Check sources are ready for live control.'
                  : 'No sources are connected. Return to Sound Check to add one.'}</p>
              </div>
            </div>
          ) : (
            <div className={`eam-guidance ${balanceAdvice.tone}`}>
              <span>{balanceAdvice.tone === 'good' ? <FaCheckCircle /> : <FaVolumeUp />}</span>
              <div><strong>{balanceAdvice.title}</strong><p>{balanceAdvice.copy}</p></div>
            </div>
          )}
        </section>

        <aside className="eam-output-column">
          <section className="eam-output-card monitor" aria-label="Headphones and monitoring">
            <div className="eam-output-head">
              <span><FaHeadphones /></span>
              <div><h3>Monitoring</h3><small>What you hear</small></div>
            </div>
            <p className="eam-output-explainer">
              This does not change what your audience hears. Use it to listen privately while setting your mix.
            </p>

            <label className="eam-monitor-volume">
              <span>Monitoring level</span>
              <strong>{Math.round((monitoring.gain || 0) * 100)}%</strong>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={monitoring.gain}
                onChange={(event) => setMonitorGain(event.target.value)}
              />
            </label>

            <label className="eam-output-select">
              <span>Output to</span>
              <select
                value={monitorDeviceId || monitoring.outputDeviceId || ''}
                onChange={(event) => changeMonitorOutput(event.target.value)}
                disabled={monitorWorking || !monitoring.outputSelectionSupported}
              >
                <option value="">System default output</option>
                {outputs
                  .filter((device) => device.deviceId && device.deviceId !== 'default')
                  .map((device) => (
                    <option value={device.deviceId} key={device.deviceId}>{device.label}</option>
                  ))}
              </select>
            </label>

            <div className="eam-monitor-actions">
              <button type="button" onClick={testOutput} disabled={testingOutput || monitorWorking}>
                {testingOutput ? 'Playing tone...' : 'Test headphones'}
              </button>
              <button
                type="button"
                className={monitoring.enabled ? 'active' : ''}
                onClick={handleMonitoring}
                disabled={monitorWorking}
              >
                <FaHeadphones /> {monitoring.enabled ? 'Monitoring on' : 'Start monitoring'}
              </button>
            </div>

            <small className="eam-headphone-note">Use headphones when a live microphone is open to prevent feedback.</small>
          </section>

          <section className="eam-output-card audience" aria-label="Audience output">
            <div className="eam-output-head">
              <span><FaVolumeUp /></span>
              <div><h3>Audience Output</h3><small>What your listeners hear</small></div>
            </div>
            <p className="eam-output-explainer">This is the final mix Echoo sends to listeners, recording, and live transcription.</p>

            <label className="eam-master-control">
              <span>Master Volume</span>
              <strong>{audioSettings.masterVolume}%</strong>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={audioSettings.masterVolume}
                onChange={(event) => updateAudioSetting('masterVolume', Number(event.target.value))}
                aria-label="Master Volume"
              />
            </label>

            <LevelMeter connected level={master.level} peakDb={master.peakDb} master />
            <div className="eam-zone-labels"><span>Too low</span><span>Good</span><span>Loud</span><span>Too loud</span></div>

            <div className={`eam-master-status ${masterState.id}`}>
              <strong>{master.muted ? 'Audience output is muted' : masterState.label}</strong>
              <span>{master.muted ? 'Listeners will not hear the mix until you unmute.' : masterState.helper}</span>
            </div>

            <button
              type="button"
              className={`eam-master-mute ${master.muted ? 'active' : ''}`}
              onClick={toggleMasterMute}
            >
              {master.muted ? <FaVolumeUp /> : <FaVolumeMute />}
              {master.muted ? 'Unmute audience' : 'Mute audience output'}
            </button>
          </section>
        </aside>
      </div>

      <div className="eam-path-note">
        <FaCheckCircle />
        <span><strong>One final program feed.</strong> Your selected audio mode and Master Volume create the single Echoo Studio Mix used by listeners, recording, and live transcription.</span>
      </div>
    </section>
  );
};

export default CreatorAudioMixer;
