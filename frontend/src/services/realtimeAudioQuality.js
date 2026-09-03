import { accountStorageKey } from './accountStorage.js';

const STORAGE_KEY = 'echooRealtimeAudioQuality';

// These values are deliberately explicit instead of relying on LiveKit defaults.
// livekit-client 2.21 exposes this through TrackPublishOptions.audioPreset.maxBitrate.
export const ECHOO_REALTIME_AUDIO_PROFILES = Object.freeze({
  broadcast_high: Object.freeze({
    id: 'broadcast_high',
    label: 'Standard',
    description: 'Recommended for most broadcasts.',
    sampleRate: 48000,
    channels: 2,
    maxBitrate: 256000,
    dtx: false,
    red: true,
  }),
  studio: Object.freeze({
    id: 'studio',
    label: 'High',
    description: 'Professional quality for strong connections.',
    sampleRate: 48000,
    channels: 2,
    maxBitrate: 384000,
    dtx: false,
    red: true,
  }),
  studio_max: Object.freeze({
    id: 'studio_max',
    label: 'Max',
    description: 'Maximum realtime quality. Best with an excellent connection.',
    sampleRate: 48000,
    channels: 2,
    maxBitrate: 510000,
    dtx: false,
    red: false,
  }),
});

export const normalizeRealtimeAudioProfile = (value) =>
  ECHOO_REALTIME_AUDIO_PROFILES[value]?.id || 'broadcast_high';

export const getRealtimeAudioProfile = (value) =>
  ECHOO_REALTIME_AUDIO_PROFILES[normalizeRealtimeAudioProfile(value)];

export const getSavedRealtimeAudioProfile = () => {
  try {
    const key = accountStorageKey(STORAGE_KEY);
    return normalizeRealtimeAudioProfile(key && window.localStorage?.getItem(key));
  } catch {
    return 'broadcast_high';
  }
};

export const saveRealtimeAudioProfile = (value) => {
  const profile = normalizeRealtimeAudioProfile(value);
  try {
    const key = accountStorageKey(STORAGE_KEY);
    if (key) window.localStorage?.setItem(key, profile);
  } catch {
    // Preference storage is optional and must not interrupt broadcast setup.
  }
  return profile;
};

export const liveKitPublishOptionsFor = (value) => {
  const profile = getRealtimeAudioProfile(value);
  return {
    audioPreset: { maxBitrate: profile.maxBitrate },
    forceStereo: true,
    dtx: false,
    red: profile.red,
  };
};
