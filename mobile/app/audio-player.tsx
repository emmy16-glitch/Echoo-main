import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import {
  ChevronDown,
  Check,
  Download,
  Heart,
  ListMusic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  EchooAudio,
  EchooPlaylist,
  addTrackToPlaylist,
  createPlaylist,
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
  const activeAudio = requestedAudio || currentAudio;
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
  const [actionError, setActionError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistBusyId, setPlaylistBusyId] = useState('');
  const [playlists, setPlaylists] = useState<EchooPlaylist[]>([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const error = actionError || playback.error;

  useEffect(() => {
    if (!requestedAudio) return;
    if (currentAudio?.id === requestedAudio.id) return;
    playAudio(requestedAudio);
  }, [currentAudio?.id, playAudio, requestedAudio]);

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
  const seekBy = (deltaMs: number) => playback.seekBy(deltaMs);
  const previousTrack = () => {
    if (hasQueue) playback.playPrevious();
    else seekBy(-15000);
  };
  const nextTrack = () => {
    if (upNext.length) playback.playNext();
    else seekBy(15000);
  };

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
    await Share.share({
      message: `${title} - ${subtitle} on Echoo`,
    });
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
      setPlaylistModalOpen(false);
      setActionError(`Added to ${playlist.name}.`);
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
      setPlaylistModalOpen(false);
      setActionError(`Added to ${playlist.name}.`);
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

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const progressPercent = `${Math.max(0, Math.min(100, progress * 100))}%` as const;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <LinearGradient
        colors={[palette.night2, palette.night, palette.background, palette.background]}
        locations={[0, 0.28, 0.62, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityLabel="Close player"
        >
          <ChevronDown color={palette.ink} size={26} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>NOW PLAYING</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{genre || 'Echoo'}</Text>
        </View>
        <Pressable style={styles.headerButton} accessibilityLabel="More options">
          <MoreHorizontal color={palette.ink} size={24} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
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
              <ActivityIndicator color={palette.ink} size="small" />
            ) : (
              <Heart
                color={saved ? palette.red : palette.ink}
                fill={saved ? palette.red : 'transparent'}
                size={25}
              />
            )}
          </Pressable>
        </View>

        <Pressable
          style={styles.progressTouch}
          onLayout={(event: LayoutChangeEvent) => setProgressWidth(event.nativeEvent.layout.width)}
          onPress={(event) => seekToFraction(event.nativeEvent.locationX / progressWidth)}
          accessibilityRole="adjustable"
          accessibilityLabel="Playback position"
        >
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: progressPercent }]} />
            <View style={[styles.progressThumb, { left: progressPercent }]} />
          </View>
        </Pressable>

        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>-{formatRemaining(duration, position)}</Text>
        </View>

        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={palette.ink} />
            <Text style={styles.statusText}>Loading audio...</Text>
          </View>
        ) : null}

        {error ? <ListenerToast message={error} tone={/saved|downloaded|removed|added|already/i.test(error) ? 'info' : 'error'} /> : null}

        <View style={styles.controls}>
          <Pressable
            style={[styles.secondaryControl, styles.controlDisabled]}
            disabled
            accessibilityLabel="Shuffle is unavailable for a single track"
          >
            <Shuffle color={palette.faint} size={21} />
          </Pressable>
          <Pressable
            style={styles.transportButton}
            onPress={previousTrack}
            disabled={!canControl}
            accessibilityLabel={hasQueue ? 'Previous track' : 'Back 15 seconds'}
          >
            <SkipBack color={palette.ink} fill={palette.ink} size={29} />
          </Pressable>
          <Pressable
            style={[styles.playButton, !canControl && styles.controlDisabled]}
            onPress={togglePlayback}
            disabled={!canControl}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause color={palette.background} fill={palette.background} size={31} />
            ) : (
              <Play color={palette.background} fill={palette.background} size={31} />
            )}
          </Pressable>
          <Pressable
            style={styles.transportButton}
            onPress={nextTrack}
            disabled={!canControl}
            accessibilityLabel={upNext.length ? 'Next track' : 'Forward 15 seconds'}
          >
            <SkipForward color={palette.ink} fill={palette.ink} size={29} />
          </Pressable>
          <Pressable
            style={styles.secondaryControl}
            onPress={() => playback.setRepeat(!repeatOn)}
            accessibilityLabel="Toggle repeat"
          >
            <Repeat2 color={repeatOn ? palette.red : palette.muted} size={21} />
            {repeatOn ? <View style={styles.activeDot} /> : null}
          </Pressable>
        </View>

        <View style={styles.footerActions}>
          <Pressable style={styles.footerAction} onPress={toggleSaved} disabled={saving}>
            <Heart
              color={saved ? palette.red : palette.muted}
              fill={saved ? palette.red : 'transparent'}
              size={20}
            />
            <Text style={[styles.footerLabel, saved ? styles.footerLabelActive : null]}>
              {saved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
          <Pressable style={styles.footerAction} onPress={downloadTrack} disabled={downloading || !currentTrack}>
            {downloading ? (
              <ActivityIndicator color={palette.blue} size="small" />
            ) : downloaded ? (
              <Check color={palette.blue} size={20} />
            ) : (
              <Download color={palette.muted} size={20} />
            )}
            <Text style={[styles.footerLabel, downloaded ? styles.footerLabelBlue : null]}>
              {downloading ? `${downloadProgress}%` : downloaded ? 'Downloaded' : 'Download'}
            </Text>
            {downloading ? (
              <View style={styles.footerProgressTrack}>
                <View style={[styles.footerProgressFill, { width: `${Math.max(1, Math.min(100, downloadProgress))}%` }]} />
              </View>
            ) : null}
          </Pressable>
          <Pressable style={styles.footerAction} onPress={openPlaylistPicker}>
            <ListMusic color={palette.muted} size={20} />
            <Text style={styles.footerLabel}>Playlist</Text>
          </Pressable>
          <Pressable style={styles.footerAction} onPress={shareTrack}>
            <Share2 color={palette.muted} size={20} />
            <Text style={styles.footerLabel}>Share</Text>
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
      </ScrollView>

      <Modal
        visible={playlistModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPlaylistModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPlaylistModalOpen(false)}>
          <Pressable style={styles.playlistSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to playlist</Text>
            <View style={styles.newPlaylistRow}>
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
            </View>

            {playlistLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator color={palette.blue} />
                <Text style={styles.sheetMuted}>Loading playlists...</Text>
              </View>
            ) : playlists.length ? (
              playlists.map((playlist) => (
                <Pressable key={playlist.id} style={styles.playlistRow} onPress={() => addToPlaylist(playlist)}>
                  <View style={styles.playlistIcon}>
                    <ListMusic color={palette.blue} size={19} />
                  </View>
                  <View style={styles.playlistCopy}>
                    <Text style={styles.playlistName} numberOfLines={1}>{playlist.name}</Text>
                    <Text style={styles.playlistMeta}>{playlist.trackCount || 0} tracks</Text>
                  </View>
                  {playlistBusyId === playlist.id ? <ActivityIndicator color={palette.blue} size="small" /> : null}
                </Pressable>
              ))
            ) : (
              <Text style={styles.sheetMuted}>Create your first playlist above.</Text>
            )}
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
  safeArea: { flex: 1, backgroundColor: palette.background },
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
  headerCopy: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerEyebrow: { color: palette.muted, fontSize: 9, fontWeight: '900' },
  headerTitle: { color: palette.ink, fontSize: 12, fontWeight: '800', marginTop: 2, maxWidth: 220 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 22 },
  artwork: {
    width: '100%',
    maxWidth: 430,
    aspectRatio: 1,
    borderRadius: 8,
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
  metaRow: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaCopy: { flex: 1, minWidth: 0 },
  title: { color: palette.ink, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 13, marginTop: 5 },
  linkText: { color: palette.blue, fontWeight: '900' },
  collectionContext: { color: palette.muted, fontSize: 11.5, marginTop: 4, fontWeight: '700' },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTouch: { height: 34, justifyContent: 'center', marginTop: 18 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.lineStrong,
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
    borderColor: palette.surfaceRaised,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  timeText: { color: palette.muted, fontSize: 10.5, fontWeight: '700' },
  statusRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  statusText: { color: palette.muted, fontSize: 11.5, fontWeight: '700' },
  errorText: { color: palette.red, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  controls: {
    height: 86,
    marginTop: 10,
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
    backgroundColor: palette.ink,
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
    backgroundColor: palette.red,
  },
  footerActions: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
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
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 16,
  },
  upNextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  upNextTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
  upNextCount: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  upNextRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 },
  upNextArt: { width: 44, height: 44, borderRadius: 7, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  upNextCopy: { flex: 1, minWidth: 0 },
  upNextTrack: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  upNextMeta: { color: palette.muted, fontSize: 11, marginTop: 2 },
  upNextEmpty: { color: palette.muted, fontSize: 12, paddingVertical: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'flex-end',
  },
  playlistSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.lineStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { color: palette.ink, fontSize: 18, fontWeight: '900', marginBottom: 14 },
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
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  playlistIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: palette.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistCopy: { flex: 1, minWidth: 0 },
  playlistName: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  playlistMeta: { color: palette.muted, fontSize: 11, marginTop: 3 },
});
