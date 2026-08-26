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

import { getListenerLiveKitCredentials } from '@/src/services/echooApi';

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
  fileUrl: string;
  genre?: string;
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
  isPlaying: boolean;
  isLoading: boolean;
  error: string;
  position: number;
  duration: number;
  repeat: boolean;
  liveNativeUnavailable: boolean;
  playAudio: (item: AudioPlaybackItem) => Promise<void>;
  playLive: (item: LivePlaybackItem) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  toggle: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  seekBy: (deltaMs: number) => Promise<void>;
  setRepeat: (enabled: boolean) => void;
  stop: () => void;
  clearError: () => void;
};

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

let liveKitGlobalsRegistered = false;

async function loadLiveKitNativeModule() {
  const liveKit = await import('@livekit/react-native');
  if (!liveKitGlobalsRegistered) {
    liveKit.registerGlobals();
    liveKitGlobalsRegistered = true;
  }
  return liveKit;
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const statusSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const currentRef = useRef<PlaybackItem | null>(null);

  const [current, setCurrentState] = useState<PlaybackItem | null>(null);
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

  const releaseAudio = useCallback(() => {
    statusSubscriptionRef.current?.remove();
    statusSubscriptionRef.current = null;

    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      player.clearLockScreenControls();
      player.pause();
      player.remove();
    }
  }, []);

  const clearLiveConnection = useCallback(() => {
    setLiveCredentials(null);
    setLiveKit(null);
    setLiveNativeUnavailable(false);
  }, []);

  const handleAudioStatus = useCallback((status: AudioStatus) => {
    setIsLoading(status.isBuffering || !status.isLoaded);
    setIsPlaying(status.playing);
    setPosition(Math.max(0, status.currentTime * 1000));
    setDuration(Math.max(0, status.duration * 1000));
  }, []);

  const playAudio = useCallback(async (item: AudioPlaybackItem) => {
    if (!item.fileUrl) {
      setError('This audio item does not have a playable media URL.');
      return;
    }

    if (
      currentRef.current?.kind === 'audio' &&
      currentRef.current.id === item.id &&
      playerRef.current
    ) {
      playerRef.current.play();
      setIsPlaying(true);
      return;
    }

    setError('');
    setIsLoading(true);
    setPosition(0);
    setDuration(0);
    if (liveKit) await liveKit.AudioSession.stopAudioSession().catch(() => undefined);
    clearLiveConnection();
    releaseAudio();
    setCurrent(item);

    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });

      const player = createAudioPlayer(
        { uri: item.fileUrl },
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
      releaseAudio();
      setIsLoading(false);
      setIsPlaying(false);
      setError(playbackError?.message || 'Could not play this audio.');
    }
  }, [clearLiveConnection, handleAudioStatus, liveKit, releaseAudio, repeat, setCurrent]);

  const playLive = useCallback(async (item: LivePlaybackItem) => {
    if (
      currentRef.current?.kind === 'live' &&
      currentRef.current.id === item.id &&
      liveKit &&
      liveCredentials
    ) {
      setIsPlaying(true);
      return;
    }

    releaseAudio();
    clearLiveConnection();
    setCurrent(item);
    setPosition(0);
    setDuration(0);
    setError('');
    setIsLoading(true);

    try {
      const [liveKitModule, credentials] = await Promise.all([
        loadLiveKitNativeModule(),
        getListenerLiveKitCredentials(item.id),
      ]);
      setLiveKit(liveKitModule);
      setLiveCredentials(credentials);
      setLiveNativeUnavailable(false);
      setIsPlaying(true);
    } catch (liveError: any) {
      const moduleUnavailable = /native|module|webrtc|development build/i.test(
        String(liveError?.message || '')
      );
      setLiveNativeUnavailable(moduleUnavailable);
      setIsPlaying(false);
      setError(
        moduleUnavailable
          ? 'Live audio requires the Echoo iOS or Android development build.'
          : liveError?.message || 'Could not join this live broadcast.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [clearLiveConnection, liveCredentials, liveKit, releaseAudio, setCurrent]);

  const pause = useCallback(() => {
    if (currentRef.current?.kind === 'audio') {
      playerRef.current?.pause();
    }
    setIsPlaying(false);
  }, []);

  const resume = useCallback(async () => {
    const active = currentRef.current;
    if (!active) return;

    if (active.kind === 'audio') {
      playerRef.current?.play();
      setIsPlaying(Boolean(playerRef.current));
      return;
    }

    if (liveKit && liveCredentials) {
      setIsPlaying(true);
      return;
    }

    await playLive(active);
  }, [liveCredentials, liveKit, playLive]);

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
    releaseAudio();
    clearLiveConnection();
    setCurrent(null);
    setIsPlaying(false);
    setIsLoading(false);
    setError('');
    setPosition(0);
    setDuration(0);
  }, [clearLiveConnection, releaseAudio, setCurrent]);

  const clearError = useCallback(() => setError(''), []);

  const handleLiveError = useCallback(async (message: string) => {
    const active = currentRef.current;
    if (active?.kind !== 'live') return;

    if (/token|expired|unauthorized|authentication/i.test(message)) {
      try {
        setIsLoading(true);
        const credentials = await getListenerLiveKitCredentials(active.id);
        setLiveCredentials(credentials);
        setIsPlaying(true);
        setError('');
        return;
      } catch (refreshError: any) {
        message = refreshError?.message || message;
      } finally {
        setIsLoading(false);
      }
    }

    setError(message || 'LiveKit connection failed.');
    setIsPlaying(false);
  }, []);

  useEffect(() => () => releaseAudio(), [releaseAudio]);

  const value = useMemo<PlaybackContextValue>(() => ({
    current,
    isPlaying,
    isLoading,
    error,
    position,
    duration,
    repeat,
    liveNativeUnavailable,
    playAudio,
    playLive,
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
    playLive,
    position,
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
          onError={handleLiveError}
        />
      ) : null}
    </PlaybackContext.Provider>
  );
}

function PersistentLiveConnection({
  liveKit,
  credentials,
  onError,
}: {
  liveKit: LiveKitNativeModule;
  credentials: LiveCredentials;
  onError: (message: string) => void;
}) {
  const { AudioSession, LiveKitRoom } = liveKit;

  useEffect(() => {
    AudioSession.startAudioSession().catch((sessionError) => {
      onError(sessionError?.message || 'Could not start the live audio session.');
    });
    return () => {
      AudioSession.stopAudioSession();
    };
  }, [AudioSession, onError]);

  return (
    <LiveKitRoom
      serverUrl={credentials.livekitUrl}
      token={credentials.token}
      connect
      audio={false}
      video={false}
      options={{ adaptiveStream: true }}
      onError={(roomError) => onError(roomError?.message || 'LiveKit connection failed.')}
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
