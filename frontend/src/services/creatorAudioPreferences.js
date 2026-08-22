import settingsService from './settingsService.js';

const STORAGE_KEY = 'echooCreatorAudioPreferencesV1';

export const DEFAULT_CREATOR_AUDIO_SETTINGS = Object.freeze({
  audioMode: 'enhanced',
  noiseReduction: 45,
  echoRemoval: true,
  voiceWarmth: 35,
  voiceClarity: 45,
  deEsser: 30,
  volumeBalance: 45,
  protectLoudSounds: true,
  masterVolume: 100,
});

const clampPercent = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number)))
    : fallback;
};

export const normalizeCreatorAudioSettings = (value = {}) => ({
  audioMode: value.audioMode === 'raw' ? 'raw' : 'enhanced',
  noiseReduction: clampPercent(
    value.noiseReduction,
    DEFAULT_CREATOR_AUDIO_SETTINGS.noiseReduction
  ),
  echoRemoval: typeof value.echoRemoval === 'boolean'
    ? value.echoRemoval
    : DEFAULT_CREATOR_AUDIO_SETTINGS.echoRemoval,
  voiceWarmth: clampPercent(
    value.voiceWarmth,
    DEFAULT_CREATOR_AUDIO_SETTINGS.voiceWarmth
  ),
  voiceClarity: clampPercent(
    value.voiceClarity,
    DEFAULT_CREATOR_AUDIO_SETTINGS.voiceClarity
  ),
  deEsser: clampPercent(value.deEsser, DEFAULT_CREATOR_AUDIO_SETTINGS.deEsser),
  volumeBalance: clampPercent(
    value.volumeBalance,
    DEFAULT_CREATOR_AUDIO_SETTINGS.volumeBalance
  ),
  protectLoudSounds: typeof value.protectLoudSounds === 'boolean'
    ? value.protectLoudSounds
    : DEFAULT_CREATOR_AUDIO_SETTINGS.protectLoudSounds,
  masterVolume: clampPercent(
    value.masterVolume,
    DEFAULT_CREATOR_AUDIO_SETTINGS.masterVolume
  ),
});

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const cacheCreatorAudioSettings = (value) => {
  const normalized = normalizeCreatorAudioSettings(value);
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Local persistence is a convenience; it must never interrupt live audio.
  }
  return normalized;
};

export const getCachedCreatorAudioSettings = () => {
  try {
    const value = JSON.parse(storage()?.getItem(STORAGE_KEY) || 'null');
    return normalizeCreatorAudioSettings(value || DEFAULT_CREATOR_AUDIO_SETTINGS);
  } catch {
    return { ...DEFAULT_CREATOR_AUDIO_SETTINGS };
  }
};

export const loadCreatorAudioSettings = async () => {
  try {
    const response = await settingsService.get();
    const remote = response?.data?.preferences?.creatorAudio;
    return cacheCreatorAudioSettings(remote || getCachedCreatorAudioSettings());
  } catch {
    return getCachedCreatorAudioSettings();
  }
};

export const saveCreatorAudioSettings = async (value) => {
  const normalized = cacheCreatorAudioSettings(value);
  const response = await settingsService.updatePreferences({ creatorAudio: normalized });
  return cacheCreatorAudioSettings(
    response?.data?.preferences?.creatorAudio || normalized
  );
};
