import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { ChevronRight, Mic } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListenerAuthCard, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooAudio, EchooHistoryItem, getCachedListeningHistorySnapshot, getListeningHistory, hasEchooSession } from '@/src/services/echooApi';

const BLUE = '#2B5FC0';
function uniqueTracks(history: EchooHistoryItem[]) {
  const seen = new Set<string>();
  return history.flatMap(({ track }) => {
    if (!track?.id || seen.has(track.id)) return [];
    seen.add(track.id); return [track];
  });
}
function playbackItem(track: EchooAudio): AudioPlaybackItem {
  return { kind: 'audio', id: track.id, title: track.title, subtitle: track.stationName || track.subtitle || track.artistName || 'Echoo Audio', coverArt: track.coverArt || '', fileUrl: track.fileUrl || '', genre: track.genre || '', stationId: track.stationId || '', stationName: track.stationName || '', collectionId: track.collectionId || '', collectionName: track.collectionName || '' };
}
export default function LibraryScreen() {
  const { push } = useGuardedRouter();
  const playback = usePlayback();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(151, Math.max(132, (width - 64) / 2));
  const [history, setHistory] = useState<EchooHistoryItem[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const session = await hasEchooSession();
      setSignedIn(session);
      setHistory(session ? await getListeningHistory({ force }) : []);
      setError('');
    } catch (cause) { setError(friendlyErrorMessage(cause, 'Could not load your listening history.')); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const session = await hasEchooSession();
      if (!active) return;
      setSignedIn(session);
      if (session) {
        const cached = await getCachedListeningHistorySnapshot().catch(() => []);
        if (active && cached.length) { setHistory(cached); setLoading(false); }
      }
      if (active) void load();
    })();
    return () => { active = false; };
  }, [load]));
  const tracks = useMemo(() => uniqueTracks(history), [history]);
  const queue = useMemo(() => tracks.map(playbackItem), [tracks]);
  const openTrack = async (track: EchooAudio) => {
    await playback.playAudioQueue(queue, Math.max(0, queue.findIndex((item) => item.id === track.id)));
    push({ pathname: '/audio-player', params: { audioId: track.id, title: track.title, subtitle: track.stationName || track.subtitle || track.artistName || '', coverArt: track.coverArt || '', fileUrl: track.fileUrl || '' } });
  };
  const openSection = (section: string) => push({ pathname: '/library-section', params: { section } } as never);
  const rail = (title: string, items: EchooAudio[]) => <View style={styles.railSection}>
    <View style={styles.railHeader}><Text style={styles.railTitle}>{title}</Text><Pressable onPress={() => push(title === 'Listening History' ? '/listening-history' : '/recently-played')} accessibilityRole="button" accessibilityLabel={`See all ${title}`}><Text style={styles.seeAll}>See All</Text></Pressable></View>
    {items.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{items.map((track) => <Pressable key={track.id} style={{ width: cardWidth }} onPress={() => void openTrack(track)} accessibilityRole="button" accessibilityLabel={`Play ${track.title}`}>
      <View style={[styles.artwork, { width: cardWidth, height: cardWidth }]}>{track.coverArt ? <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}</View>
      <Text style={styles.cardTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.cardSubtitle} numberOfLines={1}>{track.stationName || track.artistName || 'Echoo Audio'}</Text>
    </Pressable>)}</ScrollView> : <Text style={styles.emptyRail}>Your listening will appear here.</Text>}
  </View>;
  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={BLUE} colors={[BLUE]} />}>
    <Pressable style={styles.search} onPress={() => push('/search')} accessibilityRole="search" accessibilityLabel="Search channels and audio"><Text style={styles.searchText}>Channels, title, artist, shows</Text><Mic color="#050505" size={25} strokeWidth={2.5} /></Pressable>
    <Text style={styles.heading}>Library</Text>
    <View style={styles.links}>{([['Liked Tracks', 'liked'], ['Downloads', 'downloads'], ['Following', 'following'], ['Playlist', 'playlists']] as const).map(([label, section]) => <Pressable key={section} style={styles.link} onPress={() => openSection(section)} accessibilityRole="button"><Text style={styles.linkText}>{label}</Text><ChevronRight color="#050505" size={24} strokeWidth={2.4} /></Pressable>)}</View>
    {error ? <ListenerToast message={error} /> : null}
    {loading ? <View style={{ marginHorizontal: 24 }}><ListenerSkeletonRows count={3} /></View> : null}
    {!loading && !signedIn ? <ListenerAuthCard title="Keep your listening together" subtitle="Sign in to see your liked tracks, playlists, and history." onPress={() => push('/auth')} /> : null}
    {!loading && signedIn ? <>{rail('Recently Played', tracks.slice(0, 8))}{rail('Listening History', tracks.slice(0, 12))}</> : null}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FBFF' }, content: { paddingTop: 22, paddingBottom: 150 },
  search: { height: 48, borderRadius: 25, backgroundColor: '#F2F3F5', marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 31 },
  searchText: { color: '#848484', fontFamily: 'DMSans_400Regular', fontSize: 16, flexShrink: 1 },
  heading: { marginTop: 16, marginHorizontal: 24, color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.5 },
  links: { marginTop: 20, marginHorizontal: 24 }, link: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, linkText: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  railSection: { marginTop: 29 }, railHeader: { marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, railTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.5 }, seeAll: { color: BLUE, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  rail: { paddingHorizontal: 24, gap: 16 }, artwork: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#E7EAF0' }, cardTitle: { marginTop: 8, color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 }, cardSubtitle: { marginTop: 1, color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13 }, emptyRail: { marginHorizontal: 24, color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13 },
});
