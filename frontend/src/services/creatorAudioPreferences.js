import settingsService from './settingsService.js';
import { accountStorageKey } from './accountStorage.js';

const STORAGE_KEY = 'echooCreatorAudioPreferencesV1';
const ORIGINAL_AUDIO_MIGRATION_KEY = 'echooCreatorOriginalAudioDefaultV1';

// Echoo should preserve the creator's source by default. Enhancement remains
// available as an explicit tool for noisy laptop-mic situations, but a new
// creator is never silently passed through denoise/EQ/compression.
export const DEFAULT_CREATOR_AUDIO_SETTINGS = Object.freeze({
  audioMode: 'raw',
  noiseReduction: 0,
  echoRemoval: false,
  voiceWarmth: 0,
  voiceClarity: 0,
  deEsser: 0,
  volumeBalance: 0,
  protectLoudSounds: false,
  masterVolume: 100,
});

const LEGACY_ENHANCED_DEFAULTS = Object.freeze({
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

const isLegacyEnhancedDefault = (value = {}) =>
  Object.entries(LEGACY_ENHANCED_DEFAULTS).every(([key, expected]) => value?.[key] === expected);

const clampPercent = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number)))
    : fallback;
};

export const normalizeCreatorAudioSettings = (value = {}) => ({
  audioMode: value.audioMode === 'enhanced' ? 'enhanced' : 'raw',
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
    const key = accountStorageKey(STORAGE_KEY);
    if (key) storage()?.setItem(key, JSON.stringify(normalized));
  } catch {
    // Local persistence is a convenience; it must never interrupt live audio.
  }
  return normalized;
};

const migrationStorageKey = () => accountStorageKey(ORIGINAL_AUDIO_MIGRATION_KEY);

const migrationAlreadyApplied = () => {
  try {
    const key = migrationStorageKey();
    return Boolean(key && storage()?.getItem(key) === 'true');
  } catch {
    return false;
  }
};

const markMigrationApplied = () => {
  try {
    const key = migrationStorageKey();
    if (key) storage()?.setItem(key, 'true');
  } catch {
    // Preference migration is best-effort.
  }
};

export const getCachedCreatorAudioSettings = () => {
  try {
    const key = accountStorageKey(STORAGE_KEY);
    const value = JSON.parse((key && storage()?.getItem(key)) || 'null');
    if (!migrationAlreadyApplied() && isLegacyEnhancedDefault(value)) {
      markMigrationApplied();
      return cacheCreatorAudioSettings(DEFAULT_CREATOR_AUDIO_SETTINGS);
    }
    return normalizeCreatorAudioSettings(value || DEFAULT_CREATOR_AUDIO_SETTINGS);
  } catch {
    return { ...DEFAULT_CREATOR_AUDIO_SETTINGS };
  }
};

export const loadCreatorAudioSettings = async () => {
  try {
    const response = await settingsService.get();
    const remote = response?.data?.preferences?.creatorAudio;

    // Accounts created before the original-audio change received one exact
    // enhancement preset even if the creator never chose it. Migrate only that
    // untouched preset once; any customized Enhanced Audio settings remain.
    if (!migrationAlreadyApplied() && isLegacyEnhancedDefault(remote)) {
      const migrated = cacheCreatorAudioSettings(DEFAULT_CREATOR_AUDIO_SETTINGS);
      markMigrationApplied();
      try {
        const saved = await settingsService.updatePreferences({ creatorAudio: migrated });
        return cacheCreatorAudioSettings(saved?.data?.preferences?.creatorAudio || migrated);
      } catch {
        return migrated;
      }
    }

    markMigrationApplied();
    return cacheCreatorAudioSettings(remote || getCachedCreatorAudioSettings());
  } catch {
    return getCachedCreatorAudioSettings();
  }
};

export const saveCreatorAudioSettings = async (value) => {
  // A deliberate user choice must never be mistaken for a legacy default.
  markMigrationApplied();
  const normalized = cacheCreatorAudioSettings(value);
  const response = await settingsService.updatePreferences({ creatorAudio: normalized });
  return cacheCreatorAudioSettings(
    response?.data?.preferences?.creatorAudio || normalized
  );
};
