/**
 * Convert the 0–100 value persisted by the player API into the 0–1 fraction
 * used for local duration calculations. Invalid values deliberately resolve to
 * zero so a malformed history entry cannot inflate listening totals.
 */
export function progressPercentToFraction(progress) {
  const numericProgress = Number(progress);
  if (!Number.isFinite(numericProgress)) return 0;
  return Math.max(0, Math.min(100, numericProgress)) / 100;
}

/**
 * Convert a normalized 0–1 listening fraction into a display-safe percentage
 * for progress-bar labels and ARIA values.
 */
export function progressFractionToPercent(progress) {
  const numericProgress = Number(progress);
  if (!Number.isFinite(numericProgress)) return 0;
  return Math.round(Math.max(0, Math.min(1, numericProgress)) * 100);
}
