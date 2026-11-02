import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import {
  DefaultReconnectPolicy,
  LogLevel,
  LoggerNames,
  setLogLevel,
} from 'livekit-client';

import {
  getAudioStreamUrl,
  getListenerLiveKitCredentials,
  syncListeningProgress,
} from '@/src/services/echooApi';
import { getLocalDownloadForTrack } from '@/src/services/localDownloads';
import {
  ensureLiveAudioNotificationPermission,
  startLiveAudioService,
  stopLiveAudioService,
} from 'echoo-live-audio-service';

type LiveKitNativeModule = typeof import('@livekit/react-native');

type LiveCredentials = {
  token: string;
  roomName: string;
  livekitUrl: string;
  broadcastId: string;
  role?: string;
};

export type AudioPlaybackItem = {
  kind: 'audio';
  id: string;
  title: string;
  subtitle: string;
  coverArt?: string;
  fileUrl?: string;
  genre?: string;
  stationId?: string;
  stationName?: string;
  collectionId?: string;
  collectionName?: string;
};

export type LivePlaybackItem = {
  kind: 'live';
  id: string;
  title: string;
  subtitle: string;
  coverArt?: string;
};

export type PlaybackItem = AudioPlaybackItem | LivePlaybackItem;

type PlaybackContextValue = {
  current: PlaybackItem | null;
  queue: AudioPlaybackItem[];
  queueIndex: number;
  upNext: AudioPlaybackItem[];
  isPlaying: boolean;
  isLoading: boolean;
  error: string;
  position: number;
  duration: number;
  repeat: boolean;
  liveNativeUnavailable: boolean;
  playAudio: (item: AudioPlaybackItem, options?: PlayAudioOptions) => Promise<void>;
  playAudioQueue: (items: AudioPlaybackItem[], startIndex?: number) => Promise<void>;
  playLive: (item: LivePlaybackItem) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  toggle: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  seekBy: (deltaMs: number) => Promise<void>;
  setRepeat: (enabled: boolean) => void;
  stop: () => void;
  clearError: () => void;
};

type PlayAudioOptions = {
  queue?: AudioPlaybackItem[];
  index?: number;
  preserveQueue?: boolean;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

let liveKitGlobalsRegistered = false;
let liveKitSignalLoggingConfigured = false;

function isLiveBroadcastEndedError(message: string) {
  return /(?:websocket|ws) closed unexpectedly with code 1001|code[ :=]+1001/i.test(message);
}

async function configureBackgroundPlaybackMode() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
}

async function loadLiveKitNativeModule() {
  const liveKit = await import('@livekit/react-native');
  if (!liveKitGlobalsRegistered) {
    liveKit.registerGlobals();
    liveKitGlobalsRegistered = true;
  }
  if (!liveKitSignalLoggingConfigured && process.env.NODE_ENV !== 'production') {
    setLogLevel(LogLevel.silent, LoggerNames.Signal);
    liveKitSignalLoggingConfigured = true;
  }
  return liveKit;
}

async function configureLiveKitListenerAudio(liveKit: LiveKitNativeModule) {
  await liveKit.AudioSession.configureAudio({
    android: {
      audioTypeOptions: liveKit.AndroidAudioTypePresets.media,
    },
  });
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const currentRef = useRef<PlaybackItem | null>(null);
  const queueRef = useRef<AudioPlaybackItem[]>([]);
  const queueIndexRef = useRef(-1);
  const playNextRef = useRef<(() => Promise<void>) | null>(null);
  const audioStreamExpiresAtRef = useRef(0);
  const isPlayingRef = useRef(false);
  const liveCredentialsRef = useRef<LiveCredentials | null>(null);
  const liveRecoveryGenerationRef = useRef(0);
  const liveRecoveryRunningRef = useRef(false);
  const liveIntentionalStopRef = useRef(false);
  const audioRequestGenerationRef = useRef(0);
  const audioProgressRef = useRef({ trackId: '', position: 0, duration: 0, sentPosition: 0, lastSentAt: 0, wasPlaying: false, completed: false });

  const [current, setCurrentState] = useState<PlaybackItem | null>(null);
  const [queue, setQueueState] = useState<AudioPlaybackItem[]>([]);
  const [queueIndex, setQueueIndexState] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeat, setRepeatState] = useState(false);
  const [liveNativeUnavailable, setLiveNativeUnavailable] = useState(false);
  const [liveKit, setLiveKit] = useState<LiveKitNativeModule | null>(null);
  const [liveCredentials, setLiveCredentials] = useState<LiveCredentials | null>(null);

  const setCurrent = useCallback((item: PlaybackItem | null) => {
    currentRef.current = item;
    setCurrentState(item);
  }, []);

  const setQueue = useCallback((items: AudioPlaybackItem[], index: number) => {
    queueRef.current = items;
    queueIndexRef.current = index;
    setQueueState(items);
    setQueueIndexState(index);
  }, []);

  const persistAudioProgress = useCallback((completed = false, force = false) => {
    const state = audioProgressRef.current;
    const active = currentRef.current;
    if (active?.kind !== 'audio' || active.id !== state.trackId || !state.duration || state.position < 1 || state.completed) return;
    const now = Date.now();
    if (!completed && !force && now - state.lastSentAt < 15_000) return;
    if (!completed && Math.abs(state.position - state.sentPosition) < 1.5) return;
    state.lastSentAt = now;
    state.sentPosition = state.position;
    state.completed = completed;
    // Account sync is best-effort and never blocks playback, live audio, or local downloads.
    void syncListeningProgress({ trackId: state.trackId, positionSeconds: state.position, durationSeconds: state.duration, completed }).catch(() => undefined);
  }, []);

  const releaseAudio = useCallback(() => {
    persistAudioProgress(false, true);
    statusSubscriptionRef.current?.remove();
    statusSubscriptionRef.current = null;

    const player = playerRef.current;
    playerRef.current = null;
    audioStreamExpiresAtRef.current = 0;
    if (player) {
      player.clearLockScreenControls();
      player.pause();
      player.remove();
    }
  }, [persistAudioProgress]);

  const clearLiveConnection = useCallback(() => {
    liveIntentionalStopRef.current = true;
    liveRecoveryGenerationRef.current += 1;
    liveRecoveryRunningRef.current = false;
    liveCredentialsRef.current = null;
    setLiveCredentials(null);
    setLiveKit(null);
    setLiveNativeUnavailable(false);
  }, []);

  const handleAudioStatus = useCallback((status: AudioStatus) => {
    const active = currentRef.current;
    if (active?.kind === 'audio' && status.isLoaded && status.duration > 0) {
      const previous = audioProgressRef.current;
      const sameTrack = previous.trackId === active.id;
      const wasPlaying = sameTrack && previous.wasPlaying;
      audioProgressRef.current = {
        ...(sameTrack ? previous : { trackId: active.id, sentPosition: 0, lastSentAt: 0, completed: false }),
        trackId: active.id,
        position: Math.max(0, status.currentTime),
        duration: status.duration,
        wasPlaying: status.playing,
      };
      const finished = Boolean((status as AudioStatus & { didJustFinish?: boolean }).didJustFinish) && !repeat;
      if (finished) persistAudioProgress(true, true);
      else if (status.playing || wasPlaying) persistAudioProgress(false, wasPlaying && !status.playing);
    }
    setIsLoading(status.isBuffering || !status.isLoaded);
    setIsPlaying(status.playing);
    setPosition(Math.max(0, status.currentTime * 1000));
    setDuration(Math.max(0, status.duration * 1000));
    if ((status as any).didJustFinish && !repeat) {
      void playNextRef.current?.();
    }
  }, [persistAudioProgress, repeat]);

  const playAudio = useCallback(async (item: AudioPlaybackItem, options: PlayAudioOptions = {}) => {
    // A later tap or swipe wins. Older stream-grant requests must never be
    // allowed to create a second player after the listener selected something else.
    const requestGeneration = ++audioRequestGenerationRef.current;
    const isLatestRequest = () => requestGeneration === audioRequestGenerationRef.current;

    if (options.queue?.length) {
      const nextIndex = Math.max(0, Math.min(options.index ?? 0, options.queue.length - 1));
      setQueue(options.queue, nextIndex);
    } else if (!options.preserveQueue) {
      setQueue([item], 0);
    }

    const existingUrl = String(item.fileUrl || '');
    const localUrl = /^(file:|content:|blob:|data:)/i.test(existingUrl);
    const sameTrack =
      currentRef.current?.kind === 'audio' &&
      currentRef.current.id === item.id &&
      Boolean(playerRef.current);
    const streamStillFresh =
      localUrl || audioStreamExpiresAtRef.current > Date.now() + (5 * 60 * 1000);

    if (sameTrack && streamStillFresh) {
      playerRef.current?.play();
      setIsPlaying(true);
      return;
    }

    setError('');
    setIsLoading(true);
    setPosition(0);
    setDuration(0);
    // Update the player shell immediately. Artwork and metadata should move
    // with a queue swipe while the stream grant or local-file lookup continues.
    setCurrent(item);
    if (liveKit) await liveKit.AudioSession.stopAudioSession().catch(() => undefined);
    if (!isLatestRequest()) return;
    clearLiveConnection();
    releaseAudio();
    // Foreground-service notifications need a runtime grant on Android 13+;
    // ask early so the lock-screen controls can appear. Never blocks playback.
    void ensureLiveAudioNotificationPermission();

    try {
      let playbackUrl = existingUrl;
      let expiresIn = 0;

      if (!localUrl && item.id) {
        const localDownload = await getLocalDownloadForTrack(item.id).catch(() => null);
        if (!isLatestRequest()) return;
        if (localDownload?.status === 'completed' && localDownload.localUri) {
          playbackUrl = localDownload.localUri;
        } else {
          const grant = await getAudioStreamUrl(item.id);
          if (!isLatestRequest()) return;
          playbackUrl = grant.streamUrl;
          expiresIn = grant.expiresIn;
        }
      }

      if (!playbackUrl) {
        throw new Error('Echoo could not prepare this audio for playback.');
      }
      if (!isLatestRequest()) return;

      const playableItem = { ...item, fileUrl: playbackUrl };
      audioProgressRef.current = { trackId: item.id, position: 0, duration: 0, sentPosition: 0, lastSentAt: 0, wasPlaying: false, completed: false };
      setCurrent(playableItem);
      audioStreamExpiresAtRef.current = expiresIn > 0
        ? Date.now() + (expiresIn * 1000)
        : 0;

      await configureBackgroundPlaybackMode();
      if (!isLatestRequest()) return;

      const player = createAudioPlayer(
        { uri: playbackUrl },
        { updateInterval: 250, keepAudioSessionActive: true }
      );
      player.loop = repeat;
      statusSubscriptionRef.current = player.addListener(
        'playbackStatusUpdate',
        handleAudioStatus
      );
      const lockScreenArtwork = /^(https?:|file:|content:)/i.test(item.coverArt || '')
        ? item.coverArt
        : undefined;
      player.setActiveForLockScreen(
        true,
        {
          title: item.title,
          artist: item.subtitle,
          albumTitle: item.genre || 'Echoo',
          artworkUrl: lockScreenArtwork,
        },
        { showSeekBackward: true, showSeekForward: true }
      );
      playerRef.current = player;
      player.play();
      setIsPlaying(true);
    } catch (playbackError: any) {
      if (!isLatestRequest()) return;
      releaseAudio();
      setIsLoading(false);
      setIsPlaying(false);
      setError(playbackError?.message || 'Could not play this audio.');
    }
  }, [clearLiveConnection, handleAudioStatus, liveKit, releaseAudio, repeat, setCurrent, setQueue]);

  const playAudioQueue = useCallback(async (items: AudioPlaybackItem[], startIndex = 0) => {
    const selectedId = items[Math.max(0, Math.min(startIndex, items.length - 1))]?.id;
    const seenTrackIds = new Set<string>();
    const cleanItems = items.filter((item) => {
      if (!item.id || seenTrackIds.has(item.id)) return false;
      seenTrackIds.add(item.id);
      return true;
    });
    if (!cleanItems.length) return;
    const index = Math.max(0, cleanItems.findIndex((item) => item.id === selectedId));
    await playAudio(cleanItems[index], { queue: cleanItems, index });
  }, [playAudio]);

  const playNext = useCallback(async () => {
    const nextIndex = queueIndexRef.current + 1;
    const next = queueRef.current[nextIndex];
    if (!next) return;
    setQueue(queueRef.current, nextIndex);
    await playAudio(next, { preserveQueue: true });
  }, [playAudio, setQueue]);

  const playPrevious = useCallback(async () => {
    const previousIndex = Math.max(0, queueIndexRef.current - 1);
    const previous = queueRef.current[previousIndex];
    if (!previous) {
      await playerRef.current?.seekTo(0);
      return;
    }
    setQueue(queueRef.current, previousIndex);
    await playAudio(previous, { preserveQueue: true });
  }, [playAudio, setQueue]);

  const playLive = useCallback(async (item: LivePlaybackItem) => {
    audioRequestGenerationRef.current += 1;
    if (
      currentRef.current?.kind === 'live' &&
      currentRef.current.id === item.id &&
      liveKit &&
      liveCredentials
    ) {
      isPlayingRef.current = true;
      setIsPlaying(true);
      return;
    }

    releaseAudio();
    clearLiveConnection();
    setQueue([], -1);
    setCurrent(item);
    setPosition(0);
    setDuration(0);
    setError('');
    setIsLoading(true);
    liveIntentionalStopRef.current = false;
    void ensureLiveAudioNotificationPermission();

    let connectedLiveKitModule: LiveKitNativeModule | null = null;
    try {
      await configureBackgroundPlaybackMode();
      const [liveKitModule, credentials] = await Promise.all([
        loadLiveKitNativeModule(),
        getListenerLiveKitCredentials(item.id),
      ]);
      connectedLiveKitModule = liveKitModule;
      // PersistentLiveConnection owns the LiveKit audio session. Starting it
      // before a room has connected lets iOS deactivate it again before a
      // remote track is available, which also drops the system media session.
      setLiveKit(liveKitModule);
      liveCredentialsRef.current = credentials;
      setLiveCredentials(credentials);
      setLiveNativeUnavailable(false);
      isPlayingRef.current = true;
      setIsPlaying(true);
    } catch (liveError: any) {
      const moduleUnavailable = /native|module|webrtc|development build/i.test(
        String(liveError?.message || '')
      );
      setLiveNativeUnavailable(moduleUnavailable);
      isPlayingRef.current = false;
      setIsPlaying(false);
      setError(
        moduleUnavailable
          ? 'Live audio requires the Echoo iOS or Android development build.'
          : liveError?.message || 'Could not join this live broadcast.'
      );
      await connectedLiveKitModule?.AudioSession.stopAudioSession().catch(() => undefined);
      void stopLiveAudioService();
    } finally {
      setIsLoading(false);
    }
  }, [clearLiveConnection, liveCredentials, liveKit, releaseAudio, setCurrent, setQueue]);

  const pause = useCallback(() => {
    if (currentRef.current?.kind === 'audio') {
      playerRef.current?.pause();
    }
    isPlayingRef.current = false;
    liveRecoveryGenerationRef.current += 1;
    liveRecoveryRunningRef.current = false;
    setIsPlaying(false);
  }, []);

  const resume = useCallback(async () => {
    const active = currentRef.current;
    if (!active) return;

    if (active.kind === 'audio') {
      const currentPlayer = playerRef.current;
      const stale =
        !currentPlayer ||
        (
          audioStreamExpiresAtRef.current > 0 &&
          audioStreamExpiresAtRef.current <= Date.now() + (5 * 60 * 1000)
        );
      if (stale) {
        await playAudio(active);
      } else {
        currentPlayer.play();
        setIsPlaying(true);
      }
      return;
    }

    if (liveKit && liveCredentials) {
      isPlayingRef.current = true;
      setIsPlaying(true);
      return;
    }

    await playLive(active);
  }, [liveCredentials, liveKit, playAudio, playLive]);

  const toggle = useCallback(async () => {
    if (isPlaying) pause();
    else await resume();
  }, [isPlaying, pause, resume]);

  const seekTo = useCallback(async (positionMs: number) => {
    if (currentRef.current?.kind !== 'audio' || !playerRef.current) return;
    const nextSeconds = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, positionMs) / 1000);
    await playerRef.current.seekTo(nextSeconds);
  }, [duration]);

  const seekBy = useCallback(async (deltaMs: number) => {
    await seekTo(position + deltaMs);
  }, [position, seekTo]);

  const setRepeat = useCallback((enabled: boolean) => {
    setRepeatState(enabled);
    if (playerRef.current) playerRef.current.loop = enabled;
  }, []);

  const stop = useCallback(() => {
    audioRequestGenerationRef.current += 1;
    isPlayingRef.current = false;
    releaseAudio();
    clearLiveConnection();
    setQueue([], -1);
    setCurrent(null);
    setIsPlaying(false);
    setIsLoading(false);
    setError('');
    setPosition(0);
    setDuration(0);
  }, [clearLiveConnection, releaseAudio, setCurrent, setQueue]);

  const clearError = useCallback(() => setError(''), []);

  const endLivePlayback = useCallback(() => {
    liveIntentionalStopRef.current = true;
    liveRecoveryGenerationRef.current += 1;
    liveRecoveryRunningRef.current = false;
    liveCredentialsRef.current = null;
    setLiveCredentials(null);
    setLiveKit(null);
    setLiveNativeUnavailable(false);
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
    setError('This live broadcast has ended.');
  }, []);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const recoverLiveConnection = useCallback(async (
    sourceToken: string,
    reason = 'Live audio disconnected.'
  ) => {
    if (liveIntentionalStopRef.current) return;
    const active = currentRef.current;
    if (
      active?.kind !== 'live' ||
      !isPlayingRef.current ||
      liveCredentialsRef.current?.token !== sourceToken ||
      liveRecoveryRunningRef.current
    ) return;

    liveRecoveryRunningRef.current = true;
    const generation = ++liveRecoveryGenerationRef.current;
    const broadcastId = active.id;
    let attempt = 0;

    try {
      while (
        generation === liveRecoveryGenerationRef.current &&
        isPlayingRef.current &&
        currentRef.current?.kind === 'live' &&
        currentRef.current.id === broadcastId
      ) {
        try {
          setIsLoading(true);
          setError(attempt > 0 ? 'Reconnecting live audio…' : '');
          const credentials = await getListenerLiveKitCredentials(broadcastId);
          if (
            generation !== liveRecoveryGenerationRef.current ||
            !isPlayingRef.current ||
            currentRef.current?.kind !== 'live' ||
            currentRef.current.id !== broadcastId
          ) return;

          if (liveKit) {
            await configureLiveKitListenerAudio(liveKit);
            await liveKit.AudioSession.startAudioSession();
          }
          liveCredentialsRef.current = credentials;
          setLiveCredentials(credentials);
          setLiveNativeUnavailable(false);
          setError('');
          setIsLoading(false);
          return;
        } catch {
          if (
            generation !== liveRecoveryGenerationRef.current ||
            !isPlayingRef.current
          ) return;
          const delays = [500, 1000, 2000, 4000, 8000, 15000, 30000];
          const base = delays[Math.min(attempt, delays.length - 1)];
          attempt += 1;
          setIsLoading(false);
          setError('Reconnecting live audio…');
          await new Promise((resolve) => setTimeout(
            resolve,
            base + Math.round(Math.random() * Math.min(3000, base * 0.25))
          ));
        }
      }
    } finally {
      if (generation === liveRecoveryGenerationRef.current) {
        liveRecoveryRunningRef.current = false;
      }
    }

    void reason;
  }, [liveKit]);

  const handleLiveError = useCallback((message: string, sourceToken: string) => {
    if (liveIntentionalStopRef.current) return;
    if (isLiveBroadcastEndedError(message)) {
      endLivePlayback();
      return;
    }
    setError('Reconnecting live audio…');
    void recoverLiveConnection(sourceToken, message);
  }, [endLivePlayback, recoverLiveConnection]);

  useEffect(() => {
    void configureBackgroundPlaybackMode().catch(() => undefined);
  }, []);

  useEffect(() => () => releaseAudio(), [releaseAudio]);

  // PersistentLiveConnection starts system media integration after LiveKit has
  // connected. This effect only tears it down after playback really ends.
  useEffect(() => {
    if (current?.kind !== 'live' || (!isPlaying && !isLoading)) {
      void stopLiveAudioService();
    }
  }, [current, isLoading, isPlaying]);

  const value = useMemo<PlaybackContextValue>(() => ({
    current,
    queue,
    queueIndex,
    upNext: queueIndex >= 0 ? queue.slice(queueIndex + 1) : [],
    isPlaying,
    isLoading,
    error,
    position,
    duration,
    repeat,
    liveNativeUnavailable,
    playAudio,
    playAudioQueue,
    playLive,
    playNext,
    playPrevious,
    pause,
    resume,
    toggle,
    seekTo,
    seekBy,
    setRepeat,
    stop,
    clearError,
  }), [
    clearError,
    current,
    duration,
    error,
    isLoading,
    isPlaying,
    liveNativeUnavailable,
    pause,
    playAudio,
    playAudioQueue,
    playLive,
    playNext,
    playPrevious,
    position,
    queue,
    queueIndex,
    repeat,
    resume,
    seekBy,
    seekTo,
    setRepeat,
    stop,
    toggle,
  ]);

  return (
    <PlaybackContext.Provider value={value}>
      {children}
      {current?.kind === 'live' && liveKit && liveCredentials && isPlaying ? (
        <PersistentLiveConnection
          key={liveCredentials.token}
          liveKit={liveKit}
          credentials={liveCredentials}
          title={current.title}
          artist={current.subtitle}
          onError={handleLiveError}
          onRecover={handleLiveError}
        />
      ) : null}
    </PlaybackContext.Provider>
  );
}

const MOBILE_LIVEKIT_RECONNECT_DELAYS_MS = [0, 500, 1000, 2000, 4000, 8000, 12000];

function PersistentLiveConnection({
  liveKit,
  credentials,
  title,
  artist,
  onError,
  onRecover,
}: {
  liveKit: LiveKitNativeModule;
  credentials: LiveCredentials;
  title: string;
  artist: string;
  onError: (message: string, sourceToken: string) => void;
  onRecover: (message: string, sourceToken: string) => void;
}) {
  const { AudioSession, LiveKitRoom } = liveKit;
  const reconnectPolicy = useMemo(
    () => new DefaultReconnectPolicy([...MOBILE_LIVEKIT_RECONNECT_DELAYS_MS]),
    []
  );

  useEffect(() => {
    let active = true;
    const start = async () => {
      try {
        await configureLiveKitListenerAudio(liveKit);
        await AudioSession.startAudioSession();
      } catch (sessionError: any) {
        if (!active) return;
        onError(
          sessionError?.message || 'Could not start the live audio session.',
          credentials.token
        );
      }
    };
    void start();
    return () => {
      active = false;
      AudioSession.stopAudioSession();
    };
  }, [AudioSession, credentials.token, liveKit, onError]);

  return (
    <LiveKitRoom
      serverUrl={credentials.livekitUrl}
      token={credentials.token}
      connect
      audio={false}
      video={false}
      options={{ adaptiveStream: true, reconnectPolicy }}
      connectOptions={{
        autoSubscribe: true,
        peerConnectionTimeout: 30_000,
        websocketTimeout: 30_000,
      }}
      onConnected={() => {
        // Start the foreground service / Now Playing card only after a native
        // LiveKit room exists. That keeps Android's process prioritized and
        // gives iOS an active playback session behind the Lock Screen card.
        void startLiveAudioService({
          title: title || 'Live on Echoo',
          artist,
          broadcastId: credentials.broadcastId,
          kind: 'live',
        });
      }}
      onDisconnected={() => onRecover('LiveKit disconnected.', credentials.token)}
      onError={(roomError) => onError(
        roomError?.message || 'LiveKit connection failed.',
        credentials.token
      )}
    >
      <View style={{ width: 0, height: 0 }} />
    </LiveKitRoom>
  );
}

export function usePlayback() {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error('usePlayback must be used inside PlaybackProvider.');
  return value;
}
