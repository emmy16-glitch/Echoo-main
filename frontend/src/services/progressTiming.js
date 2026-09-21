const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const formatTransferBytes = (bytes) => {
  const size = Math.max(0, Number(bytes) || 0);
  if (size >= 1024 ** 3) return `${(size / (1024 ** 3)).toFixed(2)} GB`;
  if (size >= 1024 ** 2) return `${(size / (1024 ** 2)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${Math.round(size)} B`;
};

export const formatTransferRate = (bytesPerSecond) => {
  const rate = Math.max(0, Number(bytesPerSecond) || 0);
  if (!rate) return '';
  return `${formatTransferBytes(rate)}/s`;
};

export const formatElapsedTime = (seconds) => {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  if (minutes < 60) return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder ? `${hours}h ${minuteRemainder}m` : `${hours}h`;
};

export const formatTimeRemaining = (seconds) => {
  const value = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 10) return 'a few seconds left';
  if (value < 60) return `about ${value}s left`;
  const minutes = Math.ceil(value / 60);
  if (minutes < 60) return `about ${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder
    ? `about ${hours}h ${remainder}m left`
    : `about ${hours}h left`;
};

export const updateTransferEstimate = (previous = null, {
  loaded = 0,
  total = 0,
  now = Date.now(),
} = {}) => {
  const safeLoaded = Math.max(0, Number(loaded) || 0);
  const safeTotal = Math.max(0, Number(total) || 0);
  const timestamp = Number(now) || Date.now();
  const startedAt = Number(previous?.startedAt) || timestamp;
  const lastAt = Number(previous?.lastAt) || timestamp;
  const lastLoaded = Math.max(0, Number(previous?.lastLoaded) || 0);
  const elapsedSeconds = Math.max(0, (timestamp - startedAt) / 1000);
  const deltaSeconds = Math.max(0, (timestamp - lastAt) / 1000);
  const deltaBytes = Math.max(0, safeLoaded - lastLoaded);

  let bytesPerSecond = Math.max(0, Number(previous?.bytesPerSecond) || 0);
  if (deltaSeconds >= 0.35 && deltaBytes > 0) {
    const instantaneous = deltaBytes / deltaSeconds;
    bytesPerSecond = bytesPerSecond > 0
      ? (bytesPerSecond * 0.72) + (instantaneous * 0.28)
      : instantaneous;
  }

  const percent = safeTotal > 0
    ? clamp(Math.round((safeLoaded / safeTotal) * 100), 0, 100)
    : 0;
  const remainingBytes = safeTotal > safeLoaded ? safeTotal - safeLoaded : 0;
  const etaSeconds =
    bytesPerSecond > 0 &&
    elapsedSeconds >= 1.5 &&
    percent >= 2 &&
    percent < 100
      ? remainingBytes / bytesPerSecond
      : null;

  return {
    ...(previous || {}),
    loaded: safeLoaded,
    total: safeTotal,
    percent,
    startedAt,
    lastAt: timestamp,
    lastLoaded: safeLoaded,
    bytesPerSecond,
    elapsedSeconds,
    etaSeconds: Number.isFinite(etaSeconds) ? etaSeconds : null,
  };
};

export const transferProgressText = (progress = {}) => {
  const parts = [];
  if (Number(progress.total) > 0) {
    parts.push(`${formatTransferBytes(progress.loaded)} of ${formatTransferBytes(progress.total)}`);
  }
  if (Number.isFinite(Number(progress.percent))) {
    parts.push(`${Math.max(0, Math.min(100, Number(progress.percent) || 0))}%`);
  }
  const rate = formatTransferRate(progress.bytesPerSecond);
  if (rate) parts.push(rate);
  const remaining = formatTimeRemaining(progress.etaSeconds);
  if (remaining) parts.push(remaining);
  else if ((Number(progress.elapsedSeconds) || 0) >= 2 && Number(progress.percent) < 100) {
    parts.push('estimating time left…');
  }
  return parts.filter(Boolean).join(' · ');
};

export default {
  formatTransferBytes,
  formatTransferRate,
  formatElapsedTime,
  formatTimeRemaining,
  updateTransferEstimate,
  transferProgressText,
};
