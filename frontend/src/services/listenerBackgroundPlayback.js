// A backgrounded browser can throttle JavaScript and receiver statistics while
// its native media pipeline still plays. Old diagnostic samples must not be
// used to tear down that connection when timers finally run again.
export function resetListenerReceiverSamples(entries, now = Date.now()) {
  for (const entry of entries) {
    entry.receiverSample = null;
    entry.receiverLastProgressAt = now;
    entry.receiverStallSamples = 0;
  }
}

export function requestListenerPlaybackSession(browserNavigator = globalThis.navigator) {
  try {
    if (browserNavigator?.audioSession) browserNavigator.audioSession.type = 'playback';
  } catch { /* Audio Session API support varies; media elements remain primary. */ }
}
