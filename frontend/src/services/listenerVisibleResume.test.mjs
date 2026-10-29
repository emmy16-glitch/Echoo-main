import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisiblePlaybackReconciler } from './listenerVisibleResume.js';

const ROOM = { state: 'connected' };
const roomCanCarryMedia = (room) => room === ROOM;

const blockingElement = () => ({
  paused: true,
  ended: false,
  volume: 0,
  muted: null,
  play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })),
});

const playingElement = () => {
  const element = {
    paused: true,
    ended: false,
    volume: 1,
    muted: false,
    play: async () => { element.paused = false; },
  };
  return element;
};

const baseDeps = ({ intent = 'play', room = ROOM, visibility = 'visible' } = {}) => ({
  visibilityState: () => visibility,
  playbackIntent: () => intent,
  resolveRoom: () => room,
  roomCanCarryMedia,
});

test('foreground restoration resumes audio only when play is intended', async () => {
  const element = playingElement();
  let contextResumed = 0;
  const state = { playing: 0, pausedCleared: false };
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    resumeAudioContext: async () => { contextResumed += 1; },
    listAudioElements: () => [element],
    syncElement: (candidate) => { candidate.volume = 0.4; candidate.muted = false; return candidate; },
    onPlaying: () => { state.playing += 1; state.pausedCleared = true; },
  });

  const outcome = await resume();
  assert.equal(outcome, 'playing');
  assert.equal(contextResumed, 1);
  assert.equal(await element.play().then(() => element.paused), false);
  assert.equal(element.volume, 0.4);
  assert.equal(state.playing, 1);
  assert.equal(state.pausedCleared, true);
});

test('an explicit pause and an explicit stop are never restarted by recovery', async () => {
  for (const intent of ['pause', 'stop']) {
    let contextResumed = 0;
    let plays = 0;
    const resume = createVisiblePlaybackReconciler({
      ...baseDeps({ intent }),
      resumeAudioContext: async () => { contextResumed += 1; },
      listAudioElements: () => [{ paused: true, ended: false, play: () => { plays += 1; return Promise.resolve(); } }],
      onPlaying: () => { throw new Error('must not mark playing'); },
      onNotPlaying: () => { throw new Error('must not mark recovering'); },
    });

    assert.equal(await resume(), 'playback_not_requested');
    assert.equal(contextResumed, 0);
    assert.equal(plays, 0);
  }
});

test('a browser autoplay rejection preserves the session and requires a user gesture', async () => {
  const element = blockingElement();
  const state = { blocked: 0, recovering: 0, playing: 0 };
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    listAudioElements: () => [element],
    onAutoplayBlocked: () => { state.blocked += 1; },
    onNotPlaying: () => { state.recovering += 1; },
    onPlaying: () => { state.playing += 1; },
  });

  assert.equal(await resume(), 'autoplay_blocked');
  assert.equal(state.blocked, 1);
  assert.equal(state.recovering, 0);
  assert.equal(state.playing, 0);
});

test('successful playback is confirmed from the real element state, not the play request', async () => {
  const lazyFail = { paused: true, ended: false, play: () => Promise.resolve() };
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    listAudioElements: () => [lazyFail],
    onPlaying: () => { throw new Error('paused element must not mark playing'); },
  });

  assert.equal(await resume(), 'audio_recovering');
  assert.equal(lazyFail.paused, true);
});

test('a suspended AudioContext is resumed during recovery', async () => {
  let resumed = 0;
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    resumeAudioContext: async () => { resumed += 1; },
    listAudioElements: () => [playingElement()],
  });

  await resume();
  assert.equal(resumed, 1);
});

test('missing audio elements trigger bounded reattachment and a recovery schedule only on failure', async () => {
  let attaches = 0;
  let recovered = 0;
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    listAudioElements: () => [],
    attachMissingRoom: async () => { attaches += 1; },
    scheduleRecovery: () => { recovered += 1; },
  });

  assert.equal(await resume(), 'reattached');
  assert.equal(attaches, 1);
  assert.equal(recovered, 0);

  const failingResume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    listAudioElements: () => [],
    attachMissingRoom: async () => { throw new Error('reattach failed'); },
    scheduleRecovery: (reason) => { recovered += 1; assert.equal(reason, 'visibility_resume_missing_audio'); },
  });
  assert.equal(await failingResume(), 'reattached');
  assert.equal(recovered, 1);
});

test('a session that is stale from the start never touches audio at all', async () => {
  const marked = [];
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    isStaleSession: () => true,
    listAudioElements: () => [playingElement()],
    onPlaying: () => marked.push('playing'),
    onNotPlaying: () => marked.push('recovering'),
    onAutoplayBlocked: () => marked.push('blocked'),
  });

  assert.equal(await resume(), 'session_replaced');
  assert.deepEqual(marked, []);
});

test('a room replaced while the play promises settle cannot overwrite newer state', async () => {
  let stale = false;
  const staleRoom = ROOM;
  const marked = [];
  const element = playingElement();
  element.play = async () => { stale = true; element.paused = false; };
  const resume = createVisiblePlaybackReconciler({
    playbackIntent: () => 'play',
    resolveRoom: () => staleRoom,
    roomCanCarryMedia,
    listAudioElements: () => [element],
    isStaleSession: (room) => stale || room !== staleRoom,
    onPlaying: () => marked.push('playing'),
    onNotPlaying: () => marked.push('recovering'),
    onAutoplayBlocked: () => marked.push('blocked'),
  });

  assert.equal(await resume(), 'session_replaced');
  assert.deepEqual(marked, []);
});

test('a pause during the play promises is respected instead of overridden', async () => {
  const element = playingElement();
  let intent = 'play';
  const marked = [];
  const resume = createVisiblePlaybackReconciler({
    playbackIntent: () => intent,
    resolveRoom: () => ROOM,
    roomCanCarryMedia,
    listAudioElements: () => [element],
    onPlaying: () => marked.push('playing'),
    onAutoplayBlocked: () => marked.push('blocked'),
    onNotPlaying: () => marked.push('recovering'),
  });

  element.play = async () => { intent = 'pause'; element.paused = false; };
  assert.equal(await resume(), 'session_replaced');
  assert.deepEqual(marked, []);
});

test('concurrent visibility and pageshow events produce a single reconciliation', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const element = playingElement();
  let plays = 0;
  element.play = async () => {
    plays += 1;
    element.paused = false;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight -= 1;
  };
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps(),
    listAudioElements: () => [element],
  });

  const results = await Promise.all([resume(), resume(), resume()]);
  assert.deepEqual(
    results.filter((outcome) => outcome === 'playing').length,
    1
  );
  assert.equal(maxInFlight, 1, 'playback attempt must never run concurrently twice');
});

test('an unavailable or missing room never triggers recovery side effects', async () => {
  let sideEffects = 0;
  const resume = createVisiblePlaybackReconciler({
    playbackIntent: () => 'play',
    resolveRoom: () => null,
    roomCanCarryMedia,
    resumeAudioContext: async () => { sideEffects += 1; },
    scheduleRecovery: () => { sideEffects += 1; },
    attachMissingRoom: async () => { sideEffects += 1; },
    onNotPlaying: () => { sideEffects += 1; },
  });

  assert.equal(await resume(), 'room_unavailable');
  assert.equal(sideEffects, 0);
});

test('a hidden tab never starts recovery from pageshow alone', async () => {
  let touched = 0;
  const resume = createVisiblePlaybackReconciler({
    ...baseDeps({ visibility: 'hidden' }),
    resumeAudioContext: async () => { touched += 1; },
    listAudioElements: () => [{ paused: true, ended: false, play: () => Promise.resolve() }],
  });

  assert.equal(await resume(), 'not_visible');
  assert.equal(touched, 0);
});
