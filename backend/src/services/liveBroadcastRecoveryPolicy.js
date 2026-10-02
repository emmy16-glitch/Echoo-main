const DEFAULT_CREATOR_DISCONNECT_GRACE_MS = 90_000;
const DEFAULT_CREATOR_RECOVERY_MAX_HOURS = 12;

export function getCreatorDisconnectGraceMs() {
  const value = Number(process.env.LIVEKIT_CREATOR_DISCONNECT_GRACE_MS);
  return Math.max(
    5_000,
    Math.min(
      120_000,
      Number.isFinite(value) && value > 0
        ? value
        : DEFAULT_CREATOR_DISCONNECT_GRACE_MS
    )
  );
}

export function getCreatorRecoveryMaxMs() {
  const hours = Number(process.env.LIVEKIT_CREATOR_RECOVERY_MAX_HOURS);
  const safeHours = Number.isFinite(hours) && hours > 0
    ? hours
    : DEFAULT_CREATOR_RECOVERY_MAX_HOURS;
  return Math.max(60 * 60 * 1000, Math.min(24 * 60 * 60 * 1000, safeHours * 60 * 60 * 1000));
}

export function creatorRecoveryExpired({
  disconnectedAt,
  now = Date.now(),
  maxMs = getCreatorRecoveryMaxMs(),
} = {}) {
  const startedAt = disconnectedAt instanceof Date
    ? disconnectedAt.getTime()
    : new Date(disconnectedAt || 0).getTime();
  if (!Number.isFinite(startedAt) || startedAt <= 0) return false;
  return Number(now) - startedAt >= Math.max(1, Number(maxMs) || 0);
}

export default {
  getCreatorDisconnectGraceMs,
  getCreatorRecoveryMaxMs,
  creatorRecoveryExpired,
};
