import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronDown,
  Heart,
  MoreHorizontal,
  Pause,
  Play,
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
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  EchooAudio,
  getSavedAudio,
  hasEchooSession,
  saveAudio,
  unsaveAudio,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function AudioPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    audioId?: string;
    title?: string;
    subtitle?: string;
    coverArt?: string;
    fileUrl?: string;
    genre?: string;
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
          }
        : null,
    [
      params.coverArt,
      params.genre,
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
  const coverArt = activeAudio?.coverArt || '';
  const genre = activeAudio?.genre || '';
  const canControl = currentAudio?.id === audioId;
  const loading = playback.isLoading;
  const playing = playback.isPlaying && canControl;
  const position = canControl ? playback.position : 0;
  const duration = canControl ? playback.duration : 0;
  const repeatOn = playback.repeat;

  const [progressWidth, setProgressWidth] = useState(1);
  const [actionError, setActionError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const error = actionError || playback.error;

  useEffect(() => {
    if (!requestedAudio || !requestedFileUrl) return;
    if (currentAudio?.id === requestedAudio.id) return;
    playAudio(requestedAudio);
  }, [currentAudio?.id, playAudio, requestedAudio, requestedFileUrl]);

  useEffect(() => {
    let active = true;
    setSaved(false);

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

    loadSavedState();

    return () => {
      active = false;
    };
  }, [audioId]);

  const togglePlayback = () => playback.toggle();
  const seekBy = (deltaMs: number) => playback.seekBy(deltaMs);

  const seekToFraction = async (fraction: number) => {
    if (!canControl || duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    await playback.seekTo(Math.round(duration * clamped));
  };

  const toggleSaved = async () => {
    if (!audioId) return;
    if (!signedIn) {
      router.push('/auth');
      return;
    }

    setSaving(true);
    try {
      if (saved) {
        await unsaveAudio(audioId);
        setSaved(false);
      } else {
        await saveAudio(audioId);
        setSaved(true);
      }
    } catch (saveError: any) {
      setActionError(saveError?.message || 'Could not update your library.');
    } finally {
      setSaving(false);
    }
  };

  const shareTrack = async () => {
    await Share.share({
      message: `${title} - ${subtitle} on Echoo`,
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
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
            onPress={() => seekBy(-15000)}
            disabled={!canControl}
            accessibilityLabel="Back 15 seconds"
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
            onPress={() => seekBy(15000)}
            disabled={!canControl}
            accessibilityLabel="Forward 15 seconds"
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
            <Text style={[styles.footerLabel, saved && styles.footerLabelActive]}>
              {saved ? 'Saved' : 'Save'}
            </Text>
          </Pressable>
          <Pressable style={styles.footerAction} onPress={shareTrack}>
            <Share2 color={palette.muted} size={20} />
            <Text style={styles.footerLabel}>Share</Text>
          </Pressable>
        </View>
      </ScrollView>
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
  title: { color: palette.ink, fontSize: 23, lineHeight: 28, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 13, marginTop: 5 },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTouch: { height: 30, justifyContent: 'center', marginTop: 18 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.ink },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    marginLeft: -6,
    borderRadius: 6,
    backgroundColor: palette.ink,
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
    justifyContent: 'center',
    gap: 44,
  },
  footerAction: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerLabel: { color: palette.muted, fontSize: 11, fontWeight: '800' },
  footerLabelActive: { color: palette.red },
});
