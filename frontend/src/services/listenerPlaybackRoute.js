export const requestedPlaybackTime = (search = '') => {
  const value = new URLSearchParams(String(search || '')).get('t');
  if (value === null || value.trim() === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
};
