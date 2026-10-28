// Never infer that a live broadcast ended solely from an old MongoDB timestamp.
// A LiveKit API outage cannot distinguish an orphan from a 7-9-hour show that
// is still publishing. Only a successful, inactive room lookup can authorize
// automatic orphan reconciliation; explicit 'ending' is handled separately.
export const canFinalizeOrphanedLiveBroadcast = (room = {}) =>
  room.active === false && room.unknown === false;
