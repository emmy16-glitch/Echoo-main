// Reconciles live listener playback when the app returns to the foreground
// after tab backgrounding, app switching, or a bfcache/browser restore.
// Mobile browsers may suspend media elements or the auxiliary AudioContext
// while hidden. The reconciler must be idempotent (visibilitychange and
// pageshow can fire together), must never override an explicit pause or
// stop, must never act on a replaced room, and must distinguish a browser
// autoplay rejection (NotAllowedError) from a real transport failure so a
// policy block never triggers a reconnect storm.

const AUTOPLAY_ERROR_NAME = 'NotAllowedError';

export const createVisiblePlaybackReconciler = ({
  visibilityState = () => (typeof document !== 'undefined' ? document.visibilityState : 'visible'),
  playbackIntent,
  resolveRoom,
  roomCanCarryMedia,
  resumeAudioContext = async () => {},
  listAudioElements = () => [],
  syncElement = (element) => element,
  playElement = (element) => element.play(),
  attachMissingRoom = async () => {},
  scheduleRecovery = () => {},
  isStaleSession = () => false,
  onPlaying = () => {},
  onAutoplayBlocked = () => {},
  onNotPlaying = () => {},
}) => {
  let inFlight = false;

  return async function resumeVisiblePlayback() {
    // Only one reconciliation may run at a time. visibilitychange,
    // pageshow and the watchdog can all fire close together; a second
    // concurrent attempt must observe the running one, not duplicate it.
    if (inFlight) return 'recovery_running';
    if (visibilityState() !== 'visible') return 'not_visible';
    // An explicit pause or stop always wins over background recovery.
    if (playbackIntent() !== 'play') return 'playback_not_requested';

    const room = resolveRoom();
    if (!roomCanCarryMedia(room)) return 'room_unavailable';

    inFlight = true;
    try {
      // A suspended auxiliary AudioContext is the most common silent-audio
      // failure after backgrounding; resume it before touching elements.
      await resumeAudioContext(room);
      if (isStaleSession(room)) return 'session_replaced';

      const elements = listAudioElements(room);
      if (!elements.length) {
        try {
          await attachMissingRoom(room);
        } catch {
          if (!isStaleSession(room)) scheduleRecovery('visibility_resume_missing_audio');
        }
        return 'reattached';
      }

      const attempts = await Promise.allSettled(
        elements.map((element) => playElement(syncElement(element), room))
      );
      // The session or the playback intent may have changed while the play
      // promises were settling. Never report or apply states for a stale
      // room, and never override a pause that happened mid-flight.
      if (isStaleSession(room) || playbackIntent() !== 'play') return 'session_replaced';

      const playing = elements.some((element) => !element.paused && !element.ended);
      if (playing) {
        // Only a confirmed playing element may mark the player as listening.
        onPlaying(room);
        return 'playing';
      }

      const blocked = attempts.some((attempt) => (
        attempt.status === 'rejected' && attempt.reason?.name === AUTOPLAY_ERROR_NAME
      ));
      if (blocked) {
        // A browser policy rejection requires a fresh user gesture, not a
        // reconnect. Leave the LiveKit session intact for the resume action.
        onAutoplayBlocked(room);
        return 'autoplay_blocked';
      }

      onNotPlaying(room);
      return 'audio_recovering';
    } finally {
      inFlight = false;
    }
  };
};
