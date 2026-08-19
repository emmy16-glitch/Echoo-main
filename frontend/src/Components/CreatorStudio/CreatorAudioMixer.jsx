import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCheckCircle,
  FaDesktop,
  FaExclamationTriangle,
  FaHeadphones,
  FaMicrophone,
  FaPlug,
  FaRedo,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';

import {
  ECHOO_MIXER_LIMITS,
  connectGuestInput,
  connectSystemAudio,
  disconnectMixerChannel,
  ensureHostInput,
  gainToDb,
  getEchooMixerState,
  listAudioInputs,
  listAudioOutputs,
  playMonitorTestTone,
  resetEchooMixer,
  setMasterGainDb,
  setMixerChannelGainDb,
  setMonitorEnabled,
  setMonitorGain,
  setMonitorOutputDevice,
  subscribeEchooMixer,
  toggleMasterMute,
  toggleMixerChannelMute,
} from '../../services/echooMixerService';
import {
  BROADCAST_CAPTURE_PROFILES,
  applyBroadcastCaptureProfile,
  applyProgramTrackQuality,
  audioQualityLabel,
  getBroadcastCaptureProfile,
  saveBroadcastCaptureProfile,
} from '../../services/audioQualityProfile';
import './CreatorAudioMixer.css';

const formatDb = (value) => {
  const db = Number(value);
  if (!Number.isFinite(db) || db <= ECHOO_MIXER_LIMITS.minDb + 0.1) return '-∞ dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
};

const SOURCE_COPY = Object.freeze({
  host: {
    helper: 'Your main microphone',
    empty: 'Connect the microphone you will speak through.',
  },
  guest: {
    helper: 'Second microphone or guest input',
    empty: 'Connect a second mic only when you need it.',
  },
  media: {
    helper: 'Music and sound from your computer',
    empty: 'Share a browser tab or screen that includes audio.',
  },
});

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

const CreatorAudioMixer = ({ compact = false, onStateChange }) => {
  const [mixer, setMixer] = useState(() => getEchooMixerState());
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [hostDeviceId, setHostDeviceId] = useState('');
  const [guestDeviceId, setGuestDeviceId] = useState('');
  const [monitorDeviceId, setMonitorDeviceId] = useState('');
  const [workingChannel, setWorkingChannel] = useState('');
  const [monitorWorking, setMonitorWorking] = useState(false);
  const [testingOutput, setTestingOutput] = useState(false);
  const [captureProfile, setCaptureProfile] = useState(getBroadcastCaptureProfile);
  const [qualitySummary, setQualitySummary] = useState({});
  const [error, setError] = useState('');
  const autoProfileApplied = useRef(false);

  useEffect(() =>
    subscribeEchooMixer((next) => {
      setMixer(next);
      onStateChange?.(next);
    }), [onStateChange]);

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

  const refreshDevices = async () => {
    try {
      const [nextInputs, nextOutputs] = await Promise.all([
        listAudioInputs(),
        listAudioOutputs(),
      ]);

      setInputs(nextInputs);
      setOutputs(nextOutputs);

      setHostDeviceId((current) =>
        current && nextInputs.some((device) => device.deviceId === current)
          ? current
          : ''
      );

      setGuestDeviceId((current) => {
        if (current && nextInputs.some((device) => device.deviceId === current)) {
          return current;
        }
        return nextInputs.find((device) => device.deviceId !== channels.host?.deviceId)?.deviceId || '';
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
    // Device refresh is intentionally registered once for hardware hot-plug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyMicQuality = async (track, channelId, profileId = captureProfile) => {
    const summary = await applyBroadcastCaptureProfile(track, profileId);
    setQualitySummary((current) => ({ ...current, [channelId]: summary }));
    return summary;
  };

  const connectHost = async ({ quiet = false } = {}) => {
    try {
      setWorkingChannel('host');
      setError('');
      const deviceId = hostDeviceId || channels.host?.deviceId || '';
      const track = await ensureHostInput(deviceId);
      await applyMicQuality(track, 'host');
      await refreshDevices();
    } catch (connectError) {
      if (!quiet) setError(connectError?.message || 'Could not connect the host microphone.');
    } finally {
      setWorkingChannel('');
    }
  };

  const connectGuest = async ({ quiet = false } = {}) => {
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

      const track = await connectGuestInput(nextDeviceId);
      await applyMicQuality(track, 'guest');
    } catch (connectError) {
      if (!quiet) setError(connectError?.message || 'Could not connect the guest microphone.');
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

  useEffect(() => {
    if (autoProfileApplied.current || !channels.host?.connected) return;
    autoProfileApplied.current = true;
    connectHost({ quiet: true });
    // A host mic can be connected from the page-level Test microphone button.
    // Re-open it once so the saved Echoo capture profile is actually applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.host?.connected]);

  const changeCaptureProfile = async (nextProfile) => {
    if (!BROADCAST_CAPTURE_PROFILES[nextProfile] || nextProfile === captureProfile) return;
    setCaptureProfile(saveBroadcastCaptureProfile(nextProfile));
    setError('');

    try {
      setWorkingChannel('profile');
      if (channels.host?.connected) {
        const hostTrack = await ensureHostInput(channels.host.deviceId || hostDeviceId || '');
        const summary = await applyBroadcastCaptureProfile(hostTrack, nextProfile);
        setQualitySummary((current) => ({ ...current, host: summary }));
      }
      if (channels.guest?.connected && channels.guest.deviceId) {
        const guestTrack = await connectGuestInput(channels.guest.deviceId);
        const summary = await applyBroadcastCaptureProfile(guestTrack, nextProfile);
        setQualitySummary((current) => ({ ...current, guest: summary }));
      }
    } catch (profileError) {
      setError(profileError?.message || 'Could not apply the new microphone sound profile.');
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

  const renderChannel = (channelId, icon, connectAction) => {
    const channel = channels[channelId] || {
      name: channelId,
      sourceLabel: 'Not connected',
      deviceId: '',
      gain: 1,
      muted: false,
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

        <p className="eam-source-purpose">{copy.helper}</p>
        <small className="eam-source-device">
          {channel.connected ? channel.sourceLabel : copy.empty}
        </small>

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

        <div className="eam-level-control">
          <div className="eam-control-label">
            <span>Level</span>
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

        {summary && (
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
            className="primary"
            disabled={isWorking || workingChannel === 'profile'}
            onClick={() => channel.connected ? disconnectMixerChannel(channelId) : connectAction()}
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
      </article>
    );
  };

  const masterDb = gainToDb(master.gain);
  const masterState = getLevelState({ connected: true, peakDb: master.peakDb, master: true });

  const balanceAdvice = useMemo(() => {
    const host = channels.host;
    const media = channels.media;
    if (!host?.connected || !media?.connected) {
      return {
        tone: 'neutral',
        title: 'Build your mix one source at a time',
        copy: 'Connect your microphone first, then add music only when you need it.',
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

  return (
    <section className={`eam ${compact ? 'compact' : ''}`}>
      <div className="eam-heading">
        <div>
          <span>BROADCAST AUDIO</span>
          <h2>Studio Mixer</h2>
          <p>Simple controls for the exact sound your audience receives.</p>
        </div>
        <button type="button" className="eam-reset" onClick={resetEchooMixer}>
          <FaRedo /> Reset levels
        </button>
      </div>

      <section className="eam-profile" aria-label="Microphone sound profile">
        <div>
          <strong>Microphone sound</strong>
          <span>Choose how Echoo treats voice inputs before they enter the mix.</span>
        </div>
        <div className="eam-profile-options">
          {Object.values(BROADCAST_CAPTURE_PROFILES).map((profile) => (
            <button
              type="button"
              key={profile.id}
              className={captureProfile === profile.id ? 'active' : ''}
              onClick={() => changeCaptureProfile(profile.id)}
              disabled={workingChannel === 'profile'}
            >
              <strong>{profile.label}</strong>
              {!compact && <small>{profile.shortDescription}</small>}
            </button>
          ))}
        </div>
        <p>
          {captureProfile === 'studio'
            ? 'Studio clean keeps your microphone natural. Use headphones to avoid speaker feedback.'
            : 'Voice cleanup uses browser echo, noise and automatic level processing for everyday microphones.'}
        </p>
      </section>

      {error && <div className="eam-error" role="alert"><FaExclamationTriangle /> {error}</div>}

      <div className="eam-workspace">
        <div className="eam-sources">
          <div className="eam-source-grid">
            {renderChannel('host', <FaMicrophone />, connectHost)}
            {renderChannel('guest', <FaMicrophone />, connectGuest)}
            {renderChannel('media', <FaDesktop />, connectMedia)}
          </div>

          <div className={`eam-guidance ${balanceAdvice.tone}`}>
            <span>{balanceAdvice.tone === 'good' ? <FaCheckCircle /> : <FaVolumeUp />}</span>
            <div><strong>{balanceAdvice.title}</strong><p>{balanceAdvice.copy}</p></div>
          </div>
        </div>

        <aside className="eam-output-column">
          <section className="eam-output-card monitor" aria-label="Headphones and monitoring">
            <div className="eam-output-head">
              <span><FaHeadphones /></span>
              <div><strong>Headphones / Monitor</strong><small>What you hear</small></div>
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
              <div><strong>Audience Output</strong><small>What your listeners hear</small></div>
            </div>
            <p className="eam-output-explainer">This is the final post-limiter mix that Echoo publishes to LiveKit.</p>

            <label className="eam-master-control">
              <span>Master level</span>
              <strong>{formatDb(masterDb)}</strong>
              <input
                type="range"
                min={ECHOO_MIXER_LIMITS.minDb}
                max={ECHOO_MIXER_LIMITS.maxMasterDb}
                step="0.5"
                value={masterDb}
                onChange={(event) => setMasterGainDb(event.target.value)}
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
        <span><strong>One clean program feed.</strong> Microphones and music are mixed here first, protected by the master limiter, then sent as one stereo LiveKit stream.</span>
      </div>
    </section>
  );
};

export default CreatorAudioMixer;
