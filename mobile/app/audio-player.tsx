import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import {
  ChevronDown,
  Check,
  CheckCircle2,
  Download,
  Heart,
  ListMusic,
  MoreVertical,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  EchooAudio,
  EchooPlaylist,
  addTrackToPlaylist,
  createPlaylist,
  getAudioById,
  getCachedMyPlaylistsSnapshot,
  getSavedAudio,
  getMyPlaylists,
  hasEchooSession,
  saveAudio,
  unsaveAudio,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import {
  downloadAudioToDevice,
  getLocalDownloadStatusSnapshot,
  isAudioDownloaded,
  subscribeLocalDownloadStatus,
} from '@/src/services/localDownloads';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function AudioPlayerScreen() {
  const { router, push } = useGuardedRouter();
  const params = useLocalSearchParams<{
    audioId?: string;
    title?: string;
    subtitle?: string;
    coverArt?: string;
    fileUrl?: string;
    genre?: string;
    stationId?: string;
    stationName?: string;
    collectionId?: string;
    collectionName?: string;
  }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const playback = usePlayback();
  const playAudio = playback.playAudio;
  const openedRouteAudioIdRef = useRef('');
  const swipeInFlightRef = useRef(false);
  const playerCardTranslateX = useRef(new Animated.Value(0)).current;

  const requestedId = String(params.audioId || '');
  const requestedFileUrl = String(params.fileUrl || '');
  const requestedAudio = useMemo<AudioPlaybackItem | null>(
    () =>
      requestedId
        ? {
            kind: 'audio',
            id: requestedId,
            title: String(params.title || 'Echoo Audio'),
            subtitle: String(params.subtitle || params.genre || 'Echoo Creator'),
            coverArt: String(params.coverArt || ''),
            fileUrl: requestedFileUrl,
            genre: String(params.genre || ''),
            stationId: String(params.stationId || ''),
            stationName: String(params.stationName || ''),
            collectionId: String(params.collectionId || ''),
            collectionName: String(params.collectionName || ''),
          }
        : null,
    [
      params.coverArt,
      params.genre,
      params.stationId,
      params.stationName,
      params.collectionId,
      params.collectionName,
      params.subtitle,
      params.title,
      requestedFileUrl,
      requestedId,
    ]
  );
  const currentAudio = playback.current?.kind === 'audio' ? playback.current : null;
  // The route starts a track, but the provider becomes the source of truth
  // once a listener moves through the queue with a swipe or skip control.
  const activeAudio = currentAudio || requestedAudio;
  const audioId = activeAudio?.id || '';
  const title = activeAudio?.title || 'Echoo Audio';
  const subtitle = activeAudio?.subtitle || 'Echoo Creator';
  const stationId = activeAudio?.stationId || '';
  const stationName = activeAudio?.stationName || subtitle;
  const collectionId = activeAudio?.collectionId || '';
  const collectionName = activeAudio?.collectionName || '';
  const coverArt = activeAudio?.coverArt || '';
  const genre = activeAudio?.genre || '';
  const canControl = currentAudio?.id === audioId;
  const loading = playback.isLoading;
  const playing = playback.isPlaying && canControl;
  const position = canControl ? playback.position : 0;
  const duration = canControl ? playback.duration : 0;
  const repeatOn = playback.repeat;
  const upNext = playback.upNext;
  const hasQueue = playback.queue.length > 1;

  const [progressWidth, setProgressWidth] = useState(1);
  const [seekPreview, setSeekPreview] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [, setDownloadProgress] = useState(0);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [addedPlaylist, setAddedPlaylist] = useState<EchooPlaylist | null>(null);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [audioInfoOpen, setAudioInfoOpen] = useState(false);
  const [shareAudioOpen, setShareAudioOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistBusyId, setPlaylistBusyId] = useState('');
  const [playlists, setPlaylists] = useState<EchooPlaylist[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const playbackError = playback.error;

  useEffect(() => {
    if (!requestedAudio) return;
    if (openedRouteAudioIdRef.current === requestedAudio.id) return;
    openedRouteAudioIdRef.current = requestedAudio.id;
    if (currentAudio?.id === requestedAudio.id) return;
    if (params.title) { void playAudio(requestedAudio); return; }
    let active = true;
    void getAudioById(requestedAudio.id).then((track) => {
      if (!active) return;
      void playAudio({ kind: 'audio', id: track.id, title: track.title, subtitle: track.stationName || track.subtitle || track.artistName || 'Echoo Audio', coverArt: track.coverArt || '', fileUrl: track.fileUrl || '', genre: track.genre || '', stationId: track.stationId || '', stationName: track.stationName || '', collectionId: track.collectionId || '', collectionName: track.collectionName || '' });
    }).catch(() => { if (active) void playAudio(requestedAudio); });
    return () => { active = false; };
  }, [currentAudio?.id, params.title, playAudio, requestedAudio]);

  useEffect(() => {
    let active = true;
    setSaved(false);
    setDownloaded(false);
    setDownloadProgress(0);

    const loadSavedState = async () => {
      const session = await hasEchooSession();
      if (!active) return;
      setSignedIn(session);

      if (session && audioId) {
        getSavedAudio()
          .then((tracks) => {
            if (active) setSaved(tracks.some((track: EchooAudio) => track.id === audioId));
          })
          .catch(() => undefined);
      }
    };

    const syncDownloadState = async () => {
      if (!audioId) return;
      const snapshot = getLocalDownloadStatusSnapshot(audioId);
      if (snapshot) {
        setDownloading(snapshot.status === 'downloading');
        setDownloaded(snapshot.status === 'completed');
        setDownloadProgress(snapshot.progress);
      }

      const exists = await isAudioDownloaded(audioId);
      if (!active) return;
      if (exists) {
        setDownloading(false);
        setDownloaded(true);
        setDownloadProgress(100);
      }
    };

    loadSavedState();
    syncDownloadState();
    const unsubscribeDownloads = subscribeLocalDownloadStatus(() => {
      if (!audioId) return;
      const status = getLocalDownloadStatusSnapshot(audioId);
      if (!status) return;
      setDownloading(status.status === 'downloading');
      setDownloaded(status.status === 'completed');
      setDownloadProgress(status.progress);
    });

    return () => {
      active = false;
      unsubscribeDownloads();
    };
  }, [audioId]);

  const currentTrack = useMemo<EchooAudio | null>(() => {
    if (!activeAudio || !audioId) return null;
    return {
      id: audioId,
      title,
      subtitle: stationName,
      artistName: stationName,
      stationId,
      stationName,
      collectionId,
      collectionName,
      coverArt,
      fileUrl: activeAudio.fileUrl,
      genre,
      duration: duration ? Math.round(duration / 1000) : 0,
    } as EchooAudio & { collectionId?: string; collectionName?: string };
  }, [activeAudio, audioId, collectionId, collectionName, coverArt, duration, genre, stationId, stationName, title]);

  const togglePlayback = () => playback.toggle();
  const seekBy = useCallback((deltaMs: number) => playback.seekBy(deltaMs), [playback]);
  const previousTrack = useCallback(async () => {
    if (hasQueue) await playback.playPrevious();
    else await seekBy(-15000);
  }, [hasQueue, playback, seekBy]);
  const nextTrack = useCallback(async () => {
    if (upNext.length) await playback.playNext();
    else await seekBy(15000);
  }, [playback, seekBy, upNext.length]);

  const settlePlayerCard = useCallback((toValue = 0, velocity = 0) => new Promise<void>((resolve) => {
    Animated.spring(playerCardTranslateX, {
      toValue,
      velocity,
      damping: 19,
      stiffness: 220,
      mass: 0.75,
      useNativeDriver: true,
    }).start(() => resolve());
  }), [playerCardTranslateX]);

  const movePlayerCard = useCallback((toValue: number) => new Promise<void>((resolve) => {
    Animated.timing(playerCardTranslateX, {
      toValue,
      duration: 150,
      useNativeDriver: true,
    }).start(() => resolve());
  }), [playerCardTranslateX]);

  const changeTrackWithSwipe = useCallback(async (direction: -1 | 1) => {
    const action = direction === -1 ? nextTrack : previousTrack;
    // The artwork/title changes immediately; only the audio source continues
    // loading in the background. This keeps a swipe feeling like a player,
    // not a network operation.
    void action();
    await movePlayerCard(direction * 420);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    playerCardTranslateX.setValue(direction * -72);
    await movePlayerCard(0);
  }, [movePlayerCard, nextTrack, playerCardTranslateX, previousTrack]);

  const artworkSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(hasQueue && !swipeInFlightRef.current)
        .activeOffsetX([-8, 8])
        .failOffsetY([-24, 24])
        .runOnJS(true)
        .onBegin(() => playerCardTranslateX.stopAnimation())
        .onUpdate((gesture) => {
          playerCardTranslateX.setValue(Math.max(-180, Math.min(180, gesture.translationX)));
        })
        .onFinalize((gesture) => {
          const wantsNext = gesture.translationX <= -44 && upNext.length > 0;
          const wantsPrevious = gesture.translationX >= 44 && playback.queueIndex > 0;
          if ((!wantsNext && !wantsPrevious) || swipeInFlightRef.current) {
            void settlePlayerCard();
            return;
          }

          swipeInFlightRef.current = true;
          void changeTrackWithSwipe(wantsNext ? -1 : 1).finally(() => {
            swipeInFlightRef.current = false;
          });
        }),
    [changeTrackWithSwipe, hasQueue, playback.queueIndex, playerCardTranslateX, settlePlayerCard, upNext.length]
  );

  const playerCardOpacity = playerCardTranslateX.interpolate({
    inputRange: [-420, -120, 0, 120, 420],
    outputRange: [0.2, 0.78, 1, 0.78, 0.2],
    extrapolate: 'clamp',
  });
  const playerCardScale = playerCardTranslateX.interpolate({
    inputRange: [-420, 0, 420],
    outputRange: [0.96, 1, 0.96],
    extrapolate: 'clamp',
  });

  const seekToFraction = async (fraction: number) => {
    if (!canControl || duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    await playback.seekTo(Math.round(duration * clamped));
  };

  const toggleSaved = async () => {
    if (!audioId) return;
    if (!signedIn) {
      push('/auth');
      return;
    }

    setSaving(true);
    try {
      if (saved) {
        await unsaveAudio(audioId);
        setSaved(false);
        setActionError('Removed from saved audio.');
      } else {
        await saveAudio(audioId);
        setSaved(true);
        setActionError('Saved to your library.');
      }
    } catch (saveError: any) {
      setActionError(friendlyErrorMessage(saveError, 'Could not update your library.'));
    } finally {
      setSaving(false);
    }
  };

  const shareTrack = async () => {
    if (!audioId) return;
    const url = `https://echoo.digi02.org/listen/audio/${encodeURIComponent(audioId)}`;
    await Share.share({ title, message: `${title} on Echoo\n${url}`, url });
  };

  const downloadTrack = async () => {
    if (!currentTrack) return;
    if (!signedIn) {
      push('/auth');
      return;
    }

    setDownloading(true);
    setDownloadProgress(1);
    setActionError('');
    try {
      const completed = await downloadAudioToDevice(currentTrack, setDownloadProgress);
      setDownloaded(true);
      setDownloadProgress(100);
      setActionError('Downloaded for offline listening.');
      if (completed.localUri && currentAudio?.id === audioId) {
        await playback.playAudio(
          {
            kind: 'audio',
            id: audioId,
            title,
            subtitle,
            coverArt,
            fileUrl: completed.localUri,
            genre,
            stationId,
            stationName,
            collectionId,
            collectionName,
          },
          { preserveQueue: true }
        );
      }
    } catch (downloadError: any) {
      setActionError(friendlyErrorMessage(downloadError, 'Could not download this audio.'));
    } finally {
      setDownloading(false);
    }
  };

  const openPlaylistPicker = async () => {
    if (!audioId) return;
    if (!signedIn) {
      push('/auth');
      return;
    }

    setPlaylistModalOpen(true);
    setAddedPlaylist(null);
    setCreatingPlaylist(false);
    setActionError('');

    const cachedPlaylists = await getCachedMyPlaylistsSnapshot().catch(() => []);
    if (cachedPlaylists.length) {
      setPlaylists(cachedPlaylists);
      setPlaylistLoading(false);
    } else {
      setPlaylistLoading(true);
    }

    try {
      setPlaylists(await getMyPlaylists());
    } catch (playlistError: any) {
      if (!cachedPlaylists.length) {
        setActionError(friendlyErrorMessage(playlistError, 'Could not load your playlists.'));
      }
    } finally {
      setPlaylistLoading(false);
    }
  };

  const addToPlaylist = async (playlist: EchooPlaylist) => {
    if (!audioId) return;
    setPlaylistBusyId(playlist.id);
    setActionError('');
    try {
      await addTrackToPlaylist(playlist.id, audioId);
      setAddedPlaylist({ ...playlist, trackCount: (playlist.trackCount || playlist.tracks.length) + 1 });
    } catch (playlistError: any) {
      if (playlistError?.code === 'TRACK_ALREADY_IN_PLAYLIST') {
        setPlaylistModalOpen(false);
        setActionError('Already in this playlist.');
      } else {
        setActionError(friendlyErrorMessage(playlistError, 'Could not add this audio to the playlist.'));
      }
    } finally {
      setPlaylistBusyId('');
    }
  };

  const createAndAddPlaylist = async () => {
    const cleanName = newPlaylistName.trim();
    if (!cleanName || !audioId) return;
    setPlaylistBusyId('new');
    setActionError('');
    try {
      const playlist = await createPlaylist({ name: cleanName });
      await addTrackToPlaylist(playlist.id, audioId);
      setNewPlaylistName('');
      setCreatingPlaylist(false);
      setAddedPlaylist({ ...playlist, trackCount: (playlist.trackCount || playlist.tracks.length) + 1 });
    } catch (playlistError: any) {
      setActionError(friendlyErrorMessage(playlistError, 'Could not create this playlist.'));
    } finally {
      setPlaylistBusyId('');
    }
  };

  const openStation = () => {
    if (!stationId) return;
    push({ pathname: '/station', params: { stationId } });
  };

  const openCollection = () => {
    if (!collectionId) return;
    push({
      pathname: '/collection' as any,
      params: { collectionId, stationId, stationName },
    });
  };

  const progress = seekPreview ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const progressPercent = `${Math.max(0, Math.min(100, progress * 100))}%` as const;
  const displayPosition = seekPreview === null ? position : duration * seekPreview;

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}
    >
      {coverArt ? (
        <Image
          source={{ uri: coverArt }}
          style={styles.backgroundArtwork}
          contentFit="cover"
          blurRadius={60}
        />
      ) : null}
      <LinearGradient
        colors={coverArt
          ? ['rgba(32,20,16,0.36)', 'rgba(35,23,20,0.58)', 'rgba(247,249,253,0.96)', palette.background]
          : [palette.night2, palette.night, palette.background, palette.background]}
        locations={[0, 0.34, 0.72, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityLabel="Close player"
        >
          <ChevronDown color="#FFFFFF" size={26} />
        </Pressable>
        <Text style={styles.headerTitle}>Now Playing</Text>
        <Pressable
          style={styles.headerButton}
          onPress={() => setMoreOptionsOpen(true)}
          accessibilityLabel="More options"
        >
          <MoreVertical color="#FFFFFF" size={24} />
        </Pressable>
      </View>

      <View style={styles.playerCard}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
        <GestureDetector gesture={artworkSwipeGesture}>
        <Animated.View style={[styles.artworkStack, { opacity: playerCardOpacity, transform: [{ translateX: playerCardTranslateX }, { scale: playerCardScale }] }]}>
          <View style={[styles.artworkBack, styles.artworkBackFarLeft]}>
            {coverArt ? <Image source={{ uri: playback.queue[playback.queueIndex - 1]?.coverArt || coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
          </View>
          <View style={[styles.artworkBack, styles.artworkBackFarRight]}>
            {coverArt ? <Image source={{ uri: playback.queue[playback.queueIndex + 1]?.coverArt || coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
          </View>
          <View style={[styles.artworkBack, styles.artworkBackNearLeft]}>
            {coverArt ? <Image source={{ uri: playback.queue[playback.queueIndex - 1]?.coverArt || coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
          </View>
          <View style={[styles.artworkBack, styles.artworkBackNearRight]}>
            {coverArt ? <Image source={{ uri: playback.queue[playback.queueIndex + 1]?.coverArt || coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
          </View>
          <View style={styles.artwork}>
            {coverArt ? (
              <Image
                source={{ uri: coverArt }}
                style={StyleSheet.absoluteFillObject}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <LinearGradient
                colors={[palette.red, palette.blueDeep, palette.night]}
                style={[StyleSheet.absoluteFillObject, styles.artworkFallback]}
              >
                <Play color="rgba(255,255,255,0.92)" fill="rgba(255,255,255,0.92)" size={54} />
              </LinearGradient>
            )}
          </View>
        </Animated.View>
        </GestureDetector>

        <View style={styles.metaRow}>
          <View style={styles.metaCopy}>
            <Text style={styles.title}>{title}</Text>
            <Pressable disabled={!stationId} onPress={openStation}>
              <Text style={[styles.subtitle, stationId ? styles.linkText : null]} numberOfLines={1}>
                {stationName}
              </Text>
            </Pressable>
            {collectionId ? (
              <Pressable onPress={openCollection}>
                <Text style={styles.collectionContext} numberOfLines={1}>
                  From {collectionName || 'collection'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={styles.actionButton}
            onPress={toggleSaved}
            disabled={saving}
            accessibilityLabel={saved ? 'Remove from library' : 'Save to library'}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Heart
                color={saved ? palette.red : '#FFFFFF'}
                fill={saved ? palette.red : 'transparent'}
                size={25}
              />
            )}
          </Pressable>
        </View>

        {playbackError ? (
          <View style={styles.recoveryState}>
            <View style={styles.recoveryNotice}>
              <Text style={styles.recoveryNoticeIcon}>ⓘ</Text>
              <Text style={styles.recoveryNoticeText}>Audio couldn’t be loaded. Your listening position is saved.</Text>
            </View>
            <Text style={styles.recoveryHint}>Check your connection and try again, or listen to your downloaded audio.</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => { if (activeAudio) void playback.playAudio(activeAudio); }}
              disabled={!activeAudio}
            >
              <Text style={styles.retryButtonText}>Retry now</Text>
            </Pressable>
            <Pressable
              style={styles.downloadButton}
              onPress={() => { void downloadTrack(); }}
              disabled={downloading || !currentTrack}
            >
              <Text style={styles.downloadButtonText}>Go to download</Text>
            </Pressable>
          </View>
        ) : <>
        {actionError ? <ListenerToast message={actionError} tone={/saved|downloaded|removed|added|already/i.test(actionError) ? 'info' : 'error'} /> : null}
        <View
          style={styles.progressTouch}
          onLayout={(event: LayoutChangeEvent) => setProgressWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => canControl && duration > 0}
          onMoveShouldSetResponder={() => canControl && duration > 0}
          onResponderGrant={(event) => setSeekPreview(Math.max(0, Math.min(1, event.nativeEvent.locationX / progressWidth)))}
          onResponderMove={(event) => setSeekPreview(Math.max(0, Math.min(1, event.nativeEvent.locationX / progressWidth)))}
          onResponderRelease={(event) => { const fraction = Math.max(0, Math.min(1, event.nativeEvent.locationX / progressWidth)); setSeekPreview(fraction); void seekToFraction(fraction).catch(() => setActionError('Could not change playback position.')).finally(() => setSeekPreview(null)); }}
          onResponderTerminate={() => setSeekPreview(null)}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          accessibilityActions={[{ name: 'increment', label: 'Forward ten seconds' }, { name: 'decrement', label: 'Back ten seconds' }]}
          onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'increment') void playback.seekTo(Math.min(duration, position + 10000)).catch(() => undefined); if (event.nativeEvent.actionName === 'decrement') void playback.seekTo(Math.max(0, position - 10000)).catch(() => undefined); }}
        >
          <View pointerEvents="none" style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressPercent }]} />
            <View style={[styles.progressThumb, { left: progressPercent }]} />
          </View>
        </View>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
          <Text style={styles.timeText}>-{formatRemaining(duration, displayPosition)}</Text>
        </View>

        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.statusText}>Loading audio...</Text>
          </View>
        ) : null}

        <View style={styles.controls}>
          <Pressable
            style={[styles.secondaryControl, styles.controlDisabled]}
            disabled
            accessibilityLabel="Shuffle is unavailable for a single track"
          >
            <Shuffle color="rgba(255,255,255,0.52)" size={21} />
          </Pressable>
          <Pressable
            style={styles.transportButton}
            onPress={previousTrack}
            disabled={!canControl}
            accessibilityLabel={hasQueue ? 'Previous track' : 'Back 15 seconds'}
          >
            <SkipBack color="#050505" fill="#050505" size={29} />
          </Pressable>
          <Pressable
            style={[styles.playButton, !canControl && styles.controlDisabled]}
            onPress={togglePlayback}
            disabled={!canControl}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause color="#FFFFFF" fill="#FFFFFF" size={31} />
            ) : (
              <Play color="#FFFFFF" fill="#FFFFFF" size={31} />
            )}
          </Pressable>
          <Pressable
            style={styles.transportButton}
            onPress={nextTrack}
            disabled={!canControl}
            accessibilityLabel={upNext.length ? 'Next track' : 'Forward 15 seconds'}
          >
            <SkipForward color="#050505" fill="#050505" size={29} />
          </Pressable>
          <Pressable
            style={styles.secondaryControl}
            onPress={() => playback.setRepeat(!repeatOn)}
            accessibilityLabel="Toggle repeat"
          >
            <Repeat2 color={repeatOn ? palette.red : '#050505'} size={21} />
            {repeatOn ? <View style={styles.activeDot} /> : null}
          </Pressable>
        </View>

        {hasQueue ? (
          <View style={styles.upNextPanel}>
            <View style={styles.upNextHeader}>
              <Text style={styles.upNextTitle}>Up next</Text>
              <Text style={styles.upNextCount}>{upNext.length} queued</Text>
            </View>
            {upNext.length ? (
              upNext.slice(0, 5).map((item, index) => (
                <Pressable
                  key={item.id}
                  style={styles.upNextRow}
                  onPress={() => playback.playAudio(item, {
                    queue: playback.queue,
                    index: playback.queueIndex + index + 1,
                  })}
                >
                  <View style={styles.upNextArt}>
                    {item.coverArt ? (
                      <Image source={{ uri: item.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    ) : (
                      <Music2 color={palette.blue} size={18} />
                    )}
                  </View>
                  <View style={styles.upNextCopy}>
                    <Text style={styles.upNextTrack} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.upNextMeta} numberOfLines={1}>{item.stationName || item.subtitle}</Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <Text style={styles.upNextEmpty}>This is the last item in the queue.</Text>
            )}
          </View>
        ) : null}
        </>}
          </ScrollView>
      </View>

      <Modal
        visible={playlistModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPlaylistModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPlaylistModalOpen(false)}>
          <Pressable style={styles.playlistSheet}>
            <View style={styles.sheetHandle} />
            <View style={[styles.sheetHeading, styles.playlistHeading]}>
              <Text style={styles.sheetTitle}>{addedPlaylist ? 'Added to playlist' : 'Add to playlist'}</Text>
              <Pressable onPress={() => setPlaylistModalOpen(false)} accessibilityLabel="Close playlist sheet"><X color="#858585" size={22} /></Pressable>
            </View>
            {addedPlaylist ? (
              <>
                <View style={styles.playlistSuccess}><CheckCircle2 color="#278065" size={21} /><Text style={styles.playlistSuccessText}>{title} was added to {addedPlaylist.name}.</Text></View>
                <View style={styles.sheetTrackRow}>
                  <View style={styles.sheetArtwork}>{addedPlaylist.coverArt ? <Image source={{ uri: addedPlaylist.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <ListMusic color="#2B5FC0" size={22} />}</View>
                  <View style={styles.sheetTrackCopy}><Text style={styles.sheetTrackTitle} numberOfLines={1}>{addedPlaylist.name}</Text><Text style={styles.sheetTrackMeta}>By you · {addedPlaylist.trackCount || addedPlaylist.tracks.length} tracks</Text></View>
                  <CheckCircle2 color="#858585" size={23} />
                </View>
                <Pressable style={styles.playlistViewButton} onPress={() => { setPlaylistModalOpen(false); push({ pathname: '/collection', params: { collectionId: addedPlaylist.id } }); }}><Text style={styles.playlistViewText}>View {addedPlaylist.name}</Text></Pressable>
                <Pressable style={styles.playlistDoneButton} onPress={() => setPlaylistModalOpen(false)}><Text style={styles.playlistDoneText}>Done</Text></Pressable>
              </>
            ) : <>
            <View style={styles.sheetTrackRow}>
              <View style={styles.sheetArtwork}>{coverArt ? <Image source={{ uri: coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Music2 color="#2B5FC0" size={22} />}</View>
              <View style={styles.sheetTrackCopy}><Text style={styles.sheetTrackTitle} numberOfLines={1}>{title}</Text><Text style={styles.sheetTrackMeta} numberOfLines={1}>{stationName}</Text></View>
              <Music2 color="#858585" size={23} />
            </View>
            <Text style={styles.playlistPrompt}>Choose a playlist</Text>
            {creatingPlaylist ? <View style={styles.newPlaylistRow}>
              <TextInput
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                placeholder="New playlist name"
                placeholderTextColor={palette.faint}
                style={styles.playlistInput}
              />
              <Pressable
                style={[styles.createButton, !newPlaylistName.trim() ? styles.controlDisabled : null]}
                onPress={createAndAddPlaylist}
                disabled={!newPlaylistName.trim() || playlistBusyId === 'new'}
              >
                {playlistBusyId === 'new' ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Plus color="#FFFFFF" size={20} />
                )}
              </Pressable>
            </View> : null}

            {playlistLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={palette.blue} />
                <Text style={styles.sheetMuted}>Loading playlists...</Text>
              </View>
            ) : playlists.length ? (
              <ScrollView style={styles.playlistChoices} showsVerticalScrollIndicator={false}>
              {playlists.map((playlist) => (
                <Pressable key={playlist.id} style={styles.playlistRow} onPress={() => addToPlaylist(playlist)}>
                  <View style={styles.playlistIcon}>
                    {playlist.coverArt ? <Image source={{ uri: playlist.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <ListMusic color={palette.blue} size={19} />}
                  </View>
                  <View style={styles.playlistCopy}>
                    <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
                    <Text style={styles.playlistMeta}>By you · {playlist.trackCount || playlist.tracks.length} tracks</Text>
                  </View>
                  {playlistBusyId === playlist.id ? <ActivityIndicator color={palette.blue} size="small" /> : <Plus color="#858585" size={23} />}
                </Pressable>
              ))}
              </ScrollView>
            ) : (
              <Text style={styles.sheetMuted}>Create your first playlist above.</Text>
            )}
            <Pressable style={styles.createPlaylistOutline} onPress={() => setCreatingPlaylist(true)}><Text style={styles.createPlaylistOutlineText}>Create new playlist</Text></Pressable>
            </>}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={moreOptionsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMoreOptionsOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setMoreOptionsOpen(false)}>
          <Pressable style={styles.optionsSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.sheetSubtitle} numberOfLines={1}>{stationName}</Text>

            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setMoreOptionsOpen(false);
                void toggleSaved();
              }}
              disabled={saving}
            >
              <Heart color={saved ? palette.red : palette.ink} fill={saved ? palette.red : 'transparent'} size={20} />
              <Text style={styles.optionText}>{saved ? 'Remove from saved audio' : 'Save audio'}</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setMoreOptionsOpen(false);
                void downloadTrack();
              }}
              disabled={downloading || !currentTrack}
            >
              {downloaded ? <Check color={palette.blue} size={20} /> : <Download color={palette.ink} size={20} />}
              <Text style={styles.optionText}>{downloaded ? 'Downloaded on this device' : 'Download for offline'}</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setMoreOptionsOpen(false);
                void openPlaylistPicker();
              }}
            >
              <ListMusic color={palette.ink} size={20} />
              <Text style={styles.optionText}>Add to playlist</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setMoreOptionsOpen(false);
                setAudioInfoOpen(true);
              }}
            >
              <Music2 color={palette.ink} size={20} />
              <Text style={styles.optionText}>Audio information</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => {
                setMoreOptionsOpen(false);
                setShareCopied(false);
                setShareAudioOpen(true);
              }}
            >
              <Share2 color={palette.ink} size={20} />
              <Text style={styles.optionText}>Share audio</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={audioInfoOpen} transparent animationType="slide" onRequestClose={() => setAudioInfoOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAudioInfoOpen(false)}>
          <Pressable style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <Text style={styles.sheetTitle}>Audio Information</Text>
              <Pressable onPress={() => setAudioInfoOpen(false)} accessibilityLabel="Close audio information"><Text style={styles.sheetClose}>×</Text></Pressable>
            </View>
            <View style={styles.sheetTrackRow}>
              <View style={styles.sheetArtwork}>{coverArt ? <Image source={{ uri: coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Music2 color={palette.blue} size={22} />}</View>
              <View style={styles.sheetTrackCopy}><Text style={styles.sheetTrackTitle} numberOfLines={1}>{title}</Text><Text style={styles.sheetTrackMeta} numberOfLines={1}>{stationName}</Text></View>
              <Music2 color={palette.muted} size={24} />
            </View>
            <Text style={styles.infoDuration}>Duration · {formatTime(duration || 0)}</Text>
            <Text style={styles.infoHeading}>About this audio</Text>
            <Text style={styles.infoBody}>{genre ? `${genre} audio from ${stationName}.` : `Listen to this audio from ${stationName}.`}</Text>
            <Text style={[styles.infoHeading, styles.infoStation]}>{stationName}</Text>
            {stationId ? <Pressable onPress={() => { setAudioInfoOpen(false); openStation(); }}><Text style={styles.visitChannel}>Visit channel</Text></Pressable> : null}
            <Pressable style={styles.outlineDone} onPress={() => setAudioInfoOpen(false)}><Text style={styles.outlineDoneText}>Done</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={shareAudioOpen} transparent animationType="slide" onRequestClose={() => setShareAudioOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShareAudioOpen(false)}>
          <Pressable style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <Text style={styles.sheetTitle}>Share audio</Text>
              <Pressable onPress={() => setShareAudioOpen(false)} accessibilityLabel="Close share audio"><Text style={styles.sheetClose}>×</Text></Pressable>
            </View>
            <View style={styles.sheetTrackRow}>
              <View style={styles.sheetArtwork}>{coverArt ? <Image source={{ uri: coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Music2 color={palette.blue} size={22} />}</View>
              <View style={styles.sheetTrackCopy}><Text style={styles.sheetTrackTitle} numberOfLines={1}>{title}</Text><Text style={styles.sheetTrackMeta} numberOfLines={1}>{stationName} · {formatTime(duration || 0)}</Text></View>
              <Share2 color={palette.muted} size={24} />
            </View>
            <Text style={styles.shareUrl} selectable numberOfLines={2}>{audioId ? `https://echoo.digi02.org/listen/audio/${encodeURIComponent(audioId)}` : ''}</Text>
            <Pressable style={styles.copyLinkButton} onPress={() => { void shareTrack().then(() => setShareCopied(true)).catch(() => setActionError('Could not share this audio.')); }}><Text style={styles.copyLinkText}>Share link</Text></Pressable>
            {shareCopied ? <View style={styles.copyNotice}><Check color="#278065" size={22} /><Text style={styles.copyNoticeText}>Share options opened</Text></View> : null}
            <Pressable style={styles.primaryDone} onPress={() => setShareAudioOpen(false)}><Text style={styles.primaryDoneText}>Done</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatRemaining(duration: number, position: number) {
  return formatTime(Math.max(0, duration - position));
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background, overflow: 'hidden' },
  backgroundArtwork: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.68,
    transform: [{ scale: 1.18 }],
  },
  playerCard: { flex: 1 },
  header: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 18, maxWidth: 220 },
  content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 28 },
  artworkStack: {
    width: '100%',
    maxWidth: 430,
    aspectRatio: 1.06,
    alignSelf: 'center',
    position: 'relative',
  },
  artworkBack: {
    position: 'absolute',
    width: '75%',
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  artworkBackFarLeft: { left: '0.5%', top: '17%', aspectRatio: 269 / 225, opacity: 0.72 },
  artworkBackFarRight: { left: '24.5%', top: '17%', aspectRatio: 269 / 225, opacity: 0.72 },
  artworkBackNearLeft: { left: '6%', top: '10%', aspectRatio: 269 / 271, opacity: 0.85 },
  artworkBackNearRight: { left: '19%', top: '10%', aspectRatio: 269 / 271, opacity: 0.85 },
  artwork: {
    position: 'absolute',
    left: '12.5%',
    top: '3%',
    width: '75%',
    aspectRatio: 269 / 319,
    borderRadius: 15,
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: palette.surfaceRaised,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  artworkFallback: { alignItems: 'center', justifyContent: 'center' },
  metaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaCopy: { flex: 1, minWidth: 0 },
  title: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 22 },
  subtitle: { color: 'rgba(255,255,255,0.78)', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  linkText: { color: '#FFFFFF', fontWeight: '900' },
  collectionContext: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, marginTop: 4, fontWeight: '700' },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTouch: { height: 44, justifyContent: 'center', marginTop: 10 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.72)',
    overflow: 'visible',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: palette.blue },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: palette.blue,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  timeText: { color: 'rgba(255,255,255,0.7)', fontFamily: 'DMSans_400Regular', fontSize: 10 },
  statusRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  statusText: { color: 'rgba(255,255,255,0.78)', fontSize: 11.5, fontWeight: '700' },
  errorText: { color: palette.red, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  recoveryState: { alignItems: 'stretch', paddingTop: 38 },
  recoveryNotice: { minHeight: 68, borderRadius: 12, backgroundColor: '#FCE8EC', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recoveryNoticeIcon: { color: palette.red, fontSize: 21, fontWeight: '800' },
  recoveryNoticeText: { flex: 1, color: palette.red, fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  recoveryHint: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 18, paddingHorizontal: 8 },
  retryButton: { minHeight: 56, borderRadius: 28, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 34 },
  retryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  downloadButton: { minHeight: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  downloadButtonText: { color: palette.blue, fontSize: 15, fontWeight: '900' },
  controls: {
    height: 86,
    marginTop: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryControl: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transportButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: { opacity: 0.42 },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  footerActions: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.32)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  footerAction: {
    minWidth: 68,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerLabel: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  footerLabelActive: { color: palette.red },
  footerLabelBlue: { color: palette.blue },
  footerProgressTrack: {
    width: 46,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.lineStrong,
    overflow: 'hidden',
  },
  footerProgressFill: { height: 3, borderRadius: 2, backgroundColor: palette.blue },
  upNextPanel: {
    marginTop: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.86)',
    padding: 16,
  },
  upNextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  upNextTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  upNextCount: { color: '#666666', fontFamily: 'DMSans_500Medium', fontSize: 11 },
  upNextRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  upNextArt: { width: 44, height: 44, borderRadius: 7, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  upNextCopy: { flex: 1, minWidth: 0 },
  upNextTrack: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 13 },
  upNextMeta: { color: '#666666', fontFamily: 'DMSans_400Regular', fontSize: 11, marginTop: 2 },
  upNextEmpty: { color: '#666666', fontFamily: 'DMSans_400Regular', fontSize: 12, paddingVertical: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'flex-end',
  },
  playlistSheet: {
    height: '52.5%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#F9FBFF',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 24,
  },
  optionsSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
  },
  detailSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.surface,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 30,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.lineStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 22, marginBottom: 0 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playlistHeading: { minHeight: 34, marginBottom: 13 },
  sheetClose: { color: palette.muted, fontSize: 34, lineHeight: 34, fontWeight: '400', marginTop: -12 },
  sheetTrackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sheetArtwork: { width: 62, height: 58, borderRadius: 5, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  sheetTrackCopy: { flex: 1, minWidth: 0 },
  sheetTrackTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  sheetTrackMeta: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  playlistPrompt: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginBottom: 12 },
  playlistChoices: { maxHeight: 148, flexGrow: 0 },
  createPlaylistOutline: { height: 56, borderRadius: 28, borderWidth: 1, borderColor: '#858585', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  createPlaylistOutlineText: { color: '#2B5FC0', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  playlistSuccess: { minHeight: 44, borderRadius: 10, paddingHorizontal: 12, marginBottom: 16, backgroundColor: '#E7F2EC', flexDirection: 'row', alignItems: 'center', gap: 9 },
  playlistSuccessText: { flex: 1, color: '#278065', fontFamily: 'DMSans_400Regular', fontSize: 12.5 },
  playlistViewButton: { height: 56, borderRadius: 28, backgroundColor: '#2B5FC0', alignItems: 'center', justifyContent: 'center' },
  playlistViewText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  playlistDoneButton: { height: 55, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  playlistDoneText: { color: '#2B5FC0', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  infoDuration: { color: palette.muted, fontSize: 12.5, marginBottom: 24 },
  infoHeading: { color: palette.ink, fontSize: 15, fontWeight: '900', marginBottom: 7 },
  infoBody: { color: palette.muted, fontSize: 13.5, lineHeight: 20 },
  infoStation: { marginTop: 26, marginBottom: 5 },
  visitChannel: { color: palette.blue, fontSize: 14, fontWeight: '800' },
  outlineDone: { minHeight: 56, borderRadius: 28, borderWidth: 1, borderColor: palette.muted, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  outlineDoneText: { color: palette.blue, fontSize: 15, fontWeight: '900' },
  copyLinkButton: { minHeight: 56, borderRadius: 28, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  shareUrl: { color: '#555555', fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 12 },
  copyLinkText: { color: palette.blue, fontSize: 15, fontWeight: '900' },
  copyNotice: { minHeight: 58, borderRadius: 12, backgroundColor: '#E7F2EC', marginTop: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copyNoticeText: { color: '#278065', fontSize: 14, fontWeight: '800' },
  primaryDone: { minHeight: 56, borderRadius: 28, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  primaryDoneText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  sheetSubtitle: { color: palette.muted, fontSize: 12, marginTop: -10, marginBottom: 14 },
  optionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  optionText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  newPlaylistRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  playlistInput: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
    color: palette.ink,
    paddingHorizontal: 13,
    fontSize: 13,
    fontWeight: '700',
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLoading: { minHeight: 94, alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetMuted: { color: palette.muted, fontSize: 12.5, lineHeight: 18, paddingVertical: 14 },
  playlistRow: {
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  playlistIcon: {
    width: 62,
    height: 58,
    borderRadius: 5,
    backgroundColor: palette.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  playlistCopy: { flex: 1, minWidth: 0 },
  playlistName: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 15 },
  playlistMeta: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
});
