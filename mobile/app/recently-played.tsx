import { Image } from 'expo-image';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { ChevronLeft, Play } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerAuthCard, ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooAudio, EchooHistoryItem, getListeningHistory, hasEchooSession } from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function RecentlyPlayedScreen() {
  const { router, push } = useGuardedRouter();
  const playback = usePlayback();
  const palette = getEchooColors(useColorScheme());
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [history, setHistory] = useState<EchooHistoryItem[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const session = await hasEchooSession();
      setSignedIn(session);
      setHistory(session ? await getListeningHistory({ force }) : []);
      setError('');
    } catch (loadError: any) {
      setError(friendlyErrorMessage(loadError, 'Could not load your listening history.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tracks = history.map((item) => item.track).filter((track): track is EchooAudio => Boolean(track?.id)).filter((track, index, rows) => rows.findIndex((item) => item.id === track.id) === index);
  const queue = useMemo<AudioPlaybackItem[]>(() => tracks.map((track) => ({
    kind: 'audio', id: track.id, title: track.title,
    subtitle: track.subtitle || track.artistName || track.stationName || 'Echoo Audio',
    coverArt: track.coverArt || '', fileUrl: track.fileUrl || '', genre: track.genre || '',
    stationId: track.stationId || '', stationName: track.stationName || track.artistName || '',
    collectionId: track.collectionId || '', collectionName: track.collectionName || '',
  })), [tracks]);

  const playTrack = async (track: EchooAudio) => {
    const index = queue.findIndex((item) => item.id === track.id);
    await playback.playAudioQueue(queue, Math.max(0, index));
    push({ pathname: '/audio-player', params: { audioId: track.id, title: track.title, subtitle: track.subtitle || track.artistName || track.stationName || 'Echoo Audio', coverArt: track.coverArt || '', fileUrl: track.fileUrl || '' } });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.blue} colors={[palette.blue]} />}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back"><ChevronLeft color="#050505" size={24} strokeWidth={2.4} /></Pressable>
          <Text style={styles.title}>Recently Played</Text>
        </View>
        <Text style={styles.subtitle}>Return to the audio and collections you’ve been listening to.</Text>

        {loading ? <ListenerSkeletonRows count={7} /> : null}
        {!loading && error ? <ListenerToast message={error} /> : null}
        {!loading && !signedIn ? <ListenerAuthCard title="Sign in to keep your history" subtitle="Your listening history is private to your Echoo account." onPress={() => push('/auth')} /> : null}
        {!loading && signedIn && !tracks.length ? <ListenerEmptyState title="Nothing played yet" subtitle="Audio you play will appear here." /> : null}
        {!loading && tracks.map((track) => (
          <Pressable key={track.id} style={styles.row} onPress={() => void playTrack(track)}>
            <View style={styles.artwork}>
              {track.coverArt ? <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
            </View>
            <View style={styles.copy}>
              <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.trackSubtitle} numberOfLines={1}>{track.stationName || track.subtitle || track.artistName || 'Echoo Audio'}{history.some((item) => item.track?.id === track.id && (item.progress || 0) > 0 && !item.completed) ? ' · Resume' : ''}</Text>
            </View>
            <View style={styles.playButton}><Play color="#FFFFFF" fill="#FFFFFF" size={13} /></View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FBFF' },
  content: { paddingHorizontal: 24, paddingTop: 15, paddingBottom: 140 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backButton: { width: 28, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  title: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.6 },
  subtitle: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 18, marginTop: 8, marginBottom: 24 },
  row: { height: 70, flexDirection: 'row', alignItems: 'center', gap: 12 },
  artwork: { width: 62, height: 58, borderRadius: 5, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  copy: { flex: 1, minWidth: 0 },
  trackTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  trackSubtitle: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  playButton: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2B5FC0', alignItems: 'center', justifyContent: 'center' },
});
