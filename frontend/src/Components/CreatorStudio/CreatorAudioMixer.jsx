import { useEffect, useMemo, useState } from 'react';
import {
  FaDesktop,
  FaHeadphones,
  FaMicrophone,
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
  toggleMixerChannelSolo,
} from '../../services/echooMixerService';
import './CreatorAudioMixer.css';

const formatDb = (value) => {
  const db = Number(value);
  if (!Number.isFinite(db) || db <= ECHOO_MIXER_LIMITS.minDb + 0.1) return '-∞ dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
};

const Meter = ({ level = 0, peakDb = ECHOO_MIXER_LIMITS.minDb }) => (
  <div className="eam-meter-wrap" aria-label={`Peak ${formatDb(peakDb)}`}>
    <div className="eam-meter" aria-hidden="true">
      <span className="eam-meter-fill" style={{ height: `${Math.max(1.5, level * 100)}%` }} />
      <i className="hot" />
      <i className="warm" />
    </div>
    <small>{formatDb(peakDb)}</small>
  </div>
);

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
  const [error, setError] = useState('');

  useEffect(() =>
    subscribeEchooMixer((next) => {
      setMixer(next);
      onStateChange?.(next);
    }), [onStateChange]);

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
        return nextInputs.find((device) => device.deviceId !== hostDeviceId)?.deviceId || '';
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

  const connectHost = async () => {
    try {
      setWorkingChannel('host');
      setError('');
      await ensureHostInput(hostDeviceId);
      await refreshDevices();
    } catch (connectError) {
      setError(connectError?.message || 'Could not connect the host microphone.');
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
      await connectSystemAudio();
    } catch (connectError) {
      setError(connectError?.message || 'Could not connect shared audio.');
    } finally {
      setWorkingChannel('');
    }
  };

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
      solo: false,
      level: 0,
      rmsDb: ECHOO_MIXER_LIMITS.minDb,
      peakDb: ECHOO_MIXER_LIMITS.minDb,
      connected: false,
    };
    const clipping = channel.connected && Number(channel.peakDb) >= ECHOO_MIXER_LIMITS.clipDb;
    const faderDb = gainToDb(channel.gain);

    return (
      <article
        className={`eam-channel ${channel.connected ? 'connected' : ''} ${clipping ? 'clipping' : ''}`}
        key={channelId}
      >
        {clipping && <span className="eam-clip" role="status">CLIP</span>}
        <div className="eam-channel-head">
          <span className="eam-channel-icon">{icon}</span>
          <div>
            <strong>{channel.name}</strong>
            <small>{channel.sourceLabel}</small>
          </div>
        </div>

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

        <div className="eam-channel-body">
          <Meter level={channel.level} peakDb={channel.peakDb} />
          <input
            className="eam-fader"
            type="range"
            min={ECHOO_MIXER_LIMITS.minDb}
            max={ECHOO_MIXER_LIMITS.maxChannelDb}
            step="0.5"
            value={faderDb}
            onChange={(event) => setMixerChannelGainDb(channelId, event.target.value)}
            onDoubleClick={() => setMixerChannelGainDb(channelId, 0)}
            aria-label={`${channel.name} fader in decibels`}
          />
        </div>

        <strong className="eam-db">{formatDb(faderDb)}</strong>
        <small className="eam-unity-hint">Double-click fader for 0 dB</small>

        <div className="eam-channel-controls">
          <button
            type="button"
            className={channel.muted ? 'active mute' : ''}
            onClick={() => toggleMixerChannelMute(channelId)}
            disabled={!channel.connected}
            aria-pressed={channel.muted}
            title={`Mute ${channel.name}`}
          >M</button>
          <button
            type="button"
            className={channel.solo ? 'active' : ''}
            onClick={() => toggleMixerChannelSolo(channelId)}
            disabled={!channel.connected}
            aria-pressed={channel.solo}
            title={`Solo ${channel.name}`}
          >S</button>
        </div>

        <button
          type="button"
          className="eam-connect"
          disabled={workingChannel === channelId}
          onClick={() => channel.connected ? disconnectMixerChannel(channelId) : connectAction()}
        >
          {workingChannel === channelId
            ? 'Connecting...'
            : channel.connected
              ? 'Disconnect'
              : channelId === 'media'
                ? 'Share system audio'
                : channelId === 'guest'
                  ? 'Connect guest input'
                  : 'Connect host mic'}
        </button>
      </article>
    );
  };

  const masterClipping = Number(master.peakDb) >= ECHOO_MIXER_LIMITS.clipDb;
  const masterDb = gainToDb(master.gain);

  return (
    <section className={`eam ${compact ? 'compact' : ''}`}>
      <div className="eam-heading">
        <div>
          <span>BROADCAST AUDIO</span>
          <h2>Studio mixer</h2>
          <p>Route, meter and monitor the exact mix that Echoo publishes to listeners.</p>
        </div>
        <button type="button" className="eam-reset" onClick={resetEchooMixer}>
          <FaRedo /> Reset to unity
        </button>
      </div>

      {error && <div className="eam-error" role="alert">{error}</div>}

      <section className="eam-monitor-panel" aria-label="Studio monitoring">
        <div className="eam-monitor-title">
          <span className={monitoring.enabled ? 'active' : ''}><FaHeadphones /></span>
          <div>
            <strong>Headphone monitoring</strong>
            <small>Hear the post-limiter master mix locally. This does not add a second audio track to the broadcast.</small>
          </div>
        </div>

        <div className="eam-monitor-controls">
          <select
            value={monitorDeviceId || monitoring.outputDeviceId || ''}
            onChange={(event) => changeMonitorOutput(event.target.value)}
            disabled={monitorWorking || !monitoring.outputSelectionSupported}
            aria-label="Monitoring output device"
          >
            <option value="">System default output</option>
            {outputs
              .filter((device) => device.deviceId && device.deviceId !== 'default')
              .map((device) => (
                <option value={device.deviceId} key={device.deviceId}>{device.label}</option>
              ))}
          </select>

          <button
            type="button"
            className="eam-monitor-test"
            onClick={testOutput}
            disabled={testingOutput || monitorWorking}
          >
            {testingOutput ? 'Playing tone...' : 'Test output'}
          </button>

          <button
            type="button"
            className={`eam-monitor-toggle ${monitoring.enabled ? 'active' : ''}`}
            onClick={handleMonitoring}
            disabled={monitorWorking}
            aria-pressed={monitoring.enabled}
          >
            <FaHeadphones />
            {monitorWorking
              ? 'Please wait...'
              : monitoring.enabled
                ? 'Monitoring on'
                : 'Monitor master'}
          </button>
        </div>

        <label className="eam-monitor-volume">
          <span>Monitor volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={monitoring.gain}
            onChange={(event) => setMonitorGain(event.target.value)}
          />
          <strong>{Math.round((monitoring.gain || 0) * 100)}%</strong>
        </label>

        <p className="eam-monitor-warning">
          Use earphones/headphones when monitoring a live microphone. Monitoring through speakers can create feedback.
        </p>
      </section>

      <div className="eam-grid">
        {renderChannel('host', <FaMicrophone />, connectHost)}
        {renderChannel('guest', <FaMicrophone />, connectGuest)}
        {renderChannel('media', <FaDesktop />, connectMedia)}

        <article className={`eam-channel master connected ${masterClipping ? 'clipping' : ''}`}>
          {masterClipping && <span className="eam-clip" role="status">CLIP</span>}
          <div className="eam-channel-head">
            <span className="eam-channel-icon"><FaVolumeUp /></span>
            <div><strong>Master Output</strong><small>Limiter → LiveKit program feed</small></div>
          </div>
          <div className="eam-channel-body">
            <Meter level={master.level} peakDb={master.peakDb} />
            <input
              className="eam-fader"
              type="range"
              min={ECHOO_MIXER_LIMITS.minDb}
              max={ECHOO_MIXER_LIMITS.maxMasterDb}
              step="0.5"
              value={masterDb}
              onChange={(event) => setMasterGainDb(event.target.value)}
              onDoubleClick={() => setMasterGainDb(0)}
              aria-label="Master output fader in decibels"
            />
          </div>
          <strong className="eam-db">{formatDb(masterDb)}</strong>
          <small className="eam-unity-hint">Safety limiter at -1 dBFS</small>
          <div className="eam-channel-controls master-controls">
            <button
              type="button"
              className={master.muted ? 'active mute' : ''}
              onClick={toggleMasterMute}
              aria-pressed={master.muted}
              title="Mute master output"
            >
              {master.muted ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
          </div>
          <div className="eam-output-status">
            <span className={channels.host?.connected && !master.muted ? 'ready' : ''} />
            {master.muted
              ? 'Master muted'
              : channels.host?.connected
                ? 'Program output ready'
                : 'Connect host mic'}
          </div>
        </article>
      </div>

      <div className="eam-legend">
        <span><b>M</b> Mute</span>
        <span><b>S</b> Solo</span>
        <span>0 dB is unity gain. Red CLIP means the signal is too hot.</span>
        <span>Master monitoring is the same post-limiter signal sent to LiveKit.</span>
      </div>
    </section>
  );
};

export default CreatorAudioMixer;
