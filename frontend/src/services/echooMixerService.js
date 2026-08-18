const channelDefaults = {
  host: {
    id: 'host',
    name: 'Host Mic',
    sourceLabel: 'Default input',
    gain: 0.78,
    muted: false,
    solo: false,
    level: 0,
    connected: false,
  },
  guest: {
    id: 'guest',
    name: 'Guest Mic',
    sourceLabel: 'Not connected',
    gain: 0.62,
    muted: false,
    solo: false,
    level: 0,
    connected: false,
  },
  media: {
    id: 'media',
    name: 'Music / FX',
    sourceLabel: 'System audio',
    gain: 0.48,
    muted: false,
    solo: false,
    level: 0,
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
let masterAnalyser = null;
let animationFrame = null;

const sources = new Map();
const listeners = new Set();
let channels = cloneChannels();
let master = {
  gain: 0.84,
  muted: false,
  level: 0,
};

const createAudioContext = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('This browser does not support the Echoo audio mixer.');
  }
  return new AudioContextClass();
};

const getSnapshot = () => ({
  ready: Boolean(audioContext && destinationNode),
  channels: Object.fromEntries(
    Object.entries(channels).map(([key, value]) => [key, { ...value }])
  ),
  master: { ...master },
});

const notify = () => {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
};

const ensureContext = async () => {
  if (!audioContext) {
    audioContext = createAudioContext();
    destinationNode = audioContext.createMediaStreamDestination();
    masterGainNode = audioContext.createGain();
    masterAnalyser = audioContext.createAnalyser();
    masterAnalyser.fftSize = 256;
    masterAnalyser.smoothingTimeConstant = 0.72;

    masterGainNode.connect(masterAnalyser);
    masterAnalyser.connect(destinationNode);
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
};

const connectStream = async (channelId, stream, sourceLabel) => {
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
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.76;

  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(masterGainNode);

  sources.set(channelId, {
    stream,
    source,
    gainNode,
    analyser,
    data: new Uint8Array(analyser.fftSize),
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
      sourceLabel: sourceLabel || audioTrack.label || channels[channelId].sourceLabel,
    },
  };

  applyMixState();
  startMeterLoop();
  notify();
  return audioTrack;
};

const readLevel = (analyser, data) => {
  analyser.getByteTimeDomainData(data);
  let sum = 0;
  for (let index = 0; index < data.length; index += 1) {
    const normalized = (data[index] - 128) / 128;
    sum += normalized * normalized;
  }
  return Math.max(0, Math.min(1, Math.sqrt(sum / data.length) * 4.5));
};

function startMeterLoop() {
  if (animationFrame) return;

  const tick = () => {
    let changed = false;

    Object.entries(channels).forEach(([channelId, channel]) => {
      const sourceState = sources.get(channelId);
      const nextLevel = sourceState
        ? readLevel(sourceState.analyser, sourceState.data)
        : 0;

      if (Math.abs(nextLevel - channel.level) > 0.008) {
        channels = {
          ...channels,
          [channelId]: { ...channels[channelId], level: nextLevel },
        };
        changed = true;
      }
    });

    if (masterAnalyser) {
      const data = new Uint8Array(masterAnalyser.fftSize);
      const nextMasterLevel = readLevel(masterAnalyser, data);
      if (Math.abs(nextMasterLevel - master.level) > 0.008) {
        master = { ...master, level: nextMasterLevel };
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
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getAudioTracks()[0];
  const label = track?.label || 'Host microphone';
  return connectStream('host', stream, label);
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
    },
  });

  const track = stream.getAudioTracks()[0];
  return connectStream('guest', stream, track?.label || 'Guest microphone');
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
  const gain = Math.max(0, Math.min(1, Number(value) || 0));
  channels = {
    ...channels,
    [channelId]: { ...channels[channelId], gain },
  };
  applyMixState();
  notify();
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
    gain: Math.max(0, Math.min(1, Number(value) || 0)),
  };
  applyMixState();
  notify();
};

export const toggleMasterMute = () => {
  master = { ...master, muted: !master.muted };
  applyMixState();
  notify();
};

export const resetEchooMixer = () => {
  const previousConnection = Object.fromEntries(
    Object.entries(channels).map(([key, channel]) => [key, {
      connected: channel.connected,
      sourceLabel: channel.sourceLabel,
      level: channel.level,
    }])
  );

  channels = cloneChannels();
  Object.entries(previousConnection).forEach(([key, value]) => {
    channels[key] = { ...channels[key], ...value };
  });
  master = { gain: 0.84, muted: false, level: master.level };
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

export const getEchooMixerOutputTrack = () =>
  destinationNode?.stream?.getAudioTracks?.()[0] || null;

export const stopEchooMixer = async () => {
  sources.forEach((_, channelId) => disconnectSource(channelId));
  sources.clear();

  if (animationFrame) {
    window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  try {
    await audioContext?.close();
  } catch {
    // Ignore cleanup errors from an already-closed audio context.
  }

  audioContext = null;
  destinationNode = null;
  masterGainNode = null;
  masterAnalyser = null;
  channels = cloneChannels();
  master = { gain: 0.84, muted: false, level: 0 };
  notify();
};

export default {
  subscribeEchooMixer,
  getEchooMixerState,
  ensureHostInput,
  connectGuestInput,
  connectSystemAudio,
  disconnectMixerChannel,
  setMixerChannelGain,
  toggleMixerChannelMute,
  toggleMixerChannelSolo,
  setMasterGain,
  toggleMasterMute,
  resetEchooMixer,
  listAudioInputs,
  getEchooMixerOutputTrack,
  stopEchooMixer,
};
