import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  Download,
  Heart,
  History,
  ListMusic,
  Radio,
} from 'lucide-react-native';
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
  ListenerMiniPlayer,
  ListenerPageHeader,
  ListenerSectionHeader,
  ListenerTopBar,
} from '@/src/components/ListenerV2';
import {
  EchooAudio,
  EchooHistoryItem,
  EchooLibraryStats,
  EchooStation,
  getFollowedStations,
  getLibraryStats,
  getListeningHistory,
  getSavedAudio,
  hasEchooSession,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const emptyStats: EchooLibraryStats = {
  savedTracks: 0,
  playlists: 0,
  totalSaved: 0,
  listeningHistory: 0,
};

export default function LibraryScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EchooLibraryStats>(emptyStats);
  const [saved, setSaved] = useState<EchooAudio[]>([]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [history, setHistory] = useState<EchooHistoryItem[]>([]);
  const [error, setError] = useState('');

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError('');
    const activeSession = await hasEchooSession();
    setSignedIn(activeSession);

    if (!activeSession) {
      setSaved([]);
      setStations([]);
      setHistory([]);
      setStats(emptyStats);
      setLoading(false);
      return;
    }

    try {
      const [nextStats, nextSaved, nextStations, nextHistory] = await Promise.all([
        getLibraryStats(),
        getSavedAudio(),
        getFollowedStations(),
        getListeningHistory(),
      ]);
      setStats(nextStats);
      setSaved(nextSaved);
      setStations(nextStations);
      setHistory(nextHistory);
    } catch (loadError: any) {
      if (loadError?.code === 'AUTH_REQUIRED' || loadError?.code === 'SESSION_EXPIRED') {
        setSignedIn(false);
      } else {
        setError(loadError?.message || 'Could not load your Echoo library.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLibrary();
    }, [loadLibrary])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerTopBar />
        <ListenerPageHeader
          eyebrow="YOUR ECHOO"
          title="Library"
          subtitle="Everything you save, follow and listen to—organized around your account."
        />

        {!signedIn && !loading ? (
          <ListenerAuthCard onPress={() => router.push('/auth')} />
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Loading your library...</Text>
          </View>
        ) : null}

        {signedIn && !loading ? (
          <>
            <View style={styles.statGrid}>
              <LibraryStat icon={<Heart color={palette.blue} size={20} />} value={stats.savedTracks} label="Saved audio" palette={palette} />
              <LibraryStat icon={<Radio color={palette.blue} size={20} />} value={stations.length} label="Stations" palette={palette} />
              <LibraryStat icon={<ListMusic color={palette.blue} size={20} />} value={stats.playlists} label="Playlists" palette={palette} />
              <LibraryStat icon={<History color={palette.blue} size={20} />} value={stats.listeningHistory} label="History" palette={palette} />
            </View>

            {error ? (
              <ListenerEmptyState
                title="Your library could not refresh"
                subtitle={error}
                action="Try again"
                onAction={loadLibrary}
              />
            ) : null}

            <ListenerSectionHeader title="Saved audio" action="Favorites" onAction={() => router.push('/favorites')} />
            {saved.length ? (
              saved.slice(0, 8).map((track) => (
                <ListenerListRow
                  key={track.id}
                  title={track.title}
                  subtitle={track.subtitle || track.genre || 'Echoo Audio'}
                  meta={track.genre || 'Saved'}
                  image={track.coverArt}
                />
              ))
            ) : (
              <ListenerEmptyState
                title="No saved audio yet"
                subtitle="Save music, podcasts, teachings and other published audio to build your library."
                action="Find audio"
                onAction={() => router.push('/search')}
              />
            )}

            <ListenerSectionHeader title="Followed stations" />
            {stations.length ? (
              stations.slice(0, 6).map((station) => (
                <ListenerListRow
                  key={station.id}
                  title={station.name}
                  subtitle={station.category || 'Echoo Station'}
                  meta={station.isLive ? 'LIVE' : `${station.followerCount || 0} followers`}
                  image={station.coverArt}
                  fallback={<Radio color={palette.blue} size={21} />}
                />
              ))
            ) : (
              <ListenerEmptyState
                title="No followed stations"
                subtitle="Follow stations you enjoy so their live and published content is easier to find."
                action="Discover stations"
                onAction={() => router.push('/search')}
              />
            )}

            <ListenerSectionHeader title="Recently played" />
            {history.length ? (
              history.slice(0, 6).map((item) => (
                <ListenerListRow
                  key={item.id}
                  title={item.track?.title || 'Unavailable audio'}
                  subtitle={item.track?.subtitle || item.track?.genre || 'Echoo'}
                  meta={item.playedAt ? new Date(item.playedAt).toLocaleDateString() : 'History'}
                  image={item.track?.coverArt}
                />
              ))
            ) : (
              <ListenerEmptyState
                title="No listening history yet"
                subtitle="Once you start listening, your recent activity will appear here."
              />
            )}

            <ListenerSectionHeader title="Offline" />
            <View style={styles.offlineCard}>
              <View style={styles.offlineIcon}>
                <Download color={palette.blue} size={21} />
              </View>
              <View style={styles.offlineCopy}>
                <Text style={styles.offlineTitle}>Downloads stay on this device</Text>
                <Text style={styles.offlineText}>
                  Offline media will be shown here when the mobile download flow is enabled for a published track.
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>

      {signedIn && saved[0] ? <ListenerMiniPlayer audio={saved[0]} /> : null}
    </SafeAreaView>
  );
}

function LibraryStat({
  icon,
  value,
  label,
  palette,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 130 },
  loadingState: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48.5%', minHeight: 112, backgroundColor: palette.surface, borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 13 },
  statIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: palette.ink, fontSize: 22, fontWeight: '900', marginTop: 8 },
  statLabel: { color: palette.muted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  offlineCard: { backgroundColor: palette.surface, borderRadius: 17, borderWidth: 1, borderColor: palette.line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  offlineIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  offlineCopy: { flex: 1 },
  offlineTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  offlineText: { color: palette.muted, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
});
