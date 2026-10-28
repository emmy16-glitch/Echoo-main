// A stale replayAudio ID must never authorize another creator's audio.
// Apply ownership and soft-delete checks to every post-broadcast idempotency
// lookup, including direct linked-ID fallbacks after a database recovery.
export const creatorOwnedReplayQuery = (creatorId, conditions = {}) => ({
  ...conditions,
  artist: creatorId,
  isDeleted: false,
});
