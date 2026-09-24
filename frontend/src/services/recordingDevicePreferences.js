const STORAGE_KEY = 'echooRecordingDevicePreferencesV1';

export const DEFAULT_RECORDING_DEVICE_PREFERENCES = Object.freeze({
  decided: false,
  autoSave: true,
  format: 'mp3',
});

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const normalizeRecordingDevicePreferences = (value = {}) => ({
  decided: value.decided === true,
  autoSave: value.autoSave !== false,
  format: value.format === 'wav' ? 'wav' : 'mp3',
});

export const getRecordingDevicePreferences = () => {
  try {
    const raw = JSON.parse(storage()?.getItem(STORAGE_KEY) || 'null');
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
    storage()?.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
