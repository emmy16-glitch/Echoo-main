// The optional Icecast destination is configured globally, not by station.
// Allow exactly one active encoder per host:port:mount in this Node process,
// otherwise another organization would replace/mix the first organization's
// stream. Never block the LiveKit or independent per-broadcast replay paths.
const owners = new Map();
export const reserveRadioMount = (key, broadcastId) => {
  if (!key || !broadcastId) return false;
  const owner = owners.get(key);
  if (owner && owner !== broadcastId) return false;
  owners.set(key, broadcastId);
  return true;
};
export const releaseRadioMount = (key, broadcastId) => {
  if (key && owners.get(key) === broadcastId) owners.delete(key);
};
