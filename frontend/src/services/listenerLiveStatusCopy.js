export const LISTENER_LIVE_STATUS_COPY = Object.freeze({
  idle: 'Live audio',
  connecting: 'Connecting audio…',
  waiting_for_program: 'Waiting for live audio',
  playing: 'Audio live',
  connected: 'Waiting for live audio',
  listening: 'Audio live',
  reconnecting: 'Reconnecting audio…',
  holding: 'Weak connection — keeping audio live',
  recovering_audio: 'Restoring audio…',
  autoplay_blocked: 'Tap Play to hear audio',
  disconnected: 'Audio disconnected',
  failed: 'Audio disconnected',
});

export const listenerLiveStatusLabel = (status, fallback = 'Connecting audio…') =>
  LISTENER_LIVE_STATUS_COPY[status] || fallback;

export const listenerLiveDetailCopy = ({
  needsAudioStart = false,
  trackCount = 0,
  isPlaying = false,
  status = '',
} = {}) => {
  if (needsAudioStart) return 'Audio is ready. Tap to start playback.';
  if (trackCount > 0 && !isPlaying) {
    return status === 'recovering_audio'
      ? 'Restoring live audio.'
      : 'Paused on this device.';
  }
  if (trackCount > 0) return 'Live audio is ready.';
  return 'Waiting for live audio.';
};
