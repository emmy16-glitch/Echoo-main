export const LIVE_RECOVERY_DELAYS_MS = Object.freeze([0, 1000, 2000, 4000, 8000]);
export const CREATOR_TRANSPORT_STALL_MS = 15000;
export const LISTENER_PLAYBACK_WATCHDOG_MS = 5000;

export const recoveryDelayMs = (attempt, random = Math.random) => {
  const index = Math.max(0, Math.min(
    LIVE_RECOVERY_DELAYS_MS.length - 1,
    Number(attempt) || 0
  ));
  const base = LIVE_RECOVERY_DELAYS_MS[index];
  if (!base) return 0;
  const jitter = Math.round(base * 0.15 * ((Number(random?.()) || 0.5) - 0.5) * 2);
  return Math.max(0, base + jitter);
};

export const mediaElementIsPlaying = (element) => Boolean(
  element &&
  element.isConnected &&
  !element.paused &&
  !element.ended &&
  Number(element.readyState) >= 1
);

export const mediaTrackIsLive = (track) => Boolean(
  track?.kind === 'audio' &&
  track?.mediaStreamTrack?.readyState !== 'ended'
);

export const roomIsConnected = (room) => {
  const state = String(room?.state || room?.connectionState || '').toLowerCase();
  return state === 'connected';
};

export const shouldRetryRecovery = ({ attempt, disposed, live, online = true }) => (
  !disposed &&
  Boolean(live) &&
  online !== false &&
  Number(attempt) < LIVE_RECOVERY_DELAYS_MS.length
);
