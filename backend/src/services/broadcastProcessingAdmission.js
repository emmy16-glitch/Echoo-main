// Keep scheduling independent between broadcasts (and their station owners).
// Jobs within a single broadcast must not finalize/rewrite its media together.
export const availableBroadcastJobQuery = (activeBroadcastIds, now = new Date()) => ({
  status: 'queued',
  availableAt: { $lte: now },
  ...(activeBroadcastIds?.size
    ? { broadcastId: { $nin: [...activeBroadcastIds] } }
    : {}),
});
