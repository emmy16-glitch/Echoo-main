import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BookOpen,
  ChevronDown,
  Clock3,
  ListMusic,
  MoreVertical,
  Music2,
  Play,
  Search,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioRowActions } from '@/src/components/AudioRowActions';
import { ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooAudio, EchooPlaylist, EchooPlaylistTrack, getPlaylistById, hasEchooSession, toggleSavedCollection } from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

function formatDuration(seconds = 0) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

export default function CollectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    collectionId?: string;
    stationId?: string;
    stationName?: string;
  }>();
  const collectionId = String(params.collectionId || '');
  const stationId = String(params.stationId || '');
  const stationName = String(params.stationName || '');
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const playback = usePlayback();
  // Collection details include account-specific saved state. Do not retain an
  // in-memory detail cache across sign-out or account switches.
  const [collection, setCollection] = useState<EchooPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (force = false, silent = false) => {
    if (!collectionId) {
      setError('Collection ID is missing.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (force) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError('');
    try {
      const nextCollection = await getPlaylistById(collectionId, { force });
      setCollection(nextCollection);
    } catch (loadError: any) {
      setError(friendlyErrorMessage(loadError, 'Could not load this collection.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [collectionId]);

  useEffect(() => {
    load(false);
  }, [load]);

  const openStation = () => {
    if (!stationId) return;
    router.push({ pathname: '/station', params: { stationId } });
  };

  const collectionQueue = useMemo<AudioPlaybackItem[]>(() => {
    if (!collection) return [];
    return collection.tracks.map((track) => ({
      kind: 'audio',
      id: track.id,
      title: track.title,
      subtitle: stationName || collection.owner?.displayName || 'Echoo Collection',
      coverArt: track.coverArt || collection.coverArt || '',
      fileUrl: track.fileUrl || '',
      genre: track.genre || '',
      stationId,
      stationName,
      collectionId: collection.id,
      collectionName: collection.name,
    }));
  }, [collection, stationId, stationName]);

  const openTrack = async (track: EchooPlaylistTrack) => {
    if (!collection) return;
    const startIndex = Math.max(0, collectionQueue.findIndex((item) => item.id === track.id));
    await playback.playAudioQueue(collectionQueue, startIndex);
    router.push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: stationName || collection.owner?.displayName || 'Echoo Collection',
        coverArt: track.coverArt || collection.coverArt || '',
        fileUrl: track.fileUrl || '',
        genre: track.genre || '',
        stationId,
        stationName,
        collectionId: collection.id,
        collectionName: collection.name,
      },
    });
  };

  const playFirst = () => {
    const firstTrack = collection?.tracks[0];
    if (firstTrack) void openTrack(firstTrack);
  };

  const toAudioTrack = (track: EchooPlaylistTrack): EchooAudio => ({
    id: track.id,
    title: track.title,
    subtitle: stationName || collection?.owner?.displayName || 'Echoo Collection',
    artistName: stationName || collection?.owner?.displayName || 'Echoo',
    stationId,
    stationName,
    coverArt: track.coverArt || collection?.coverArt || '',
    fileUrl: track.fileUrl || '',
    genre: track.genre || '',
    duration: track.duration || 0,
  });

  const isSeries = collection?.mode === 'series';
  const toggleSave = async () => {
    if (!isSeries || !collection || saving) return;
    if (!(await hasEchooSession())) {
      router.push('/auth');
      return;
    }
    const nextSaved = !collection.isSaved;
    setSaving(true);
    setSaveError('');
    try {
      await toggleSavedCollection(collection.id, nextSaved);
      const updated = { ...collection, isSaved: nextSaved };
      setCollection(updated);
    } catch (saveFailure: any) {
      setSaveError(friendlyErrorMessage(saveFailure, 'Could not update saved Collections.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={palette.blue}
            colors={[palette.blue]}
          />
        }
      >
        <View style={styles.nav}>
          <Pressable style={styles.iconButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <ChevronDown color={palette.ink} size={26} style={styles.backIcon} />
          </Pressable>
          <View style={styles.navActions}>
            <Pressable style={styles.iconButton} onPress={() => router.push('/search')} accessibilityLabel="Search">
              <Search color={palette.ink} size={23} />
            </Pressable>
            <Pressable style={styles.iconButton} accessibilityLabel="More options">
              <MoreVertical color={palette.ink} size={22} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <ListenerSkeletonRows count={6} />
        ) : null}

        {!loading && error ? (
          <>
            <ListenerToast message={error} />
            <ListenerEmptyState
              title="Collection unavailable"
              subtitle="Pull down to refresh or try again."
              action="Try again"
              onAction={() => load(true)}
              icon={<ListMusic color={palette.blue} size={25} />}
            />
          </>
        ) : null}

        {!loading && collection ? (
          <>
            <View style={styles.cover}>
              {collection.coverArt ? (
                <Image source={{ uri: collection.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <LinearGradient colors={[palette.blueDeep, palette.blue]} style={StyleSheet.absoluteFillObject} />
              )}
              <View style={styles.coverBadge}>
                {isSeries ? <BookOpen color="#FFFFFF" size={14} /> : <ListMusic color="#FFFFFF" size={14} />}
                <Text style={styles.coverBadgeText}>{isSeries ? 'Series' : 'Playlist'}</Text>
              </View>
            </View>

            <Text style={styles.title}>{collection.name}</Text>
            <Pressable disabled={!stationId} onPress={openStation}>
              <Text style={styles.stationLink}>{stationName || collection.owner?.displayName || 'Echoo Station'}</Text>
            </Pressable>
            <Text style={styles.meta}>{collection.trackCount ?? collection.tracks.length} items</Text>
            {isSeries ? <Pressable style={styles.saveCollection} disabled={saving} onPress={toggleSave} accessibilityRole="button" accessibilityLabel={collection.isSaved ? 'Remove saved Collection' : 'Save Collection'}><Text style={styles.saveCollectionText}>{saving ? 'Saving…' : collection.isSaved ? 'Saved Collection' : 'Save Collection'}</Text></Pressable> : null}
            {saveError ? <ListenerToast message={saveError} /> : null}
            {collection.description ? <Text style={styles.description}>{collection.description}</Text> : null}

            <Pressable
              style={[styles.playButton, !collection.tracks.length && styles.playButtonDisabled]}
              disabled={!collection.tracks.length}
              onPress={playFirst}
            >
              <Play color="#FFFFFF" fill="#FFFFFF" size={20} />
              <Text style={styles.playButtonText}>Play</Text>
            </Pressable>

            <View style={styles.trackList}>
              {collection.tracks.length ? (
                collection.tracks.map((track, index) => (
                  <Pressable
                    key={track.id}
                    style={styles.trackRow}
                    onPress={() => openTrack(track)}
                  >
                    <Text style={styles.trackIndex}>{String(index + 1).padStart(2, '0')}</Text>
                    <View style={styles.trackArt}>
                      {track.coverArt ? (
                        <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                      ) : (
                        <Music2 color={palette.blue} size={20} />
                      )}
                    </View>
                    <View style={styles.trackCopy}>
                      <Text style={styles.trackTitle} numberOfLines={2}>{track.title}</Text>
                      <View style={styles.trackMetaLine}>
                        <Clock3 color={palette.faint} size={12} />
                        <Text style={styles.trackMeta}>{formatDuration(track.duration)}</Text>
                      </View>
                    </View>
                    <Play color={palette.ink} fill={palette.ink} size={15} />
                    <AudioRowActions track={toAudioTrack(track)} />
                  </Pressable>
                ))
              ) : (
                <View style={styles.emptyRow}>
                  <ListMusic color={palette.blue} size={22} />
                  <Text style={styles.emptyText}>No public items in this collection yet.</Text>
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 96 },
  nav: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backIcon: { transform: [{ rotate: '90deg' }] },
  loadingState: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  cover: { height: 248, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.surfaceMuted, marginTop: 8 },
  coverBadge: { position: 'absolute', right: 12, bottom: 12, minHeight: 28, borderRadius: 5, backgroundColor: 'rgba(2,4,8,0.74)', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  coverBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  title: { color: palette.ink, fontSize: 27, lineHeight: 31, fontWeight: '900', letterSpacing: 0, marginTop: 17 },
  stationLink: { color: palette.blue, fontSize: 13, fontWeight: '900', marginTop: 5 },
  meta: { color: palette.muted, fontSize: 12, marginTop: 5 },
  description: { color: palette.ink2, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  saveCollection: { marginTop: 12, paddingHorizontal: 15, minHeight: 42, alignSelf: 'flex-start', borderColor: palette.blue, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  saveCollectionText: { color: palette.blue, fontSize: 13, fontWeight: '800' },
  playButton: { minHeight: 48, borderRadius: 24, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  playButtonDisabled: { opacity: 0.55 },
  playButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  trackList: { marginTop: 18, gap: 8 },
  trackRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 6 },
  trackIndex: { width: 24, color: palette.faint, fontSize: 11, fontWeight: '900' },
  trackArt: { width: 58, height: 58, borderRadius: 7, backgroundColor: palette.blueSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  trackCopy: { flex: 1, minWidth: 0 },
  trackTitle: { color: palette.ink, fontSize: 14, lineHeight: 18, fontWeight: '900' },
  trackMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  trackMeta: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  emptyRow: { minHeight: 74, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  emptyText: { color: palette.muted, fontSize: 12, lineHeight: 17, flex: 1 },
});
