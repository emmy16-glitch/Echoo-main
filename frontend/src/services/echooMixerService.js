const MIN_DB = -60;
const MAX_CHANNEL_DB = 6;
const MAX_MASTER_DB = 3;
const CLIP_DB = -1;
const PCM_CAPTURE_WORKLET_URL = '/echoo-pcm-capture-worklet.js';
const PCM_CAPTURE_CHANNELS = 2;
const PREFERRED_SAMPLE_RATE = 48000;
const DISPLAY_CAPTURE_TIMEOUT_MS = 45000;

const DEFAULT_MIC_CONSTRAINTS = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
});

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
let masterMeterData = null;
let monitorGainNode = null;
let monitorDestinationNode = null;
let monitorAudioElement = null;
let animationFrame = null;
let pcmCaptureModuleContext = null;
let activeMasterCapture = null;

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

  try {
    return new AudioContextClass({ sampleRate: PREFERRED_SAMPLE_RATE, latencyHint: 'interactive' });
  } catch {
    return new AudioContextClass();
  }
};

const supportsOutputSelection = () =>
  typeof HTMLMediaElement !== 'undefined' &&
  typeof HTMLMediaElement.prototype?.setSinkId === 'function';

const getSnapshot = () => ({
  ready: Boolean(audioContext && destinationNode),
  engineSampleRate: audioContext?.sampleRate || null,
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

// Monitoring has its own routing. With no Listen-only channel selected the
// creator hears the exact post-limiter Audience Output. When one or more channels
// are selected for Listen only, only the headphones change; the audience program
// bus is never altered by a monitoring action.
const applyMonitorState = () => {
  if (!monitorGainNode) return;

  const soloedIds = Object.entries(channels)
    .filter(([, channel]) => channel.solo && channel.connected)
    .map(([channelId]) => channelId);
  const hasSolo = soloedIds.length > 0;
  const enabledGain = monitoring.enabled ? monitoring.gain : 0;

  monitorGainNode.gain.value = hasSolo ? 0 : enabledGain;

  sources.forEach((sourceState, channelId) => {
    const soloGainNode = sourceState?.soloMonitorGainNode;
    if (!soloGainNode) return;
    const channel = channels[channelId];
    const selected = hasSolo && channel?.solo;
    // Listen-only is a headphone/PFL-style audition. It remains useful even if
    // the channel is muted from the audience mix.
    soloGainNode.gain.value = selected ? channel.gain * enabledGain : 0;
  });
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
    masterMeterData = new Float32Array(masterAnalyser.fftSize);

    masterGainNode.connect(masterLimiterNode);
    masterLimiterNode.connect(masterAnalyser);

    // One post-master program bus feeds LiveKit and recording. The normal
    // headphone monitor branches from exactly the same point.
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

const ensurePcmCaptureModule = async (context) => {
  if (!context?.audioWorklet?.addModule || typeof AudioWorkletNode === 'undefined') {
    throw new Error('AudioWorklet PCM capture is not supported by this browser.');
  }

  if (pcmCaptureModuleContext === context) return;
  await context.audioWorklet.addModule(PCM_CAPTURE_WORKLET_URL);
  pcmCaptureModuleContext = context;
};

const disconnectSource = (channelId, stopTracks = true) => {
  const current = sources.get(channelId);
  if (!current) return;

  for (const node of [
    current.source,
    current.gainNode,
    current.analyser,
    current.soloMonitorGainNode,
  ]) {
    try {
      node?.disconnect();
    } catch {
      // The node may already be disconnected.
    }
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
  Object.entries(channels).forEach(([channelId, channel]) => {
    const node = sources.get(channelId)?.gainNode;
    if (!node) return;

    // Solo/Listen-only never touches this audience/program gain.
    node.gain.value = channel.muted ? 0 : channel.gain;
  });

  if (masterGainNode) {
    masterGainNode.gain.value = master.muted ? 0 : master.gain;
  }

  applyMonitorState();
};

const stopStreamTracks = (stream) => {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore an already-ended acquired track.
    }
  });
};

const connectStream = async (channelId, stream, sourceLabel, deviceId = '') => {
  const context = await ensureContext();
  const audioTrack = stream?.getAudioTracks?.()[0];

  if (!audioTrack) {
    stopStreamTracks(stream);
    throw new Error('No audio track was available for this mixer channel.');
  }

  disconnectSource(channelId);

  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  const gainNode = context.createGain();
  const soloMonitorGainNode = context.createGain();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.72;
  soloMonitorGainNode.gain.value = 0;

  // Meter pre-fader input so a muted/quietly-faded source still visibly proves
  // that signal is reaching the Studio. Audience gain is applied afterwards.
  source.connect(analyser);
  analyser.connect(gainNode);
  gainNode.connect(masterGainNode);

  // Separate headphone audition path. It never reaches the master/LiveKit bus.
  source.connect(soloMonitorGainNode);
  soloMonitorGainNode.connect(monitorDestinationNode);

  sources.set(channelId, {
    stream,
    source,
    gainNode,
    analyser,
    soloMonitorGainNode,
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

const connectAcquiredStream = async (channelId, stream, sourceLabel, deviceId = '') => {
  try {
    return await connectStream(channelId, stream, sourceLabel, deviceId);
  } catch (error) {
    stopStreamTracks(stream);
    throw error;
  }
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

    if (masterAnalyser && masterMeterData) {
      const meter = readMeter(masterAnalyser, masterMeterData);
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

const normalizedMicConstraints = (audioConstraints) => ({
  ...DEFAULT_MIC_CONSTRAINTS,
  ...(audioConstraints && typeof audioConstraints === 'object' ? audioConstraints : {}),
});

export const subscribeEchooMixer = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getEchooMixerState = getSnapshot;

export const getMixerChannelTrack = (channelId) => {
  const track = sources.get(channelId)?.audioTrack || null;
  return track?.readyState === 'live' ? track : null;
};

export const ensureHostInput = async (deviceId = '', audioConstraints = null) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Microphone access is unavailable here. Open Creator Studio on HTTPS or http://localhost and allow microphone permission.'
    );
  }

  const constraints = {
    audio: {
      ...normalizedMicConstraints(audioConstraints),
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getAudioTracks()[0];
  const label = track?.label || 'Host microphone';
  return connectAcquiredStream('host', stream, label, deviceId);
};

export const connectGuestInput = async (deviceId, audioConstraints = null) => {
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
      ...normalizedMicConstraints(audioConstraints),
      deviceId: { exact: deviceId },
    },
  });

  const track = stream.getAudioTracks()[0];
  return connectAcquiredStream('guest', stream, track?.label || 'Guest microphone', deviceId);
};

export const connectSystemAudio = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('System-audio sharing is not supported by this browser.');
  }

  const capturePromise = navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  let timeoutId;

  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(
        'Share audio timed out. Choose a browser tab or screen and enable Share audio, then try again.'
      ));
    }, DISPLAY_CAPTURE_TIMEOUT_MS);
  });

  let stream;
  try {
    stream = await Promise.race([capturePromise, timeoutPromise]);
  } catch (error) {
    // getDisplayMedia cannot be aborted in every supported browser. If the
    // native picker resolves after our timeout, stop the late stream so it
    // cannot silently attach itself to the mixer after the UI has recovered.
    capturePromise.then(stopStreamTracks).catch(() => {});
    if (error?.name === 'NotAllowedError') {
      throw new Error(
        'Share audio was cancelled or blocked. Choose a tab or screen and enable Share audio.',
        { cause: error }
      );
    }
    if (error?.name === 'NotFoundError') {
      throw new Error('No screen or tab was selected for Share audio.', { cause: error });
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const audioTrack = stream?.getAudioTracks?.()[0];
  if (!audioTrack) {
    stopStreamTracks(stream);
    throw new Error('No shared audio was selected. Choose a tab or screen with audio enabled.');
  }

  stream.getVideoTracks().forEach((track) => {
    stream.removeTrack(track);
    track.stop();
  });
  return connectAcquiredStream('media', stream, audioTrack.label || 'Shared system audio');
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
  // Solo means Listen only and is deliberately monitoring-only.
  applyMonitorState();
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

export const supportsEchooMasterPcmCapture = () =>
  Boolean(
    typeof window !== 'undefined' &&
    (window.AudioContext || window.webkitAudioContext) &&
    typeof AudioWorkletNode !== 'undefined'
  );

export const startEchooMasterPcmCapture = async ({ onPcm } = {}) => {
  if (activeMasterCapture) {
    throw new Error('The Echoo master bus is already being recorded.');
  }

  const context = await ensureContext();
  if (!masterAnalyser) {
    throw new Error('The Echoo master bus is not ready for recording.');
  }

  await ensurePcmCaptureModule(context);

  const worklet = new AudioWorkletNode(context, 'echoo-pcm-capture', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [PCM_CAPTURE_CHANNELS],
    channelCount: PCM_CAPTURE_CHANNELS,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
  });
  const silentGain = context.createGain();
  silentGain.gain.value = 0;

  let stoppingPromise = null;
  let resolveStopped = null;
  let stopped = false;

  const cleanup = () => {
    try {
      masterAnalyser?.disconnect(worklet);
    } catch {
      // The recorder branch may already be disconnected.
    }
    try {
      worklet.disconnect();
    } catch {
      // The processor may already be disconnected.
    }
    try {
      silentGain.disconnect();
    } catch {
      // The silent sink may already be disconnected.
    }
    worklet.port.onmessage = null;
    if (activeMasterCapture?.worklet === worklet) activeMasterCapture = null;
  };

  worklet.port.onmessage = (event) => {
    const message = event?.data || {};
    if (message.type === 'pcm' && message.buffer) {
      onPcm?.(message.buffer);
      return;
    }
    if (message.type === 'stopped') {
      resolveStopped?.();
    }
  };

  masterAnalyser.connect(worklet);
  worklet.connect(silentGain);
  silentGain.connect(context.destination);

  const handle = {
    worklet,
    sampleRate: context.sampleRate,
    channels: PCM_CAPTURE_CHANNELS,
    source: 'post-master-bus',
    stop: async () => {
      if (stopped) return stoppingPromise;
      stopped = true;

      stoppingPromise = new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolveStopped = null;
          resolve();
        };
        resolveStopped = finish;
        window.setTimeout(finish, 1000);
        try {
          worklet.port.postMessage({ type: 'stop' });
        } catch {
          finish();
        }
      });

      await stoppingPromise;
      cleanup();
    },
  };

  activeMasterCapture = handle;

  console.log('[Echoo Mixer] direct post-master PCM capture attached', {
    sampleRate: handle.sampleRate,
    channels: handle.channels,
    source: handle.source,
  });

  return handle;
};

export const getEchooMixerDiagnostics = () => {
  const outputTrack = getEchooMixerOutputTrack();
  return {
    ready: Boolean(outputTrack && outputTrack.readyState === 'live'),
    outputTrackState: outputTrack?.readyState || 'missing',
    engineSampleRate: audioContext?.sampleRate || null,
    hostConnected: Boolean(channels.host?.connected),
    hostPeakDb: channels.host?.peakDb ?? MIN_DB,
    masterPeakDb: master.peakDb ?? MIN_DB,
    masterMuted: Boolean(master.muted),
    clipping: Number(master.peakDb) >= CLIP_DB,
    recordingTapActive: Boolean(activeMasterCapture),
    recordingSampleRate: activeMasterCapture?.sampleRate || null,
    monitoring: { ...monitoring },
  };
};

export const stopEchooMixer = async () => {
  if (activeMasterCapture) {
    try {
      await activeMasterCapture.stop();
    } catch {
      // Recording teardown must not block mixer cleanup.
    }
  }

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
  masterMeterData = null;
  monitorGainNode = null;
  monitorDestinationNode = null;
  pcmCaptureModuleContext = null;
  activeMasterCapture = null;
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
  getMixerChannelTrack,
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
  supportsEchooMasterPcmCapture,
  startEchooMasterPcmCapture,
  getEchooMixerDiagnostics,
  stopEchooMixer,
};
