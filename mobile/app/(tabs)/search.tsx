import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, Mic, Play, X } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerEmptyState, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { BrowseSkeleton } from '@/src/components/DiscoverySkeletons';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import {
  EchooAudio, EchooBroadcast, EchooHistoryItem, EchooPlaylist, EchooStation,
  getCachedListeningHistorySnapshot, getCachedMobileDiscoverySnapshot, getListeningHistory,
  getMobileDiscovery, getPublicCollections, hasEchooSession, searchEchoo,
} from '@/src/services/echooApi';

type Category = 'All' | 'Live now' | 'Channels' | 'Audio' | 'Podcast' | 'Series';
type BrowseItem =
  | { kind: 'audio'; id: string; title: string; subtitle: string; artwork?: string | null; audio: EchooAudio }
  | { kind: 'live'; id: string; title: string; subtitle: string; artwork?: string | null; live: EchooBroadcast }
  | { kind: 'station'; id: string; title: string; subtitle: string; artwork?: string | null; station: EchooStation }
  | { kind: 'series'; id: string; title: string; subtitle: string; artwork?: string | null; series: EchooPlaylist };

const CATEGORIES: Category[] = ['All', 'Live now', 'Channels', 'Audio', 'Podcast', 'Series'];
const BG = '#F9FBFF';
const BLUE = '#2B5FC0';
const RECENT_SEARCHES_KEY = 'echoo:recent-searches:v1';
type RecentSearch = { id: string; kind: BrowseItem['kind']; title: string; subtitle: string; artwork?: string | null };

function toPlaybackItem(track: EchooAudio): AudioPlaybackItem {
  return {
    kind: 'audio', id: track.id, title: track.title,
    subtitle: track.subtitle || track.artistName || track.stationName || 'Echoo Audio',
    coverArt: track.coverArt || '', fileUrl: track.fileUrl || '', genre: track.genre || '',
    stationId: track.stationId || '', stationName: track.stationName || track.artistName || '',
    collectionId: track.collectionId || '', collectionName: track.collectionName || '',
  };
}

export default function SearchScreen() {
  const { push } = useGuardedRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const playback = usePlayback();
  const inputRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(151, Math.max(132, (width - 64) / 2));
  const [query, setQuery] = useState(String(params.q || ''));
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [category, setCategory] = useState<Category>('All');
  const [browse, setBrowse] = useState<Awaited<ReturnType<typeof getMobileDiscovery>> | null>(null);
  const [series, setSeries] = useState<EchooPlaylist[]>([]);
  const [history, setHistory] = useState<EchooHistoryItem[]>([]);
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchEchoo>>>({ audio: [], stations: [], live: [] });
  const [loadingBrowse, setLoadingBrowse] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');

  useEffect(() => { if (params.q !== undefined) setQuery(String(params.q)); }, [params.q]);
  useEffect(() => {
    void SecureStore.getItemAsync(RECENT_SEARCHES_KEY).then((saved) => {
      const rows = saved ? JSON.parse(saved) : [];
      if (Array.isArray(rows)) setRecentSearches(rows.slice(0, 5));
    }).catch(() => undefined);
  }, []);

  const rememberSearch = (item: BrowseItem) => {
    const entry: RecentSearch = { id: item.id, kind: item.kind, title: item.title, subtitle: item.subtitle, artwork: item.artwork };
    const next = [entry, ...recentSearches.filter((row) => row.id !== item.id || row.kind !== item.kind)].slice(0, 5);
    setRecentSearches(next);
    void SecureStore.setItemAsync(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  const removeRecentSearch = (id: string, kind: BrowseItem['kind']) => {
    const next = recentSearches.filter((row) => row.id !== id || row.kind !== kind);
    setRecentSearches(next);
    void SecureStore.setItemAsync(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  const loadBrowse = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoadingBrowse(true);
    try {
      if (!force) {
        const cached = await getCachedMobileDiscoverySnapshot();
        if (cached) { setBrowse(cached); setLoadingBrowse(false); }
        const cachedHistory = await getCachedListeningHistorySnapshot().catch(() => []);
        if (cachedHistory.length) setHistory(cachedHistory);
      }
      const [discovery, publicSeries, session] = await Promise.all([
        getMobileDiscovery({ force }), getPublicCollections({ force }).catch(() => []), hasEchooSession(),
      ]);
      setBrowse(discovery);
      setSeries(publicSeries);
      setHistory(session ? await getListeningHistory({ force }).catch(() => []) : []);
      setError('');
    } catch (loadError: any) {
      setError(friendlyErrorMessage(loadError, 'Could not load Browse right now.'));
    } finally {
      setLoadingBrowse(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadBrowse(); }, [loadBrowse]));

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults({ audio: [], stations: [], live: [] });
      setSearchError('');
      setLoadingSearch(false);
      return;
    }
    let active = true;
    setLoadingSearch(true);
    const timer = setTimeout(() => {
      searchEchoo(value).then((next) => {
        if (active) { setResults(next); setSearchError(''); }
      }).catch((failure) => {
        if (active) setSearchError(friendlyErrorMessage(failure, 'Search is unavailable right now.'));
      }).finally(() => { if (active) setLoadingSearch(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  const openAudio = async (track: EchooAudio, source: EchooAudio[]) => {
    await playback.playAudioQueue(source.map(toPlaybackItem), Math.max(0, source.findIndex((item) => item.id === track.id)));
    push({ pathname: '/audio-player', params: {
      audioId: track.id, title: track.title, subtitle: track.subtitle || track.artistName || track.stationName || 'Echoo Audio',
      coverArt: track.coverArt || '', fileUrl: track.fileUrl || '', stationId: track.stationId || '',
      stationName: track.stationName || '', collectionId: track.collectionId || '',
    } });
  };

  const openItem = (item: BrowseItem, source: EchooAudio[]) => {
    rememberSearch(item);
    Keyboard.dismiss();
    if (item.kind === 'audio') { void openAudio(item.audio, source); return; }
    if (item.kind === 'station') { push({ pathname: '/station', params: { stationId: item.station.id } }); return; }
    if (item.kind === 'series') { push({ pathname: '/collection', params: { collectionId: item.series.id } }); return; }
    push({ pathname: '/live-room', params: {
      broadcastId: item.live.id, title: item.live.title,
      stationName: item.live.stationName || 'Echoo Station', coverArt: item.live.coverArt || '',
      stationId: item.live.stationId || '',
    } });
  };

  const searching = Boolean(query.trim());
  const audio: EchooAudio[] = searching ? results.audio : browse?.audio || [];
  const stations: EchooStation[] = searching ? results.stations : browse?.stations || [];
  const live: EchooBroadcast[] = searching ? results.live : browse?.live || [];
  const filteredAudio = category === 'Podcast' ? audio.filter((item) => /podcast/i.test(`${item.genre || ''} ${item.title || ''}`)) : audio;
  const browseItems: BrowseItem[] = (() => {
    const audioCards: BrowseItem[] = filteredAudio.map((item) => ({ kind: 'audio', id: item.id, title: item.title, subtitle: item.stationName || item.artistName || 'Echoo Audio', artwork: item.coverArt, audio: item }));
    const liveCards: BrowseItem[] = live.map((item) => ({ kind: 'live', id: item.id, title: item.title, subtitle: item.stationName || 'Live now', artwork: item.coverArt, live: item }));
    const stationCards: BrowseItem[] = stations.map((item) => ({ kind: 'station', id: item.id, title: item.name, subtitle: 'Channel', artwork: item.coverArt, station: item }));
    const seriesCards: BrowseItem[] = series.filter((item) => !searching || item.name.toLowerCase().includes(query.trim().toLowerCase())).map((item) => ({ kind: 'series', id: item.id, title: item.name, subtitle: item.stationName || 'Collection', artwork: item.coverArt, series: item }));
    if (category === 'Live now') return liveCards;
    if (category === 'Channels') return stationCards;
    if (category === 'Audio' || category === 'Podcast') return audioCards;
    if (category === 'Series') return seriesCards;
    return [...audioCards, ...liveCards, ...stationCards, ...seriesCards];
  })().filter((item, index, items) => items.findIndex((candidate) => candidate.kind === item.kind && candidate.id === item.id) === index);
  const recentTracks = history.map((entry) => entry.track).filter((track): track is EchooAudio => Boolean(track?.id)).filter((track, index, tracks) => tracks.findIndex((candidate) => candidate.id === track.id) === index);
  const suggestedAudio: EchooAudio[] = browse?.audio || [];

  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadBrowse(true)} tintColor={BLUE} colors={[BLUE]} />}
    >
      <View style={styles.searchRow}>
        {focused || searching ? <Pressable onPress={() => { Keyboard.dismiss(); setFocused(false); setQuery(''); }} style={styles.backButton} accessibilityLabel="Leave search"><ChevronLeft color="#050505" size={26} /></Pressable> : null}
      <View style={[styles.searchField, (focused || searching) && styles.searchFieldFocused]}>
        <TextInput ref={inputRef} value={query} onChangeText={setQuery} placeholder="Channels, title, artist, shows"
          placeholderTextColor="#858585" style={styles.searchInput} returnKeyType="search"
          accessibilityLabel="Search channels, titles, artists and shows" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
        {query ? <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search"><X color="#050505" size={22} /></Pressable> :
          <Pressable onPress={() => { inputRef.current?.focus(); Alert.alert('Voice search', 'Voice search is not available yet. Type your search above.'); }} accessibilityLabel="Voice search"><Mic color="#050505" size={25} strokeWidth={2.3} /></Pressable>}
      </View>
      </View>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{searching || focused ? 'Recent Search' : 'Browse'}</Text>
        {(focused || searching) && recentSearches.length ? <Pressable onPress={() => { setRecentSearches([]); void SecureStore.deleteItemAsync(RECENT_SEARCHES_KEY).catch(() => undefined); }}><Text style={styles.clearAll}>Clear all</Text></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categories}>
        {CATEGORIES.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={styles.categoryButton} accessibilityRole="tab" accessibilityState={{ selected: category === item }}>
          <Text style={[styles.categoryText, category === item && styles.categoryActive]}>{item}</Text>
        </Pressable>)}
      </ScrollView>
      {(searching && loadingSearch || !searching && loadingBrowse && !browse) ? <View style={{ marginHorizontal: 24 }}><BrowseSkeleton /></View> : null}
      {searching && searchError ? <ListenerToast message={searchError} /> : null}
      {!searching && error ? <ListenerToast message={error} /> : null}
      {searching && !loadingSearch && !searchError ? <View style={styles.resultSections}>
        {(['station', 'series', 'live', 'audio'] as const).map((kind) => {
          const section = browseItems.filter((item) => item.kind === kind);
          if (!section.length) return null;
          return <View key={kind} style={styles.resultSection}>
            <Text style={styles.resultHeading}>{kind === 'station' ? 'Channel' : kind === 'series' ? 'Series' : kind === 'live' ? 'Live now' : 'Audio'}</Text>
            {section.map((item) => <Pressable key={item.id} style={styles.resultRow} onPress={() => openItem(item, audio)}>
              <View style={styles.resultArtwork}>{item.artwork ? <Image source={{ uri: item.artwork }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}</View>
              <View style={styles.resultCopy}><Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.resultSubtitle} numberOfLines={1}>{item.kind === 'station' ? '@' + (item.station.owner?.username || item.station.name) : item.kind === 'series' ? `${item.subtitle} · ${item.series.trackCount || item.series.tracks.length} episodes` : item.subtitle}</Text></View>
              {item.kind === 'audio' ? <View style={styles.playButton}><Play color="#FFFFFF" fill="#FFFFFF" size={12} /></View> : <ChevronRight color="#050505" size={25} />}
            </Pressable>)}
          </View>;
        })}
      </View> : null}
      {!searching && focused && recentSearches.length ? <View style={styles.recentSearchList}>
        {recentSearches.map((entry) => <View key={`${entry.kind}:${entry.id}`} style={styles.recentSearchRow}>
          <Pressable style={styles.recentSearchOpen} onPress={() => setQuery(entry.title)}>
            <View style={styles.recentSearchArt}>{entry.artwork ? <Image source={{ uri: entry.artwork }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}</View>
            <View style={styles.resultCopy}><Text style={styles.resultTitle} numberOfLines={1}>{entry.title}</Text><Text style={styles.resultSubtitle} numberOfLines={1}>{entry.subtitle}</Text></View>
          </Pressable>
          <Pressable onPress={() => removeRecentSearch(entry.id, entry.kind)} accessibilityLabel={`Remove ${entry.title} from recent searches`}><X color="#050505" size={23} /></Pressable>
        </View>)}
      </View> : null}
      {!searching && focused ? <Text style={styles.suggestionHeading}>Suggestion</Text> : null}
      {!searching && browseItems.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railContent}>
        {browseItems.slice(0, 20).map((item) => <BrowseCard key={`${item.kind}:${item.id}`} item={item} width={cardWidth} onPress={() => openItem(item, audio)} />)}
      </ScrollView> : !searching && !loadingBrowse ? <ListenerEmptyState title="Nothing to browse yet" subtitle="New audio and channels will appear here." /> : null}
      {searching && !loadingSearch && !searchError && !browseItems.length ? <View style={styles.noResults}>
        <Text style={styles.noResultsTitle}>No results found</Text>
        <Text style={styles.noResultsCopy}>Try a different title or channel name, or check spelling</Text>
        <Text style={styles.browseNewHeading}>Browse something new</Text>
        {suggestedAudio.filter((item) => item.id).slice(0, 2).map((track) => <Pressable key={track.id} style={styles.resultRow} onPress={() => void openAudio(track, suggestedAudio)}>
          <View style={styles.resultArtwork}>{track.coverArt ? <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}</View>
          <View style={styles.resultCopy}><Text style={styles.resultTitle} numberOfLines={1}>{track.title}</Text><Text style={styles.resultSubtitle} numberOfLines={1}>{track.stationName || track.artistName || 'Echoo Audio'}</Text></View>
          <View style={styles.playButton}><Play color="#FFFFFF" fill="#FFFFFF" size={12} /></View>
        </Pressable>)}
      </View> : null}
      {!searching ? <>
        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>Recently Played</Text>
          <Pressable onPress={() => push('/recently-played')}><Text style={styles.seeAll}>See All</Text></Pressable>
        </View>
        {recentTracks.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railContent}>
          {recentTracks.slice(0, 10).map((track) => <BrowseCard key={track.id} width={cardWidth} stacked item={{ kind: 'audio', id: track.id, title: track.title, subtitle: track.stationName || track.artistName || 'Echoo Audio', artwork: track.coverArt, audio: track }} onPress={() => void openAudio(track, recentTracks)} />)}
        </ScrollView> : !loadingBrowse ? <Text style={styles.emptyRecent}>Audio you play will appear here.</Text> : null}
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function BrowseCard({ item, width, stacked, onPress }: { item: BrowseItem; width: number; stacked?: boolean; onPress: () => void }) {
  return <Pressable style={[styles.card, { width }]} onPress={onPress}>
    <View style={[styles.artworkFrame, { width, height: width }, stacked && styles.stackedFrame]}>
      {stacked ? <View style={styles.artworkBack} /> : null}
      <View style={styles.artwork}>
        {item.artwork ? <Image source={{ uri: item.artwork }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> :
          <View style={styles.artworkFallback}><Text style={styles.artworkInitial}>{item.title.charAt(0).toUpperCase()}</Text></View>}
      </View>
    </View>
    <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
    <Text style={styles.cardSubtitle} numberOfLines={1}>{item.subtitle}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  content: { paddingTop: 18, paddingBottom: 145 },
  searchRow: { marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  backButton: { width: 28, height: 48, alignItems: 'center', justifyContent: 'center' },
  searchField: { flex: 1, height: 48, borderRadius: 26, backgroundColor: '#F2F3F5', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 30 },
  searchFieldFocused: { backgroundColor: '#DCE7FA', borderWidth: 1, borderColor: BLUE },
  searchInput: { flex: 1, minWidth: 0, height: '100%', color: '#050505', fontFamily: 'DMSans_400Regular', fontSize: 16, padding: 0 },
  headingRow: { marginHorizontal: 24, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  heading: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.7 },
  clearAll: { color: BLUE, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  categoryScroll: { marginTop: 10, flexGrow: 0 },
  categories: { paddingHorizontal: 24, alignItems: 'center', gap: 22 },
  categoryButton: { paddingVertical: 3 },
  categoryText: { color: '#999999', fontFamily: 'DMSans_700Bold', fontSize: 14 },
  categoryActive: { color: BLUE },
  rail: { marginTop: 27, flexGrow: 0 },
  railContent: { paddingHorizontal: 24, gap: 18, paddingRight: 30 },
  card: { flexShrink: 0 },
  artworkFrame: { position: 'relative' },
  stackedFrame: { marginBottom: 5 },
  artworkBack: { position: 'absolute', left: 8, right: -8, top: 7, bottom: -7, borderRadius: 21, backgroundColor: '#657892' },
  artwork: { width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: '#E1E8F2' },
  artworkFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  artworkInitial: { color: BLUE, fontFamily: 'DMSans_700Bold', fontSize: 48 },
  cardTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16, marginTop: 12, letterSpacing: -0.35 },
  cardSubtitle: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 2 },
  recentHeader: { marginTop: 56, marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.7 },
  seeAll: { color: BLUE, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  emptyRecent: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginHorizontal: 24, marginTop: 16 },
  noResults: { marginHorizontal: 24, minHeight: 530, paddingTop: 125 },
  noResultsTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, textAlign: 'center' },
  noResultsCopy: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 19, textAlign: 'center', marginTop: 7, maxWidth: 285, alignSelf: 'center' },
  browseNewHeading: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 20, marginTop: 180, marginBottom: 13 },
  recentSearchList: { marginHorizontal: 24, marginTop: 16, gap: 15 },
  recentSearchRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 14 },
  recentSearchOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentSearchArt: { width: 66, height: 58, borderRadius: 5, overflow: 'hidden', backgroundColor: '#E1E8F2' },
  suggestionHeading: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, marginHorizontal: 24, marginTop: 22 },
  resultSections: { marginHorizontal: 24, marginTop: 12, gap: 22 },
  resultSection: { gap: 12 },
  resultHeading: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 20, marginBottom: 2 },
  resultRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultArtwork: { width: 62, height: 58, borderRadius: 5, overflow: 'hidden', backgroundColor: '#E1E8F2' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  resultSubtitle: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  playButton: { width: 24, height: 24, borderRadius: 12, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
});
