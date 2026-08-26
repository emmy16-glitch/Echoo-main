import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaCheck,
  FaDesktop,
  FaHeadphones,
  FaMicrophone,
  FaMusic,
  FaRedo,
  FaTimes,
  FaVolumeMute,
  FaVolumeUp,
} from 'react-icons/fa';

import {
  connectGuestInput,
  connectMediaFile,
  connectSystemAudio,
  disconnectMixerChannel,
  ensureHostInput,
  getEchooMixerState,
  listAudioInputs,
  setCreatorAudioSettings,
  setMixerChannelGain,
  setMonitorEnabled,
  subscribeEchooMixer,
  toggleMixerChannelMute,
} from '../../services/echooMixerService';
import {
  getCachedCreatorAudioSettings,
  loadCreatorAudioSettings,
  normalizeCreatorAudioSettings,
  saveCreatorAudioSettings,
} from '../../services/creatorAudioPreferences';

const SOURCE_META = {
  host: { label: 'Host Mic', icon: FaMicrophone },
  guest: { label: 'Guest Mic', icon: FaMicrophone },
  media: { label: 'Music / FX', icon: FaMusic },
  screen: { label: 'Screen / Tab', icon: FaDesktop },
};

const meterBars = Array.from({ length: 18 }, (_, index) => index);

const AudioMeter = ({ level = 0, label }) => {
  const active = Math.round(Math.max(0, Math.min(1, Number(level) || 0)) * meterBars.length);
  return (
    <div className="ecbs-meter" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round((Number(level) || 0) * 100)}>
      {meterBars.map((bar) => <span key={bar} className={bar < active ? 'active' : ''} />)}
    </div>
  );
};

const friendlyLevel = (peakDb) => {
  const value = Number(peakDb);
  if (value >= -3) return { label: 'Too loud', tone: 'hot' };
  if (value >= -18) return { label: 'Good', tone: 'good' };
  if (value > -55) return { label: 'Quiet', tone: 'quiet' };
  return { label: 'Waiting', tone: 'idle' };
};

const CreatorBroadcastAudioSurface = ({ variant = 'setup', onStateChange, showMonitoring = true }) => {
  const [mixer, setMixer] = useState(() => getEchooMixerState());
  const [settings, setSettings] = useState(getCachedCreatorAudioSettings);
  const [inputs, setInputs] = useState([]);
  const [guestDeviceId, setGuestDeviceId] = useState('');
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const saveTimer = useRef(null);
  const mediaFileInput = useRef(null);

  useEffect(() => subscribeEchooMixer((next) => {
    setMixer(next);
    if (next.processing?.settings) setSettings(next.processing.settings);
    onStateChange?.(next);
  }), [onStateChange]);

  useEffect(() => {
    let active = true;
    loadCreatorAudioSettings().then((loaded) => {
      if (!active) return;
      setSettings(loaded);
      void setCreatorAudioSettings(loaded);
    });
    listAudioInputs().then((devices) => active && setInputs(devices)).catch(() => {});
    return () => {
      active = false;
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  const channels = useMemo(() => mixer.channels || {}, [mixer.channels]);
  const master = mixer.master || {};
  const monitoring = mixer.monitoring || {};
  const masterLevel = friendlyLevel(master.peakDb);

  const updateSetting = (key, value) => {
    const next = normalizeCreatorAudioSettings({ ...settings, [key]: value });
    setSettings(next);
    setError('');
    void setCreatorAudioSettings(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveCreatorAudioSettings(next).catch(() => setError('Audio is updated locally, but account sync is unavailable.'));
    }, 450);
  };

  const resetTools = () => {
    const next = normalizeCreatorAudioSettings({
      ...settings,
      noiseReduction: 45,
      echoRemoval: true,
      voiceWarmth: 45,
      voiceClarity: 45,
      deEsser: 30,
      volumeBalance: 45,
      protectLoudSounds: true,
    });
    setSettings(next);
    void setCreatorAudioSettings(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveCreatorAudioSettings(next).catch(() => setError('Audio is updated locally, but account sync is unavailable.'));
    }, 450);
  };

  const connect = useCallback(async (channelId) => {
    try {
      setWorking(channelId);
      setError('');
      if (channelId === 'host') await ensureHostInput();
      if (channelId === 'guest') {
        const deviceId = guestDeviceId || inputs.find((device) => device.deviceId !== channels.host?.deviceId)?.deviceId;
        if (!deviceId) throw new Error('Choose a second microphone for Guest Mic.');
        await connectGuestInput(deviceId);
      }
      if (channelId === 'screen') await connectSystemAudio();
      setInputs(await listAudioInputs());
    } catch (connectError) {
      setError(connectError?.message || 'Could not connect this audio source.');
    } finally {
      setWorking('');
    }
  }, [channels.host?.deviceId, guestDeviceId, inputs]);

  const chooseMediaFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setWorking('media');
      setError('');
      await connectMediaFile(file);
    } catch (mediaError) {
      setError(mediaError?.message || 'Could not add this audio file.');
    } finally {
      setWorking('');
    }
  };

  const toggleTestAudio = async () => {
    try {
      setWorking('monitor');
      setError('');
      if (!channels.host?.connected) await ensureHostInput();
      await setMonitorEnabled(!monitoring.enabled);
    } catch (monitorError) {
      setError(monitorError?.message || 'Could not start audio monitoring.');
    } finally {
      setWorking('');
    }
  };

  const sourceCards = Object.keys(SOURCE_META).map((channelId) => {
    const channel = channels[channelId] || {};
    const Icon = SOURCE_META[channelId].icon;
    return (
      <article className={`ecbs-source ${channel.connected ? 'connected' : ''}`} key={channelId}>
        <header>
          <span className="ecbs-source-icon"><Icon /></span>
          <div><strong>{SOURCE_META[channelId].label}</strong><small>{channel.connected ? (Number(channel.level) > 0.02 ? 'Connected · signal detected' : 'Connected · waiting for signal') : 'Not connected'}</small></div>
          <i aria-label={channel.connected ? 'Connected' : 'Disconnected'} />
        </header>
        {channelId === 'guest' && !channel.connected && inputs.length > 1 && (
          <select value={guestDeviceId} onChange={(event) => setGuestDeviceId(event.target.value)} aria-label="Guest microphone">
            <option value="">Choose input</option>
            {inputs.filter((device) => device.deviceId !== channels.host?.deviceId).map((device) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        )}
        {channelId === 'media' && (
          <input ref={mediaFileInput} className="ecbs-file-input" type="file" accept="audio/*" onChange={chooseMediaFile} />
        )}
        <AudioMeter level={channel.level} label={`${SOURCE_META[channelId].label} level`} />
        {channel.connected ? (
          <div className="ecbs-source-controls">
            {variant === 'live' ? (
              <>
                <input type="range" min="0" max="1.5" step="0.01" value={channel.gain ?? 1} onChange={(event) => setMixerChannelGain(channelId, event.target.value)} aria-label={`${SOURCE_META[channelId].label} volume`} />
                <strong>{Math.round((channel.gain ?? 1) * 100)}%</strong>
                <button type="button" className={channel.muted ? 'active' : ''} onClick={() => toggleMixerChannelMute(channelId)} title={channel.muted ? 'Unmute' : 'Mute'}>{channel.muted ? <FaVolumeMute /> : <FaVolumeUp />}</button>
                <button type="button" onClick={() => disconnectMixerChannel(channelId)} title="Disconnect source"><FaTimes /></button>
              </>
            ) : (
              <>
                <span>Level and mute controls are available in the Live Mixer.</span>
                <button type="button" onClick={() => disconnectMixerChannel(channelId)} title="Disconnect source"><FaTimes /></button>
              </>
            )}
          </div>
        ) : (
          <button type="button" className="ecbs-connect" onClick={() => channelId === 'media' ? mediaFileInput.current?.click() : connect(channelId)} disabled={Boolean(working)}>
            {working === channelId ? 'Connecting...' : channelId === 'media' ? 'Add audio' : channelId === 'screen' ? 'Share tab / screen' : `Connect ${SOURCE_META[channelId].label}`}
          </button>
        )}
        <small className="ecbs-source-name">{channel.sourceLabel || (channelId === 'media' ? 'No audio selected' : channelId === 'screen' ? 'Not sharing' : 'Default microphone')}</small>
      </article>
    );
  });

  const compactTool = (key, label, toggle = false) => (
    <label className="ecbs-tool" key={key}>
      <span>{label}</span>
      {toggle ? (
        <button type="button" className={settings[key] ? 'on' : ''} onClick={() => updateSetting(key, !settings[key])} disabled={settings.audioMode === 'raw'} aria-pressed={settings[key]}><i /></button>
      ) : (
        <><input type="range" min="0" max="100" value={settings[key]} onChange={(event) => updateSetting(key, Number(event.target.value))} disabled={settings.audioMode === 'raw'} /><small>{settings[key]}%</small></>
      )}
    </label>
  );

  if (variant === 'monitor') {
    return (
      <section className="ecbs-monitor-card">
        <header><b>5</b><div><h2>Sound Check &amp; Monitoring</h2><p>Test your inputs and preview what listeners will receive.</p></div></header>
        <div className="ecbs-monitor-actions">
          <button type="button" className={monitoring.enabled ? 'active' : ''} onClick={toggleTestAudio} disabled={working === 'monitor'}><FaHeadphones /> {monitoring.enabled ? 'Stop monitoring' : 'Play test audio'}</button>
          <div><FaHeadphones /><span><strong>Monitoring</strong><small>{monitoring.enabled ? 'Final audience mix is playing.' : 'Use headphones before enabling.'}</small></span><i className={monitoring.enabled ? 'on' : ''} /></div>
        </div>
        <AudioMeter level={master.level} label="Monitoring output level" />
        {error && <p className="ecbs-audio-error" role="alert">{error}</p>}
      </section>
    );
  }

  if (variant === 'live') {
    return (
      <div className="ecbs-live-audio">
        <section className="ecbs-audience-sound">
          <header><h2>Audience Sound</h2><p>Control how your audience hears the show.</p></header>
          <label className="ecbs-master"><span>Master volume</span><strong>{settings.masterVolume}%</strong><input type="range" min="0" max="100" value={settings.masterVolume} onChange={(event) => updateSetting('masterVolume', Number(event.target.value))} /></label>
          <div className="ecbs-output-label"><span>Output level</span><span>Loudness</span></div>
          <AudioMeter level={master.level} label="Audience output level" />
          <div className="ecbs-loudness"><strong>{Number.isFinite(Number(master.rmsDb)) ? `${Number(master.rmsDb).toFixed(0)} dBFS` : '-60 dBFS'}</strong><span className={masterLevel.tone}>{masterLevel.label}</span></div>
        </section>
        <section className="ecbs-live-sources"><header><h2>Sources</h2><p>Manage your audio sources.</p></header><div>{sourceCards}</div></section>
        <section className="ecbs-live-tools"><header><h2>Voice Tools</h2><p>Enhance your voice for clarity.</p></header><div className="ecbs-mode-tabs"><button type="button" className={settings.audioMode === 'enhanced' ? 'active' : ''} onClick={() => updateSetting('audioMode', 'enhanced')}>Enhanced Audio</button><button type="button" className={settings.audioMode === 'raw' ? 'active' : ''} onClick={() => updateSetting('audioMode', 'raw')}>Raw Audio</button></div>{compactTool('noiseReduction', 'Noise reduction')}{compactTool('voiceClarity', 'Voice clarity')}{compactTool('deEsser', 'De-esser')}{compactTool('volumeBalance', 'Volume balance')}</section>
        {error && <p className="ecbs-audio-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="ecbs-setup-audio">
      <section className="ecbs-setup-section">
        <header><b>2</b><div><h2>Audio Setup &amp; Sound Check</h2><p>Choose how your voice should sound before you go live.</p></div></header>
        <div className="ecbs-audio-modes">
          <button type="button" className={settings.audioMode === 'raw' ? 'active' : ''} onClick={() => updateSetting('audioMode', 'raw')}><FaVolumeUp /><span><strong>Raw Audio</strong><small>Send only your original microphone sound.</small></span>{settings.audioMode === 'raw' && <FaCheck />}</button>
          <button type="button" className={settings.audioMode === 'enhanced' ? 'active' : ''} onClick={() => updateSetting('audioMode', 'enhanced')}><FaVolumeUp /><span><strong>Enhanced Audio</strong><small>Cleaner, clearer and more even voice sound.</small></span>{settings.audioMode === 'enhanced' && <FaCheck />}</button>
        </div>
      </section>
      <section className="ecbs-setup-section">
        <header><b>3</b><div><h2>Audio Processing</h2><p>Fine-tune the processing chain that stays active during your broadcast.</p></div><button type="button" className="ecbs-reset-tools" onClick={resetTools}><FaRedo /> Reset tools</button></header>
        <div className="ecbs-tool-grid">{compactTool('noiseReduction', 'Background Noise Removal')}{compactTool('echoRemoval', 'Echo Removal', true)}{compactTool('voiceWarmth', 'Voice Warmth')}{compactTool('voiceClarity', 'Voice Clarity')}{compactTool('deEsser', 'De-esser')}{compactTool('volumeBalance', 'Volume Balance')}{compactTool('protectLoudSounds', 'Protect Loud Sounds', true)}</div>
      </section>
      <section className="ecbs-setup-section">
        <header><b>4</b><div><h2>Audio Sources</h2><p>Connect each source and confirm that it is receiving a signal. Mixing happens after you go live.</p></div></header>
        <div className="ecbs-source-grid">{sourceCards}</div>
      </section>
      {showMonitoring && <section className="ecbs-test-row">
        <div><b>5</b><span><strong>Sound Check</strong><small>Preview your processed voice before going live.</small></span></div>
        <button type="button" className={monitoring.enabled ? 'active' : ''} onClick={toggleTestAudio} disabled={working === 'monitor'}><FaHeadphones /> {monitoring.enabled ? 'Stop test audio' : 'Play test audio'}</button>
        <div><FaHeadphones /><span><strong>Monitoring</strong><small>{monitoring.enabled ? 'You are hearing the final audience mix.' : 'Use headphones to hear what listeners will receive.'}</small></span></div>
      </section>}
      {error && <p className="ecbs-audio-error" role="alert">{error}</p>}
    </div>
  );
};

export default CreatorBroadcastAudioSurface;
