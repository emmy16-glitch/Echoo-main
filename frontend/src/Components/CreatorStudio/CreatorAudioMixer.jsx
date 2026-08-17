import { useEffect, useMemo, useState } from 'react';
import {
  FaDesktop,
  FaMicrophone,
  FaRedo,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';

import {
  connectGuestInput,
  connectSystemAudio,
  disconnectMixerChannel,
  ensureHostInput,
  listAudioInputs,
  resetEchooMixer,
  setMasterGain,
  setMixerChannelGain,
  subscribeEchooMixer,
  toggleMasterMute,
  toggleMixerChannelMute,
  toggleMixerChannelSolo,
} from '../../services/echooMixerService';
import './CreatorAudioMixer.css';

const gainToDb = (gain) => {
  const value = Number(gain) || 0;
  if (value <= 0.001) return '-∞';
  return `${(20 * Math.log10(value)).toFixed(1)} dB`;
};

const Meter = ({ level = 0 }) => (
  <div className="eam-meter" aria-hidden="true">
    <span className="eam-meter-fill" style={{ height: `${Math.max(2, level * 100)}%` }} />
    <i className="hot" />
    <i className="warm" />
  </div>
);

const CreatorAudioMixer = ({ compact = false, onStateChange }) => {
  const [mixer, setMixer] = useState(null);
  const [devices, setDevices] = useState([]);
  const [guestDeviceId, setGuestDeviceId] = useState('');
  const [workingChannel, setWorkingChannel] = useState('');
  const [error, setError] = useState('');

  useEffect(() =>
    subscribeEchooMixer((next) => {
      setMixer(next);
      onStateChange?.(next);
    }), [onStateChange]);

  const refreshDevices = async () => {
    try {
      const nextDevices = await listAudioInputs();
      setDevices(nextDevices);
      if (!guestDeviceId && nextDevices.length > 1) {
        setGuestDeviceId(nextDevices[1].deviceId);
      }
    } catch {
      setDevices([]);
    }
  };

  const connectHost = async () => {
    try {
      setWorkingChannel('host');
      setError('');
      await ensureHostInput();
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
      if (!devices.length) await refreshDevices();
      const nextDeviceId = guestDeviceId || devices[1]?.deviceId || devices[0]?.deviceId;
      if (!nextDeviceId) throw new Error('No additional microphone was found.');
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
  const master = mixer?.master || { gain: 0.84, muted: false, level: 0 };

  const renderChannel = (channelId, icon, connectAction) => {
    const channel = channels[channelId] || {
      name: channelId,
      sourceLabel: 'Not connected',
      gain: 0,
      muted: false,
      solo: false,
      level: 0,
      connected: false,
    };

    return (
      <article className={`eam-channel ${channel.connected ? 'connected' : ''}`} key={channelId}>
        <div className="eam-channel-head">
          <span className="eam-channel-icon">{icon}</span>
          <div>
            <strong>{channel.name}</strong>
            <small>{channel.sourceLabel}</small>
          </div>
        </div>

        <div className="eam-channel-body">
          <Meter level={channel.level} />
          <input
            className="eam-fader"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={channel.gain}
            onChange={(event) => setMixerChannelGain(channelId, event.target.value)}
            aria-label={`${channel.name} volume`}
          />
        </div>

        <strong className="eam-db">{gainToDb(channel.gain)}</strong>

        <div className="eam-channel-controls">
          <button
            type="button"
            className={channel.muted ? 'active mute' : ''}
            onClick={() => toggleMixerChannelMute(channelId)}
            disabled={!channel.connected}
          >M</button>
          <button
            type="button"
            className={channel.solo ? 'active' : ''}
            onClick={() => toggleMixerChannelSolo(channelId)}
            disabled={!channel.connected}
          >S</button>
        </div>

        {channelId === 'guest' && devices.length > 0 && !channel.connected && (
          <select
            className="eam-device-select"
            value={guestDeviceId}
            onChange={(event) => setGuestDeviceId(event.target.value)}
          >
            <option value="">Choose microphone</option>
            {devices.map((device) => (
              <option value={device.deviceId} key={device.deviceId}>{device.label}</option>
            ))}
          </select>
        )}

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
                ? 'Share audio'
                : channelId === 'guest'
                  ? 'Add input'
                  : 'Connect mic'}
        </button>
      </article>
    );
  };

  return (
    <section className={`eam ${compact ? 'compact' : ''}`}>
      <div className="eam-heading">
        <div>
          <span>AUDIO MIXER</span>
          <h2>Studio mix</h2>
          <p>Balance every source before it reaches your listeners.</p>
        </div>
        <button type="button" className="eam-reset" onClick={resetEchooMixer}>
          <FaRedo /> Reset levels
        </button>
      </div>

      {error && <div className="eam-error">{error}</div>}

      <div className="eam-grid">
        {renderChannel('host', <FaMicrophone />, connectHost)}
        {renderChannel('guest', <FaMicrophone />, connectGuest)}
        {renderChannel('media', <FaDesktop />, connectMedia)}

        <article className="eam-channel master connected">
          <div className="eam-channel-head">
            <span className="eam-channel-icon"><FaVolumeUp /></span>
            <div><strong>Master Output</strong><small>Echoo live mix</small></div>
          </div>
          <div className="eam-channel-body">
            <Meter level={master.level} />
            <input
              className="eam-fader"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={master.gain}
              onChange={(event) => setMasterGain(event.target.value)}
              aria-label="Master output volume"
            />
          </div>
          <strong className="eam-db">{gainToDb(master.gain)}</strong>
          <div className="eam-channel-controls master-controls">
            <button
              type="button"
              className={master.muted ? 'active mute' : ''}
              onClick={toggleMasterMute}
            >
              {master.muted ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
          </div>
          <div className="eam-output-status">
            <span className={channels.host?.connected ? 'ready' : ''} />
            {channels.host?.connected ? 'Output ready' : 'Connect host mic'}
          </div>
        </article>
      </div>

      <div className="eam-legend"><span><b>M</b> Mute</span><span><b>S</b> Solo</span><span>Music / FX uses browser system-audio sharing.</span></div>
    </section>
  );
};

export default CreatorAudioMixer;
