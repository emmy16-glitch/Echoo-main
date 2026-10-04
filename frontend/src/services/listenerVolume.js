import { accountStorageKey } from './accountStorage.js';
const key = () => accountStorageKey('echooListenerVolumeV1') || 'echooListenerVolumeV1:guest';
export const readListenerVolume = () => {
  try {
    const value = localStorage.getItem(key());
    if (value === null) return 1;
    const volume = Number(value);
    return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1;
  } catch { return 1; }
};
export const saveListenerVolume = (value) => {
  const volume = Math.max(0, Math.min(1, Number(value) || 0));
  try { localStorage.setItem(key(), String(volume)); } catch { /* Playback works without storage. */ }
  window.dispatchEvent(new CustomEvent('echoo:listener-volume', { detail: volume }));
  return volume;
};
