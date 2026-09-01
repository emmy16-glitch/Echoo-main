import { DeepFilterNet3Core } from 'deepfilternet3-noise-filter';

import {
  DEFAULT_CREATOR_AUDIO_SETTINGS,
  normalizeCreatorAudioSettings,
} from './creatorAudioPreferences.js';

const DEEP_FILTER_ASSET_BASE = '/assets/audio/deepfilternet3';
const SWITCH_TIME_SECONDS = 0.018;

const supportedConstraints = (constraints) => {
  let supported = {};
  try {
    supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
  } catch {
    supported = {};
  }

  const hasSupportMap = Object.keys(supported).length > 0;
  return Object.fromEntries(
    Object.entries(constraints).filter(([key]) => !hasSupportMap || supported[key] === true)
  );
};

export const getCreatorCaptureConstraints = (settings = DEFAULT_CREATOR_AUDIO_SETTINGS) => {
  const normalized = normalizeCreatorAudioSettings(settings);
  return supportedConstraints({
    echoCancellation: normalized.audioMode === 'enhanced' && normalized.echoRemoval,
    noiseSuppression: false,
    autoGainControl: false,
    // A studio interface can expose a real stereo program feed. Raw mode must
    // not request it down to mono before it reaches Echoo's stereo master.
    // Enhanced microphone mode remains intentionally mono/speech-oriented.
    channelCount: normalized.audioMode === 'raw' ? { ideal: 2 } : 1,
    sampleRate: { ideal: 48000 },
  });
};

export const applyCreatorCaptureSettings = async (track, settings) => {
  if (!track || track.kind !== 'audio' || track.readyState === 'ended') return;
  const normalized = normalizeCreatorAudioSettings(settings);

  if ('contentHint' in track) {
    try {
      track.contentHint = normalized.audioMode === 'raw' ? 'music' : 'speech';
    } catch {
      // Some browsers expose contentHint without accepting assignment.
    }
  }

  if (typeof track.applyConstraints !== 'function') return;
  try {
    await track.applyConstraints(supportedConstraints({
      echoCancellation: normalized.audioMode === 'enhanced' && normalized.echoRemoval,
      noiseSuppression: false,
      autoGainControl: false,
    }));
  } catch (error) {
    console.warn('[Echoo Audio] microphone capture settings were partially applied:', error);
  }
};

const setSmoothGain = (audioContext, audioParam, value) => {
  const now = audioContext.currentTime;
  audioParam.cancelScheduledValues(now);
  audioParam.setTargetAtTime(value, now, SWITCH_TIME_SECONDS);
};

export const createEchooVoiceProcessingEngine = ({
  audioContext,
  inputNode,
  outputNode,
  initialSettings = DEFAULT_CREATOR_AUDIO_SETTINGS,
  onStatus,
}) => {
  const rawGain = audioContext.createGain();
  const enhancedGain = audioContext.createGain();
  const warmth = audioContext.createBiquadFilter();
  const clarity = audioContext.createBiquadFilter();
  const deEsser = audioContext.createBiquadFilter();
  const balance = audioContext.createDynamicsCompressor();

  warmth.type = 'lowshelf';
  warmth.frequency.value = 180;
  clarity.type = 'peaking';
  clarity.frequency.value = 3200;
  clarity.Q.value = 0.72;
  deEsser.type = 'peaking';
  deEsser.frequency.value = 6800;
  deEsser.Q.value = 1.45;

  inputNode.connect(rawGain);
  rawGain.connect(outputNode);
  inputNode.connect(enhancedGain);
  enhancedGain.connect(warmth);
  warmth.connect(clarity);
  clarity.connect(deEsser);
  deEsser.connect(balance);
  balance.connect(outputNode);

  let settings = normalizeCreatorAudioSettings(initialSettings);
  let suppression = null;
  let suppressionNode = null;
  let suppressionPromise = null;
  let suppressionStatus = 'idle';
  let destroyed = false;

  const emitStatus = (error = '') => onStatus?.({
    noiseReduction: suppressionStatus,
    error,
  });

  const connectSuppressionNode = (node) => {
    enhancedGain.disconnect();
    enhancedGain.connect(node);
    node.connect(warmth);
  };

  const initializeSuppression = async () => {
    if (destroyed || suppressionStatus === 'ready') return suppression;
    if (suppressionPromise) return suppressionPromise;

    suppressionStatus = 'loading';
    emitStatus();
    suppressionPromise = (async () => {
      const processor = new DeepFilterNet3Core({
        sampleRate: 48000,
        noiseReductionLevel: settings.noiseReduction,
        assetConfig: { cdnUrl: DEEP_FILTER_ASSET_BASE },
      });
      await processor.initialize();
      if (destroyed) {
        processor.destroy();
        return null;
      }

      const node = await processor.createAudioWorkletNode(audioContext);
      if (destroyed) {
        node.disconnect();
        processor.destroy();
        return null;
      }

      suppression = processor;
      suppressionNode = node;
      connectSuppressionNode(node);
      processor.setSuppressionLevel(settings.noiseReduction);
      processor.setNoiseSuppressionEnabled(settings.noiseReduction > 0);
      suppressionStatus = 'ready';
      emitStatus();
      return processor;
    })().catch((error) => {
      suppressionStatus = 'unavailable';
      suppression = null;
      suppressionNode = null;
      emitStatus('Background Noise Removal is unavailable. Your live audio is still connected.');
      console.warn('[Echoo Audio] DeepFilterNet could not start:', error);
      return null;
    }).finally(() => {
      suppressionPromise = null;
    });

    return suppressionPromise;
  };

  const update = (nextSettings) => {
    settings = normalizeCreatorAudioSettings({ ...settings, ...nextSettings });
    const enhanced = settings.audioMode === 'enhanced';
    setSmoothGain(audioContext, rawGain.gain, enhanced ? 0 : 1);
    setSmoothGain(audioContext, enhancedGain.gain, enhanced ? 1 : 0);

    warmth.gain.setTargetAtTime((settings.voiceWarmth / 100) * 5, audioContext.currentTime, 0.025);
    clarity.gain.setTargetAtTime((settings.voiceClarity / 100) * 5, audioContext.currentTime, 0.025);
    deEsser.gain.setTargetAtTime(-(settings.deEsser / 100) * 7, audioContext.currentTime, 0.025);

    const amount = settings.volumeBalance / 100;
    balance.threshold.setTargetAtTime(-3 - (amount * 27), audioContext.currentTime, 0.025);
    balance.knee.setTargetAtTime(amount * 18, audioContext.currentTime, 0.025);
    balance.ratio.setTargetAtTime(1 + (amount * 5), audioContext.currentTime, 0.025);
    balance.attack.setTargetAtTime(0.004 + ((1 - amount) * 0.02), audioContext.currentTime, 0.025);
    balance.release.setTargetAtTime(0.12 + (amount * 0.18), audioContext.currentTime, 0.025);

    if (suppression) {
      suppression.setSuppressionLevel(settings.noiseReduction);
      suppression.setNoiseSuppressionEnabled(enhanced && settings.noiseReduction > 0);
    } else if (enhanced && suppressionStatus !== 'unavailable') {
      void initializeSuppression();
    }

    return settings;
  };

  const destroy = () => {
    destroyed = true;
    for (const node of [inputNode, rawGain, enhancedGain, suppressionNode, warmth, clarity, deEsser, balance]) {
      try {
        node?.disconnect();
      } catch {
        // A node may already be disconnected during studio teardown.
      }
    }
    suppression?.destroy();
    suppression = null;
    suppressionNode = null;
  };

  update(settings);

  return {
    update,
    destroy,
    getSettings: () => ({ ...settings }),
    getStatus: () => ({ noiseReduction: suppressionStatus }),
  };
};
