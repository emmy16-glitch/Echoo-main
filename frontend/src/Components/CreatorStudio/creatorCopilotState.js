export const getCreatorCopilotState = (state = {}) => {
  const hasStation = Number(state.ownedStationCount) > 0;
  const hasAudio = Number(state.audioCount) > 0;
  const hasUpcoming = Number(state.upcomingBroadcastCount) > 0;
  const isLive = Boolean(state.isLive);
  const setupComplete = Boolean(state.profileComplete);

  const title = isLive
    ? 'You’re live right now.'
    : hasStation
      ? hasUpcoming ? 'Your next broadcast is taking shape.' : 'Your station is ready for what’s next.'
      : 'You’re almost ready to broadcast.';
  const suggestions = isLive
    ? ['Check my live connection', 'Help me engage listeners', 'Review my broadcast setup', 'Check my microphone']
    : hasStation
      ? [hasUpcoming ? 'Run my pre-live checklist' : 'Plan my next broadcast', 'Improve my station profile', hasAudio ? 'Manage recent audio' : 'Check my audio setup', 'Schedule a broadcast']
      : ['Create my first station', 'Help me name my station', 'Plan my first broadcast', 'Check my microphone setup'];

  return { hasStation, hasAudio, hasUpcoming, isLive, setupComplete, title, suggestions };
};
