import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BookOpenText,
  Headphones,
  MessageCircleMore,
  Mic2,
  Music2,
  Newspaper,
  Radio,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ListenerEmptyState,
  ListenerListRow,
  ListenerSearchInput,
  ListenerSectionHeader,
  ListenerTopBar,
} from '@/src/components/ListenerV2';
import {
  EchooAudio,
  EchooBroadcast,
  EchooStation,
  searchEchoo,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const categorySuggestions = [
  { label: 'Music', query: 'Music', icon: Music2 },
  { label: 'Talk shows', query: 'Talk', icon: MessageCircleMore },
  { label: 'Worship', query: 'Worship', icon: BookOpenText },
  { label: 'Podcasts', query: 'Podcast', icon: Mic2 },
  { label: 'News', query: 'News', icon: Newspaper },
  { label: 'Live now', query: 'Live', icon: Radio },
];

const categoryRows = Array.from(
  { length: Math.ceil(categorySuggestions.length / 2) },
  (_, index) => categorySuggestions.slice(index * 2, index * 2 + 2)
);

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [query, setQuery] = useState(() => String(params.q || ''));
  const [audio, setAudio] = useState<EchooAudio[]>([]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [live, setLive] = useState<Awaited<ReturnType<typeof searchEchoo>>['live']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (params.q !== undefined) setQuery(String(params.q));
  }, [params.q]);

  useEffect(() => {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      setAudio([]);
      setStations([]);
      setLive([]);
      setError('');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      searchEchoo(cleanQuery)
        .then((results) => {
          if (!active) return;
          setAudio(results.audio);
          setStations(results.stations);
          setLive(results.live);
          setError('');
        })
        .catch((searchError) => {
          if (!active) return;
          setAudio([]);
          setStations([]);
          setLive([]);
          setError(searchError?.message || 'Search is unavailable right now.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const openAudio = (track: EchooAudio) => {
    router.push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: track.subtitle || track.artistName || track.genre || 'Echoo Audio',
        coverArt: track.coverArt || '',
        fileUrl: track.fileUrl || '',
        genre: track.genre || '',
      },
    });
  };

  const openStation = (station: EchooStation) => {
    router.push({ pathname: '/station', params: { stationId: station.id } });
  };

  const hasResults = audio.length + stations.length + live.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ListenerTopBar />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>Search</Text>

        <ListenerSearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Artists, stations, shows or audio"
          autoFocus={false}
        />

        {!query.trim() ? (
          <>
            <ListenerSectionHeader title="Browse all" />
            <View style={styles.categoryGrid}>
              {categoryRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.categoryRow}>
                  {row.map(({ label, query: categoryQuery, icon: Icon }) => (
                    <Pressable
                      key={label}
                      style={({ pressed }) => [
                        styles.categoryTile,
                        pressed && styles.categoryTilePressed,
                      ]}
                      onPress={() => setQuery(categoryQuery)}
                    >
                      <Icon color={palette.muted} size={21} strokeWidth={2} />
                      <Text style={styles.categoryTitle} numberOfLines={1}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Searching Echoo...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <ListenerEmptyState
            title="Search is temporarily unavailable"
            subtitle={error}
            icon={<Radio color={palette.blue} size={24} />}
          />
        ) : null}

        {!loading && query.trim() && !error && !hasResults ? (
          <ListenerEmptyState
            title="No results found"
            subtitle={`Nothing public matched "${query.trim()}". Try another title, creator, or station.`}
          />
        ) : null}

        {live.length ? (
          <>
            <ListenerSectionHeader title="Live now" action="View all" onAction={() => router.push('/live')} />
            {live.map((item: EchooBroadcast) => (
              <ListenerListRow
                key={item.id}
                title={item.title}
                subtitle={item.stationName || 'Echoo Station'}
                meta={`${item.listenerCount || 0} live`}
                image={item.coverArt}
                fallback={<Headphones color={palette.red} size={21} />}
                onPress={() => router.push('/live')}
              />
            ))}
          </>
        ) : null}

        {audio.length ? (
          <>
            <ListenerSectionHeader title="Audio" />
            {audio.map((track) => (
              <ListenerListRow
                key={track.id}
                title={track.title}
                subtitle={track.subtitle || track.artistName || track.genre || 'Echoo Audio'}
                meta={track.genre || 'Audio'}
                image={track.coverArt}
                fallback={<Music2 color={palette.blue} size={21} />}
                onPress={() => openAudio(track)}
              />
            ))}
          </>
        ) : null}

        {stations.length ? (
          <>
            <ListenerSectionHeader title="Stations" />
            {stations.map((station) => (
              <ListenerListRow
                key={station.id}
                title={station.name}
                subtitle={station.category || 'Echoo Station'}
                meta={`${station.followerCount || 0} followers`}
                image={station.coverArt}
                fallback={<Radio color={palette.blue} size={21} />}
                onPress={() => openStation(station)}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 150 },
  pageTitle: {
    color: palette.ink,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    marginTop: 18,
    marginBottom: 18,
  },
  categoryGrid: { gap: 10 },
  categoryRow: { flexDirection: 'row', gap: 10 },
  categoryTile: {
    flex: 1,
    minWidth: 0,
    height: 78,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    justifyContent: 'center',
    gap: 10,
  },
  categoryTilePressed: { opacity: 0.58 },
  categoryTitle: {
    color: palette.ink,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '800',
  },
  loadingRow: {
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
});
