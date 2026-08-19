import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Heart, Music2, Radio } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ListenerAuthCard,
  ListenerEmptyState,
  ListenerListRow,
  ListenerPageHeader,
  ListenerSectionHeader,
  ListenerTopBar,
} from '@/src/components/ListenerV2';
import {
  EchooAudio,
  EchooStation,
  getFollowedStations,
  getSavedAudio,
  hasEchooSession,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function FavoritesScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedAudio, setSavedAudio] = useState<EchooAudio[]>([]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [error, setError] = useState('');

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setError('');
    const activeSession = await hasEchooSession();
    setSignedIn(activeSession);

    if (!activeSession) {
      setSavedAudio([]);
      setStations([]);
      setLoading(false);
      return;
    }

    try {
      const [audio, followedStations] = await Promise.all([
        getSavedAudio(),
        getFollowedStations(),
      ]);
      setSavedAudio(audio);
      setStations(followedStations);
    } catch (loadError: any) {
      if (loadError?.code === 'AUTH_REQUIRED' || loadError?.code === 'SESSION_EXPIRED') {
        setSignedIn(false);
      } else {
        setError(loadError?.message || 'Could not refresh favorites.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites])
  );

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

  const total = savedAudio.length + stations.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerTopBar />
        <ListenerPageHeader
          eyebrow="YOUR ECHOO"
          title="Favorites"
          subtitle="The stations and audio you have deliberately kept close."
        />

        {!signedIn && !loading ? (
          <ListenerAuthCard
            title="Sign in to sync favorites"
            subtitle="Saved audio and followed stations belong to your Echoo account, not just this phone."
            onPress={() => router.push('/auth')}
          />
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Loading favorites...</Text>
          </View>
        ) : null}

        {signedIn && !loading ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.heartIcon}>
                <Heart color="#FFFFFF" fill="#FFFFFF" size={24} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryValue}>{total}</Text>
                <Text style={styles.summaryTitle}>favorites in your Echoo</Text>
                <Text style={styles.summaryText}>
                  {savedAudio.length} saved audio · {stations.length} followed stations
                </Text>
              </View>
            </View>

            {error ? (
              <ListenerEmptyState
                title="Favorites could not refresh"
                subtitle={error}
                action="Try again"
                onAction={loadFavorites}
              />
            ) : null}

            <ListenerSectionHeader title="Favorite stations" />
            {stations.length ? (
              stations.map((station) => (
                <ListenerListRow
                  key={station.id}
                  title={station.name}
                  subtitle={station.category || 'Echoo Station'}
                  meta={station.isLive ? 'LIVE' : `${station.followerCount || 0} followers`}
                  image={station.coverArt}
                  fallback={<Radio color={palette.blue} size={21} />}
                  onPress={() => openStation(station)}
                />
              ))
            ) : (
              <ListenerEmptyState
                title="No favorite stations yet"
                subtitle="Follow a station from discovery or search and it will appear here."
                action="Find stations"
                onAction={() => router.push('/search')}
              />
            )}

            <ListenerSectionHeader title="Favorite audio" />
            {savedAudio.length ? (
              savedAudio.map((track) => (
                <ListenerListRow
                  key={track.id}
                  title={track.title}
                  subtitle={track.subtitle || track.genre || 'Echoo Audio'}
                  meta={track.genre || 'Saved'}
                  image={track.coverArt}
                  fallback={<Music2 color={palette.blue} size={21} />}
                  onPress={() => openAudio(track)}
                />
              ))
            ) : (
              <ListenerEmptyState
                title="No favorite audio yet"
                subtitle="Save published audio so you can return to it without searching again."
                action="Discover audio"
                onAction={() => router.push('/search')}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  summaryCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heartIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryValue: { color: palette.ink, fontSize: 26, fontWeight: '900', lineHeight: 28 },
  summaryTitle: { color: palette.ink2, fontSize: 12.5, fontWeight: '800', marginTop: 1 },
  summaryText: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
});
