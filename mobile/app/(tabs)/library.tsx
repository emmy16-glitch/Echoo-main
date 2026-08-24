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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ListenerAuthCard,
  ListenerEmptyState,
  ListenerListRow,
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

  const openAudio = (track?: EchooAudio | null) => {
    if (!track) return;
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ListenerTopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Your Library</Text>

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
            <View style={styles.quickList}>
              <LibraryShortcut
                color={palette.blueDeep}
                icon={<Heart color="#FFFFFF" fill="#FFFFFF" size={23} />}
                title="Liked audio"
                subtitle={`${stats.savedTracks} saved tracks`}
                onPress={() => router.push('/favorites')}
                palette={palette}
              />
              <LibraryShortcut
                color="#BE185D"
                icon={<Radio color="#FFFFFF" size={23} />}
                title="Followed stations"
                subtitle={`${stations.length} stations`}
                onPress={() => undefined}
                palette={palette}
              />
              <LibraryShortcut
                color="#047857"
                icon={<History color="#FFFFFF" size={23} />}
                title="Listening history"
                subtitle={`${stats.listeningHistory} recent plays`}
                onPress={() => undefined}
                palette={palette}
              />
              <LibraryShortcut
                color="#1D4ED8"
                icon={<ListMusic color="#FFFFFF" size={23} />}
                title="Playlists"
                subtitle={`${stats.playlists} playlists`}
                onPress={() => undefined}
                palette={palette}
              />
            </View>

            {error ? (
              <ListenerEmptyState
                title="Your library could not refresh"
                subtitle={error}
                action="Try again"
                onAction={loadLibrary}
              />
            ) : null}

            <ListenerSectionHeader title="Saved audio" action="See all" onAction={() => router.push('/favorites')} />
            {saved.length ? (
              saved.slice(0, 10).map((track) => (
                <ListenerListRow
                  key={track.id}
                  title={track.title}
                  subtitle={track.subtitle || track.artistName || track.genre || 'Echoo Audio'}
                  meta={track.genre || 'Saved'}
                  image={track.coverArt}
                  onPress={() => openAudio(track)}
                />
              ))
            ) : (
              <ListenerEmptyState
                title="No saved audio yet"
                subtitle="Tap the heart on any track to keep it in your library."
                action="Find audio"
                onAction={() => router.push('/search')}
              />
            )}

            <ListenerSectionHeader title="Recently played" />
            {history.length ? (
              history.slice(0, 6).map((item) => (
                <ListenerListRow
                  key={item.id}
                  title={item.track?.title || 'Unavailable audio'}
                  subtitle={item.track?.subtitle || item.track?.artistName || item.track?.genre || 'Echoo'}
                  meta={item.playedAt ? new Date(item.playedAt).toLocaleDateString() : 'History'}
                  image={item.track?.coverArt}
                  onPress={() => openAudio(item.track)}
                />
              ))
            ) : (
              <View style={styles.inlineEmpty}>
                <History color={palette.faint} size={20} />
                <Text style={styles.inlineEmptyText}>Your recent plays will appear here.</Text>
              </View>
            )}

            <Pressable style={styles.downloadRow}>
              <View style={styles.downloadIcon}>
                <Download color={palette.ink} size={20} />
              </View>
              <View style={styles.downloadCopy}>
                <Text style={styles.downloadTitle}>Downloads</Text>
                <Text style={styles.downloadText}>Offline audio on this device</Text>
              </View>
              <Text style={styles.downloadCount}>0</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function LibraryShortcut({
  color,
  icon,
  title,
  subtitle,
  onPress,
  palette,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  palette: EchooColors;
}) {
  const shortcutStyles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable style={shortcutStyles.shortcutRow} onPress={onPress}>
      <View style={[shortcutStyles.shortcutArt, { backgroundColor: color }]}>{icon}</View>
      <View style={shortcutStyles.shortcutCopy}>
        <Text style={shortcutStyles.shortcutTitle}>{title}</Text>
        <Text style={shortcutStyles.shortcutSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
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
    marginBottom: 20,
  },
  loadingState: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  quickList: { gap: 4 },
  shortcutRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  shortcutArt: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutCopy: { flex: 1, paddingHorizontal: 12 },
  shortcutTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  shortcutSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
  inlineEmpty: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: palette.surfaceRaised,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  inlineEmptyText: { color: palette.muted, fontSize: 12 },
  downloadRow: {
    minHeight: 70,
    marginTop: 26,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    flexDirection: 'row',
    alignItems: 'center',
  },
  downloadIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: palette.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadCopy: { flex: 1, paddingHorizontal: 12 },
  downloadTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  downloadText: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
  downloadCount: { color: palette.muted, fontSize: 12, fontWeight: '800' },
});
