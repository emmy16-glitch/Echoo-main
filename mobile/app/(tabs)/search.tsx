import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BookOpenText,
  Headphones,
  MessageCircleMore,
  Music2,
  Newspaper,
  Radio,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ListenerEmptyState,
  ListenerListRow,
  ListenerPageHeader,
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
  { label: 'Worship', icon: BookOpenText },
  { label: 'Talk', icon: MessageCircleMore },
  { label: 'Music', icon: Music2 },
  { label: 'News', icon: Newspaper },
];

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [query, setQuery] = useState(() => String(params.q || ''));
  const [audio, setAudio] = useState<EchooAudio[]>([]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [live, setLive] = useState<EchooBroadcast[]>([]);
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

  const hasResults = audio.length + stations.length + live.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ListenerTopBar />
        <ListenerPageHeader
          eyebrow="DISCOVER"
          title="Search Echoo"
          subtitle="Find live stations, creators, shows, podcasts and published audio."
        />

        <ListenerSearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search stations, shows, podcasts..."
          autoFocus={!params.q}
        />

        {!query.trim() ? (
          <>
            <ListenerSectionHeader title="Browse categories" />
            <View style={styles.categoryGrid}>
              {categorySuggestions.map(({ label, icon: Icon }) => (
                <Pressable
                  key={label}
                  style={styles.categoryCard}
                  onPress={() => setQuery(label)}
                >
                  <View style={styles.categoryIcon}>
                    <Icon color={palette.blue} size={22} />
                  </View>
                  <Text style={styles.categoryTitle}>{label}</Text>
                  <Text style={styles.categorySubtitle}>Explore {label.toLowerCase()} on Echoo</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.tipCard}>
              <Headphones color={palette.blue} size={22} />
              <View style={styles.tipCopy}>
                <Text style={styles.tipTitle}>Search stays real</Text>
                <Text style={styles.tipText}>
                  Echoo only shows published stations, live broadcasts and audio that actually exist.
                </Text>
              </View>
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
            subtitle={`Nothing public on Echoo matched “${query.trim()}”. Try another title, creator or station.`}
          />
        ) : null}

        {live.length ? (
          <>
            <ListenerSectionHeader title="Live now" action="View all" onAction={() => router.push('/live')} />
            {live.map((item) => (
              <ListenerListRow
                key={item.id}
                title={item.title}
                subtitle={item.stationName || 'Echoo Station'}
                meta={`${item.listenerCount || 0} live`}
                image={item.coverArt}
                fallback={<Radio color={palette.red} size={21} />}
                onPress={() => router.push('/live')}
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
                subtitle={track.subtitle || track.genre || 'Echoo Audio'}
                meta={track.genre || 'Audio'}
                image={track.coverArt}
                fallback={<Music2 color={palette.blue} size={21} />}
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
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: { width: '48.5%', minHeight: 126, backgroundColor: palette.surface, borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 14 },
  categoryIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  categoryTitle: { color: palette.ink, fontSize: 15, fontWeight: '900', marginTop: 10 },
  categorySubtitle: { color: palette.muted, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  tipCard: { marginTop: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tipCopy: { flex: 1 },
  tipTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  tipText: { color: palette.muted, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  loadingRow: { minHeight: 90, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
});
