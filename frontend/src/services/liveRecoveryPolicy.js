export const LIVE_RECOVERY_DELAYS_MS = Object.freeze([0, 1000, 2000, 4000, 8000]);
export const LIVEKIT_RECONNECT_DELAYS_MS = Object.freeze([0, 500, 1000, 2000, 4000, 8000, 12000]);
export const CREATOR_TRANSPORT_STALL_MS = 15000;
export const CREATOR_TRANSPORT_STALL_CONFIRMATIONS = 3;
export const CREATOR_CONNECTION_LOST_GRACE_MS = 8000;
export const CREATOR_HARD_RECONNECT_DEADLINE_MS = 30000;
export const LISTENER_PLAYBACK_WATCHDOG_MS = 5000;
export const LISTENER_RTP_STALL_MS = 15000;
export const LISTENER_RTP_STALL_CONFIRMATIONS = 3;
export const LISTENER_CONNECTION_LOST_GRACE_MS = 7000;
export const LISTENER_HARD_RECONNECT_DEADLINE_MS = 30000;
export const LISTENER_HARD_RECONNECT_JITTER_MS = 5000;

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

export const normalizeConnectionQuality = (value) => {
  const quality = String(value || '').trim().toLowerCase();
  return ['excellent', 'good', 'poor', 'lost'].includes(quality) ? quality : 'unknown';
};

export const normalizeRoomConnectionState = (room) =>
  String(room?.state || room?.connectionState || '')
    .replace(/[\s_-]/g, '')
    .toLowerCase();

export const playoutDelayForConnectionQuality = (value) => {
  switch (normalizeConnectionQuality(value)) {
    case 'excellent': return 0.12;
    case 'good': return 0.18;
    case 'poor': return 0.35;
    case 'lost': return 0.6;
    default: return 0.2;
  }
};

export const transportSampleAdvanced = (previous, current, fields = ['bytes', 'packets']) => {
  if (!current) return false;
  if (!previous) return true;
  return fields.some((field) => (
    Number(current?.[field] || 0) > Number(previous?.[field] || 0)
  ));
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

export const roomIsConnected = (room) =>
  normalizeRoomConnectionState(room) === 'connected';

// Signal-only reconnects can leave RTP flowing. Treat that state as a usable
// media path so Echoo does not tear down good audio merely because signalling
// is being repaired in the background.
export const roomCanCarryMedia = (room) => {
  const state = normalizeRoomConnectionState(room);
  return state === 'connected' || state === 'signalreconnecting';
};

export const hardReconnectDue = ({
  startedAt,
  now = Date.now(),
  deadlineMs,
  online = true,
}) => (
  online !== false &&
  Number(startedAt) > 0 &&
  Number(now) - Number(startedAt) >= Math.max(1000, Number(deadlineMs) || 0)
);

export const shouldRetryRecovery = ({ attempt, disposed, live, online = true }) => (
  !disposed &&
  Boolean(live) &&
  online !== false &&
  Number(attempt) < LIVE_RECOVERY_DELAYS_MS.length
);
