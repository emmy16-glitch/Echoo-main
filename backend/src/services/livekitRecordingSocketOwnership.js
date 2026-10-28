// A signed LiveKit Egress URL can outlive a backend process restart. The
// recorder may have crashed before the provider returned an Egress ID, so
// absence of a persisted Egress ID is NOT evidence of current-process ownership.
// Only an existing session, an expected track, or a locally owned Egress may
// authorize the first FFmpeg session for an incoming recording WebSocket.
export const shouldRejectUnownedRecordingSocket = ({
  hasSession = false,
  currentProcessExpectsTrack = false,
  currentProcessOwnsEgress = false,
} = {}) => !hasSession && !currentProcessExpectsTrack && !currentProcessOwnsEgress;
