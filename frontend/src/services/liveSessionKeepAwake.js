let active = false;
let wakeLock = null;
let generation = 0;
let visibilityBound = false;

const supported = () =>
  typeof navigator !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof navigator.wakeLock?.request === 'function';

const requestWakeLock = async (expectedGeneration) => {
  if (
    !active ||
    expectedGeneration !== generation ||
    !supported() ||
    document.visibilityState !== 'visible' ||
    (wakeLock && wakeLock.released !== true)
  ) {
    return;
  }

  try {
    const lock = await navigator.wakeLock.request('screen');

    // The request can resolve after End Broadcast. Never let a late promise
    // keep the device awake after the live session is already over.
    if (!active || expectedGeneration !== generation) {
      await lock.release().catch(() => {});
      return;
    }

    wakeLock = lock;
    lock.addEventListener?.('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
  } catch (error) {
    // Wake Lock is best effort (unsupported policy, battery saver, OS denial).
    // LiveKit recovery still handles transport loss; do not fail Go Live.
    console.warn('[Echoo Live] screen wake lock unavailable:', error?.message || error);
  }
};

const onVisibilityChange = () => {
  if (!active || document.visibilityState !== 'visible') return;
  void requestWakeLock(generation);
};

export const startCreatorSessionKeepAwake = () => {
  active = true;
  generation += 1;
  const currentGeneration = generation;

  if (typeof document !== 'undefined' && !visibilityBound) {
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = true;
  }

  void requestWakeLock(currentGeneration);
};

export const stopCreatorSessionKeepAwake = () => {
  active = false;
  generation += 1;

  if (typeof document !== 'undefined' && visibilityBound) {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = false;
  }

  const lock = wakeLock;
  wakeLock = null;
  if (lock && lock.released !== true) {
    void lock.release().catch(() => {});
  }
};

export default {
  startCreatorSessionKeepAwake,
  stopCreatorSessionKeepAwake,
};
