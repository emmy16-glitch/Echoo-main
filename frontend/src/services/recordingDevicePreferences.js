import { accountStorageKey } from './accountStorage.js';
const STORAGE_KEY = 'echooRecordingDevicePreferencesV1';

export const DEFAULT_RECORDING_DEVICE_PREFERENCES = Object.freeze({
  // Device exports require an explicit choice. Server save and OPFS recovery
  // remain mandatory and independent of this preference.
  decided: false,
  autoSave: false,
  format: 'mp3',
});

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const preferenceStorageKey = () => accountStorageKey(STORAGE_KEY);

export const normalizeRecordingDevicePreferences = (value = {}) => ({
  decided: value.decided === true,
  autoSave: value.autoSave === true,
  format: value.format === 'wav' ? 'wav' : 'mp3',
});

export const getRecordingDevicePreferences = () => {
  try {
    const key = preferenceStorageKey();
    if (!key) return { ...DEFAULT_RECORDING_DEVICE_PREFERENCES };
    const raw = JSON.parse(storage()?.getItem(key) || 'null');
    return normalizeRecordingDevicePreferences(raw || DEFAULT_RECORDING_DEVICE_PREFERENCES);
  } catch {
    return { ...DEFAULT_RECORDING_DEVICE_PREFERENCES };
  }
};

export const setRecordingDevicePreferences = (value = {}) => {
  const normalized = normalizeRecordingDevicePreferences({
    ...getRecordingDevicePreferences(),
    ...value,
    decided: value.decided ?? true,
  });
  try {
    const key = preferenceStorageKey();
    if (key) storage()?.setItem(key, JSON.stringify(normalized));
  } catch {
    // Device preferences are convenience state. Recording must still succeed
    // when local storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent('echoo:recording-device-preferences', {
    detail: normalized,
  }));
  return normalized;
};

export const chooseRecordingDeviceFormat = (format) => {
  if (format === 'none') {
    return setRecordingDevicePreferences({ decided: true, autoSave: false, format: 'mp3' });
  }
  return setRecordingDevicePreferences({
    decided: true,
    autoSave: true,
    format: format === 'wav' ? 'wav' : 'mp3',
  });
};

export default {
  DEFAULT_RECORDING_DEVICE_PREFERENCES,
  getRecordingDevicePreferences,
  setRecordingDevicePreferences,
  chooseRecordingDeviceFormat,
  normalizeRecordingDevicePreferences,
};
