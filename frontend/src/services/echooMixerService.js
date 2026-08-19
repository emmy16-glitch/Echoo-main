const MIN_DB = -60;
const MAX_CHANNEL_DB = 6;
const MAX_MASTER_DB = 3;
const CLIP_DB = -1;

const dbToGain = (db) => {
  const value = Number(db);
  if (!Number.isFinite(value) || value <= MIN_DB) return 0;
  return 10 ** (value / 20);
};

export const gainToDb = (gain) => {
  const value = Number(gain);
  if (!Number.isFinite(value) || value <= 0.001) return MIN_DB;
  return Math.max(MIN_DB, 20 * Math.log10(value));
};

const channelDefaults = {
  host: {
    id: 'host',
    name: 'Host Mic',
    sourceLabel: 'Default input',
    deviceId: '',
    gain: 1,
    muted: false,
    solo: false,
    level: 0,
    rmsDb: MIN_DB,
    peakDb: MIN_DB,
    connected: false,
  },
  guest: {
    id: 'guest',
    name: 'Guest Mic',
    sourceLabel: 'Not connected',
    deviceId: '',
    gain: 1,
    muted: false,
    solo: false,
    level: 0,
    rmsDb: MIN_DB,
    peakDb: MIN_DB,
    connected: false,
  },
  media: {
    id: 'media',
    name: 'Music / FX',
    sourceLabel: 'System audio',
    deviceId: '',
    gain: 0.8,
    muted: false,
    solo: false,
    level: 0,
    rmsDb: MIN_DB,
    peakDb: MIN_DB,
    connected: false,
  },
};

const cloneChannels = () =>
  Object.fromEntries(
    Object.entries(channelDefaults).map(([key, value]) => [key, { ...value }])
  );

let audioContext = null;
let destinationNode = null;
let masterGainNode = null;
let masterLimiterNode = null;
let masterAnalyser = null;
let monitorGainNode = null;
let monitorDestinationNode = null;
let monitorAudioElement = null;
let animationFrame = null;

const sources = new Map();
const listeners = new Set();
let channels = cloneChannels();
let master = {
  gain: 1,
  muted: false,
  level: 0,
  rmsDb: MIN_DB,
  peakDb: MIN_DB,
};
let monitoring = {
  enabled: false,
  gain: 0.72,
  outputDeviceId: '',
  outputDeviceLabel: 'System default',
  outputSelectionSupported: false,
  playing: false,
};

const createAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('This browser does not support the Echoo audio mixer.');
  }
  return new AudioContextClass();
};

const supportsOutputSelection = () =>
  typeof HTMLMediaElement !== 'undefined' &&
  typeof HTMLMediaElement.prototype?.setSinkId === 'function';

const getSnapshot = () => ({
  ready: Boolean(audioContext && destinationNode),
  channels: Object.fromEntries(
    Object.entries(channels).map(([key, value]) => [key, { ...value }])
  ),
  master: { ...master },
  monitoring: {
    ...monitoring,
    outputSelectionSupported: supportsOutputSelection(),
  },
});

const notify = () => {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
};

const ensureMonitorElement = () => {
  if (!monitorDestinationNode || typeof document === 'undefined') return null;

  if (!monitorAudioElement) {
    monitorAudioElement = document.createElement('audio');
    monitorAudioElement.autoplay = false;
    monitorAudioElement.controls = false;
    monitorAudioElement.playsInline = true;
    monitorAudioElement.volume = 1;
    monitorAudioElement.setAttribute('aria-hidden', 'true');
    monitorAudioElement.style.position = 'fixed';
    monitorAudioElement.style.width = '1px';
    monitorAudioElement.style.height = '1px';
    monitorAudioElement.style.opacity = '0';
    monitorAudioElement.style.pointerEvents = 'none';
    monitorAudioElement.style.left = '-9999px';
    document.body?.appendChild(monitorAudioElement);
  }

  if (monitorAudioElement.srcObject !== monitorDestinationNode.stream) {
    monitorAudioElement.srcObject = monitorDestinationNode.stream;
  }

  return monitorAudioElement;
};

const applyMonitorState = () => {
  if (!monitorGainNode) return;
  monitorGainNode.gain.value = monitoring.enabled ? monitoring.gain : 0;
};

const ensureContext = async () => {
  if (!audioContext) {
    audioContext = createAudioContext();
    destinationNode = audioContext.createMediaStreamDestination();
    monitorDestinationNode = audioContext.createMediaStreamDestination();
    masterGainNode = audioContext.createGain();
    masterLimiterNode = audioContext.createDynamicsCompressor();
    masterAnalyser = audioContext.createAnalyser();
    monitorGainNode = audioContext.createGain();

    masterLimiterNode.threshold.value = -1;
    masterLimiterNode.knee.value = 0;
    masterLimiterNode.ratio.value = 20;
    masterLimiterNode.attack.value = 0.003;
    masterLimiterNode.release.value = 0.18;

    masterAnalyser.fftSize = 512;
    masterAnalyser.smoothingTimeConstant = 0.72;

    masterGainNode.connect(masterLimiterNode);
    masterLimiterNode.connect(masterAnalyser);

    masterAnalyser.connect(destinationNode);
    masterAnalyser.connect(monitorGainNode);
    monitorGainNode.connect(monitorDestinationNode);

    applyMonitorState();
    ensureMonitorElement();
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return audioContext;
};

const disconnectSource = (channelId, stopTracks = true) => {
  const current = sources.get(channelId);
  if (!current) return;

  try {
    current.source?.disconnect();
  } catch {
    // The source may already be disconnected.
  }

  try {
    current.gainNode?.disconnect();
  } catch {
    // The gain node may already be disconnected.
  }

  try {
    current.analyser?.disconnect();
  } catch {
    // The analyser may already be disconnected.
  }

  if (stopTracks) {
    current.stream?.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // The browser may have already ended this track.
      }
    });
  }

  sources.delete(channelId);

  if (channels[channelId]) {
    channels = {
      ...channels,
      [channelId]: {
        ...channels[channelId],
        connected: false,
        level: 0,
        rmsDb: MIN_DB,
        peakDb: MIN_DB,
        deviceId: '',
        sourceLabel:
          channelId === 'host'
            ? 'Default input'
            : channelId === 'media'
              ? 'System audio'
              : 'Not connected',
      },
    };
  }
};

const applyMixState = () => {
  const soloed = Object.values(channels).filter((channel) => channel.solo);
  const hasSolo = soloed.length > 0;

  Object.entries(channels).forEach(([channelId, channel]) => {
    const node = sources.get(channelId)?.gainNode;
    if (!node) return;

    const audible = !channel.muted && (!hasSolo || channel.solo);
    node.gain.value = audible ? channel.gain : 0;
  });

  if (masterGainNode) {
    masterGainNode.gain.value = master.muted ? 0 : master.gain;
  }

  applyMonitorState();
};

const connectStream = async (channelId, stream, sourceLabel, deviceId = '') => {
  const context = await ensureContext();
  const audioTrack = stream?.getAudioTracks?.()[0];

  if (!audioTrack) {
    stream?.getTracks?.().forEach((track) => track.stop());
    throw new Error('No audio track was available for this mixer channel.');
  }

  disconnectSource(channelId);

  const source = context.createMediaStreamSource(stream);
  const gainNode = context.createGain();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.72;

  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(masterGainNode);

  sources.set(channelId, {
    stream,
    source,
    gainNode,
    analyser,
    data: new Float32Array(analyser.fftSize),
    audioTrack,
  });

  audioTrack.addEventListener('ended', () => {
    const current = sources.get(channelId);
    if (!current || current.audioTrack !== audioTrack) return;

    disconnectSource(channelId, false);
    applyMixState();
    notify();
  }, { once: true });

  channels = {
    ...channels,
    [channelId]: {
      ...channels[channelId],
      connected: true,
      deviceId: deviceId || audioTrack.getSettings?.().deviceId || '',
      sourceLabel: sourceLabel || audioTrack.label || channels[channelId].sourceLabel,
    },
  };

  applyMixState();
  startMeterLoop();
  notify();
  return audioTrack;
};

const readMeter = (analyser, data) => {
  if (!analyser || !data) {
    return { level: 0, rmsDb: MIN_DB, peakDb: MIN_DB };
  }

  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  let peak = 0;

  for (let index = 0; index < data.length; index += 1) {
    const sample = Math.abs(data[index]);
    sum += sample * sample;
    if (sample > peak) peak = sample;
  }

  const rms = Math.sqrt(sum / data.length);
  const rmsDb = Math.max(MIN_DB, 20 * Math.log10(Math.max(rms, 0.000001)));
  const peakDb = Math.max(MIN_DB, 20 * Math.log10(Math.max(peak, 0.000001)));
  const level = Math.max(0, Math.min(1, (peakDb - MIN_DB) / Math.abs(MIN_DB)));

  return { level, rmsDb, peakDb };
};

function startMeterLoop() {
  if (animationFrame) return;

  const tick = () => {
    let changed = false;

    Object.entries(channels).forEach(([channelId, channel]) => {
      const sourceState = sources.get(channelId);
      const meter = sourceState
        ? readMeter(sourceState.analyser, sourceState.data)
        : { level: 0, rmsDb: MIN_DB, peakDb: MIN_DB };

      if (
        Math.abs(meter.level - channel.level) > 0.004 ||
        Math.abs(meter.peakDb - channel.peakDb) > 0.5
      ) {
        channels = {
          ...channels,
          [channelId]: { ...channels[channelId], ...meter },
        };
        changed = true;
      }
    });

    if (masterAnalyser) {
      const data = new Float32Array(masterAnalyser.fftSize);
      const meter = readMeter(masterAnalyser, data);
      if (
        Math.abs(meter.level - master.level) > 0.004 ||
        Math.abs(meter.peakDb - master.peakDb) > 0.5
      ) {
        master = { ...master, ...meter };
        changed = true;
      }
    }

    if (changed) notify();
    animationFrame = window.requestAnimationFrame(tick);
  };

  animationFrame = window.requestAnimationFrame(tick);
}

export const subscribeEchooMixer = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getEchooMixerState = getSnapshot;

export const ensureHostInput = async (deviceId = '') => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Microphone access is unavailable here. Open Creator Studio on HTTPS or http://localhost and allow microphone permission.'
    );
  }

  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getAudioTracks()[0];
  const label = track?.label || 'Host microphone';
  return connectStream('host', stream, label, deviceId);
};

export const connectGuestInput = async (deviceId) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Microphone access is unavailable here. Open Creator Studio on HTTPS or http://localhost and allow microphone permission.'
    );
  }

  if (!deviceId) {
    throw new Error('Choose a guest microphone first.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  const track = stream.getAudioTracks()[0];
  return connectStream('guest', stream, track?.label || 'Guest microphone', deviceId);
};

export const connectSystemAudio = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('System-audio sharing is not supported by this browser.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('No shared audio was selected. Choose a tab or screen with audio enabled.');
  }

  stream.getVideoTracks().forEach((track) => track.stop());
  return connectStream('media', stream, audioTrack.label || 'Shared system audio');
};

export const disconnectMixerChannel = (channelId) => {
  disconnectSource(channelId);
  applyMixState();
  notify();
};

export const setMixerChannelGain = (channelId, value) => {
  if (!channels[channelId]) return;
  const gain = Math.max(0, Math.min(dbToGain(MAX_CHANNEL_DB), Number(value) || 0));
  channels = {
    ...channels,
    [channelId]: { ...channels[channelId], gain },
  };
  applyMixState();
  notify();
};

export const setMixerChannelGainDb = (channelId, db) => {
  const safeDb = Math.max(MIN_DB, Math.min(MAX_CHANNEL_DB, Number(db) || 0));
  setMixerChannelGain(channelId, dbToGain(safeDb));
};

export const toggleMixerChannelMute = (channelId) => {
  if (!channels[channelId]) return;
  channels = {
    ...channels,
    [channelId]: { ...channels[channelId], muted: !channels[channelId].muted },
  };
  applyMixState();
  notify();
};

export const toggleMixerChannelSolo = (channelId) => {
  if (!channels[channelId]) return;
  channels = {
    ...channels,
    [channelId]: { ...channels[channelId], solo: !channels[channelId].solo },
  };
  applyMixState();
  notify();
};

export const setMasterGain = (value) => {
  master = {
    ...master,
    gain: Math.max(0, Math.min(dbToGain(MAX_MASTER_DB), Number(value) || 0)),
  };
  applyMixState();
  notify();
};

export const setMasterGainDb = (db) => {
  const safeDb = Math.max(MIN_DB, Math.min(MAX_MASTER_DB, Number(db) || 0));
  setMasterGain(dbToGain(safeDb));
};

export const toggleMasterMute = () => {
  master = { ...master, muted: !master.muted };
  applyMixState();
  notify();
};

export const setMonitorGain = (value) => {
  monitoring = {
    ...monitoring,
    gain: Math.max(0, Math.min(1, Number(value) || 0)),
  };
  applyMonitorState();
  notify();
};

export const setMonitorEnabled = async (enabled) => {
  await ensureContext();
  const element = ensureMonitorElement();
  if (!element) throw new Error('Echoo could not create the monitoring output.');

  monitoring = { ...monitoring, enabled: Boolean(enabled) };
  applyMonitorState();

  if (monitoring.enabled) {
    try {
      await element.play();
      monitoring = { ...monitoring, playing: true };
    } catch (error) {
      monitoring = { ...monitoring, enabled: false, playing: false };
      applyMonitorState();
      notify();
      const message =
        error?.name === 'NotAllowedError'
          ? 'The browser blocked monitoring. Click Monitor again after interacting with the page.'
          : error?.message || 'Could not start studio monitoring.';
      throw new Error(message, { cause: error });
    }
  } else {
    try {
      element.pause();
    } catch {
      // Ignore an already-paused element.
    }
    monitoring = { ...monitoring, playing: false };
  }

  notify();
};

export const setMonitorOutputDevice = async (deviceId = '', label = '') => {
  await ensureContext();
  const element = ensureMonitorElement();
  if (!element) throw new Error('Echoo could not create the monitoring output.');

  const requested = deviceId || 'default';

  if (typeof element.setSinkId === 'function') {
    await element.setSinkId(requested);
  } else if (deviceId && deviceId !== 'default') {
    throw new Error('This browser does not support choosing a separate audio output device.');
  }

  monitoring = {
    ...monitoring,
    outputDeviceId: deviceId,
    outputDeviceLabel: label || (deviceId ? 'Selected output' : 'System default'),
  };
  notify();
};

export const playMonitorTestTone = async () => {
  const context = await ensureContext();
  const element = ensureMonitorElement();
  if (!element || !monitorDestinationNode) {
    throw new Error('Echoo could not open the monitoring output.');
  }

  await element.play();

  const oscillator = context.createOscillator();
  const toneGain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 440;
  toneGain.gain.value = 0.035;
  oscillator.connect(toneGain);
  toneGain.connect(monitorDestinationNode);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.35);
};

export const resetEchooMixer = () => {
  const previousConnection = Object.fromEntries(
    Object.entries(channels).map(([key, channel]) => [key, {
      connected: channel.connected,
      sourceLabel: channel.sourceLabel,
      deviceId: channel.deviceId,
      level: channel.level,
      rmsDb: channel.rmsDb,
      peakDb: channel.peakDb,
    }])
  );

  channels = cloneChannels();
  Object.entries(previousConnection).forEach(([key, value]) => {
    channels[key] = { ...channels[key], ...value };
  });
  master = {
    gain: 1,
    muted: false,
    level: master.level,
    rmsDb: master.rmsDb,
    peakDb: master.peakDb,
  };
  applyMixState();
  notify();
};

export const listAudioInputs = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || 'Microphone',
    }));
};

export const listAudioOutputs = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === 'audiooutput')
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || 'Audio output',
    }));
};

export const getEchooMixerOutputTrack = () =>
  destinationNode?.stream?.getAudioTracks?.()[0] || null;

export const getEchooMixerDiagnostics = () => {
  const outputTrack = getEchooMixerOutputTrack();
  return {
    ready: Boolean(outputTrack && outputTrack.readyState === 'live'),
    outputTrackState: outputTrack?.readyState || 'missing',
    hostConnected: Boolean(channels.host?.connected),
    hostPeakDb: channels.host?.peakDb ?? MIN_DB,
    masterPeakDb: master.peakDb ?? MIN_DB,
    masterMuted: Boolean(master.muted),
    clipping: Number(master.peakDb) >= CLIP_DB,
    monitoring: { ...monitoring },
  };
};

export const stopEchooMixer = async () => {
  sources.forEach((_, channelId) => disconnectSource(channelId));
  sources.clear();

  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  if (monitorAudioElement) {
    try {
      monitorAudioElement.pause();
      monitorAudioElement.srcObject = null;
      monitorAudioElement.remove();
    } catch {
      // Ignore cleanup errors from an already-removed element.
    }
    monitorAudioElement = null;
  }

  try {
    await audioContext?.close();
  } catch {
    // Ignore cleanup errors from an already-closed audio context.
  }

  audioContext = null;
  destinationNode = null;
  masterGainNode = null;
  masterLimiterNode = null;
  masterAnalyser = null;
  monitorGainNode = null;
  monitorDestinationNode = null;
  channels = cloneChannels();
  master = { gain: 1, muted: false, level: 0, rmsDb: MIN_DB, peakDb: MIN_DB };
  monitoring = {
    enabled: false,
    gain: 0.72,
    outputDeviceId: '',
    outputDeviceLabel: 'System default',
    outputSelectionSupported: supportsOutputSelection(),
    playing: false,
  };
  notify();
};

export const ECHOO_MIXER_LIMITS = {
  minDb: MIN_DB,
  maxChannelDb: MAX_CHANNEL_DB,
  maxMasterDb: MAX_MASTER_DB,
  clipDb: CLIP_DB,
};

export default {
  subscribeEchooMixer,
  getEchooMixerState,
  ensureHostInput,
  connectGuestInput,
  connectSystemAudio,
  disconnectMixerChannel,
  setMixerChannelGain,
  setMixerChannelGainDb,
  toggleMixerChannelMute,
  toggleMixerChannelSolo,
  setMasterGain,
  setMasterGainDb,
  toggleMasterMute,
  setMonitorGain,
  setMonitorEnabled,
  setMonitorOutputDevice,
  playMonitorTestTone,
  resetEchooMixer,
  listAudioInputs,
  listAudioOutputs,
  getEchooMixerOutputTrack,
  getEchooMixerDiagnostics,
  stopEchooMixer,
};
