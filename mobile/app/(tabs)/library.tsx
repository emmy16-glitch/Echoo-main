import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  Download,
  Heart,
  History,
  ListMusic,
  MoreHorizontal,
  Radio,
} from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AudioRowActions,
} from '@/src/components/AudioRowActions';
import {
  ListenerAuthCard,
  ListenerEmptyState,
  ListenerListRow,
  ListenerSectionHeader,
  ListenerSkeletonRows,
  ListenerToast,
  ListenerTopBar,
  friendlyErrorMessage,
} from '@/src/components/ListenerV2';
import {
  EchooAudio,
  EchooHistoryItem,
  EchooLibraryStats,
  EchooPlaylist,
  EchooStation,
  getFollowedStations,
  getLibraryStats,
  getListeningHistory,
  getMyPlaylists,
  getSavedAudio,
  hasEchooSession,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LocalDownload, deleteLocalDownload, getLocalDownloads } from '@/src/services/localDownloads';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const emptyStats: EchooLibraryStats = {
  savedTracks: 0,
  playlists: 0,
  totalSaved: 0,
  listeningHistory: 0,
};

type LibraryTab = 'saved' | 'downloads' | 'playlists' | 'stations' | 'history';
type SortMode = 'recent' | 'title';

const libraryTabs: { key: LibraryTab; label: string }[] = [
  { key: 'saved', label: 'Saved' },
  { key: 'downloads', label: 'Downloads' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'stations', label: 'Stations' },
  { key: 'history', label: 'History' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<EchooLibraryStats>(emptyStats);
  const [saved, setSaved] = useState<EchooAudio[]>([]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [history, setHistory] = useState<EchooHistoryItem[]>([]);
  const [playlists, setPlaylists] = useState<EchooPlaylist[]>([]);
  const [downloads, setDownloads] = useState<LocalDownload[]>([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<LibraryTab>('saved');
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const hasLoadedOnce = useRef(false);

  const loadLibrary = useCallback(async (force = false, silent = false) => {
    if (force) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError('');
    const activeSession = await hasEchooSession();
    setSignedIn(activeSession);

    if (!activeSession) {
      setSaved([]);
      setStations([]);
      setHistory([]);
      setPlaylists([]);
      setDownloads([]);
      setStats(emptyStats);
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
      return;
    }

    try {
      const [nextStats, nextSaved, nextStations, nextHistory, nextPlaylists, nextDownloads] = await Promise.all([
        getLibraryStats({ force }),
        getSavedAudio({ force }),
        getFollowedStations({ force }),
        getListeningHistory({ force }),
        getMyPlaylists({ force }).catch(() => []),
        getLocalDownloads().catch(() => []),
      ]);
      setStats(nextStats);
      setSaved(nextSaved);
      setStations(nextStations);
      setHistory(nextHistory);
      setPlaylists(nextPlaylists);
      setDownloads(nextDownloads);
    } catch (loadError: any) {
      if (loadError?.code === 'AUTH_REQUIRED' || loadError?.code === 'SESSION_EXPIRED') {
        setSignedIn(false);
      } else {
        setError(friendlyErrorMessage(loadError, 'Could not load your Echoo library.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLibrary(false, hasLoadedOnce.current);
    }, [loadLibrary])
  );

  const openAudio = (track?: EchooAudio | null, localUri?: string) => {
    if (!track) return;
    router.push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: track.stationName || track.subtitle || track.artistName || track.genre || 'Echoo Audio',
        coverArt: track.coverArt || '',
        fileUrl: localUri || track.fileUrl || '',
        genre: track.genre || '',
        stationId: track.stationId || '',
        stationName: track.stationName || '',
      },
    });
  };

  const openPlaylist = (playlist: EchooPlaylist) => {
    router.push({
      pathname: '/collection' as any,
      params: {
        collectionId: playlist.id,
        stationId: playlist.owner?.id || '',
        stationName: playlist.owner?.displayName || '',
      },
    });
  };

  const removeDownloadedAudio = async (download: LocalDownload) => {
    await deleteLocalDownload(download);
    setDownloads((current) => current.filter((item) => item.trackId !== download.trackId));
  };

  const downloadedTrackIds = useMemo(
    () => new Set(downloads.map((download) => download.trackId).filter(Boolean)),
    [downloads]
  );

  const sortAudio = useCallback((rows: EchooAudio[]) => {
    if (sortMode === 'title') return [...rows].sort((a, b) => a.title.localeCompare(b.title));
    return rows;
  }, [sortMode]);

  const visibleSaved = useMemo(() => {
    const rows = offlineOnly ? saved.filter((track) => downloadedTrackIds.has(track.id)) : saved;
    return sortAudio(rows);
  }, [downloadedTrackIds, offlineOnly, saved, sortAudio]);

  const visibleHistory = useMemo(() => {
    const rows = offlineOnly
      ? history.filter((item) => item.track?.id && downloadedTrackIds.has(item.track.id))
      : history;
    if (sortMode === 'title') {
      return [...rows].sort((a, b) =>
        String(a.track?.title || '').localeCompare(String(b.track?.title || ''))
      );
    }
    return rows;
  }, [downloadedTrackIds, history, offlineOnly, sortMode]);

  const tabCounts: Record<LibraryTab, number> = {
    saved: saved.length,
    downloads: downloads.length,
    playlists: playlists.length || stats.playlists,
    stations: stations.length,
    history: history.length,
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ListenerTopBar />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadLibrary(true)}
            tintColor={palette.blue}
            colors={[palette.blue]}
          />
        }
      >
        <Text style={styles.pageTitle}>Your Library</Text>

        {!signedIn && !loading ? (
          <ListenerAuthCard onPress={() => router.push('/auth')} />
        ) : null}

        {loading ? (
          <ListenerSkeletonRows count={5} />
        ) : null}

        {signedIn && !loading ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryIcon}>
                <LibraryGlyph activeTab={activeTab} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>{tabCounts[activeTab]}</Text>
                <Text style={styles.summaryText}>
                  {activeTab === 'downloads'
                    ? 'offline items on this device'
                    : activeTab === 'saved'
                      ? 'saved audio synced to your account'
                      : activeTab === 'playlists'
                        ? 'playlists and series'
                        : activeTab === 'stations'
                          ? 'followed stations'
                          : 'recent plays'}
                </Text>
              </View>
              <View style={styles.offlinePill}>
                <Download color={downloads.length ? palette.blue : palette.faint} size={14} />
                <Text style={styles.offlinePillText}>{downloads.length} offline</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRail}>
              {libraryTabs.map((tab) => (
                <Pressable
                  key={tab.key}
                  style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                  <Text style={[styles.tabCount, activeTab === tab.key && styles.tabCountActive]}>
                    {tabCounts[tab.key]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.filterRow}>
              <Pressable
                style={[styles.filterChip, offlineOnly && styles.filterChipActive]}
                onPress={() => setOfflineOnly((current) => !current)}
              >
                <Download color={offlineOnly ? '#FFFFFF' : palette.muted} size={14} />
                <Text style={[styles.filterText, offlineOnly && styles.filterTextActive]}>Offline</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, sortMode === 'recent' && styles.filterChipActive]}
                onPress={() => setSortMode('recent')}
              >
                <History color={sortMode === 'recent' ? '#FFFFFF' : palette.muted} size={14} />
                <Text style={[styles.filterText, sortMode === 'recent' && styles.filterTextActive]}>Recent</Text>
              </Pressable>
              <Pressable
                style={[styles.filterChip, sortMode === 'title' && styles.filterChipActive]}
                onPress={() => setSortMode('title')}
              >
                <MoreHorizontal color={sortMode === 'title' ? '#FFFFFF' : palette.muted} size={14} />
                <Text style={[styles.filterText, sortMode === 'title' && styles.filterTextActive]}>A-Z</Text>
              </Pressable>
            </View>

            {error ? (
              <ListenerToast message={error} />
            ) : null}

            {activeTab === 'saved' ? (
              <>
            <ListenerSectionHeader title={offlineOnly ? 'Saved offline' : 'Saved audio'} />
            {visibleSaved.length ? (
              visibleSaved.map((track) => (
                <ListenerListRow
                  key={track.id}
                  title={track.title}
                  subtitle={track.subtitle || track.artistName || track.genre || 'Echoo Audio'}
                  meta={downloadedTrackIds.has(track.id) ? 'Offline' : track.genre || 'Saved'}
                  image={track.coverArt}
                  trailing={
                    <AudioRowActions
                      track={track}
                      initialSaved
                      downloaded={downloadedTrackIds.has(track.id)}
                      onChanged={() => loadLibrary(true)}
                    />
                  }
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
              </>
            ) : null}

            {activeTab === 'history' ? (
              <>
            <ListenerSectionHeader title={offlineOnly ? 'Recent offline plays' : 'Recently played'} />
            {visibleHistory.length ? (
              visibleHistory.map((item) => (
                <ListenerListRow
                  key={item.id}
                  title={item.track?.title || 'Unavailable audio'}
                  subtitle={item.track?.subtitle || item.track?.artistName || item.track?.genre || 'Echoo'}
                  meta={item.track?.id && downloadedTrackIds.has(item.track.id) ? 'Offline' : item.playedAt ? new Date(item.playedAt).toLocaleDateString() : 'History'}
                  image={item.track?.coverArt}
                  trailing={
                    item.track ? (
                      <AudioRowActions
                        track={item.track}
                        initialSaved={saved.some((track) => track.id === item.track?.id)}
                        downloaded={Boolean(item.track?.id && downloadedTrackIds.has(item.track.id))}
                        onChanged={() => loadLibrary(true)}
                      />
                    ) : null
                  }
                  onPress={() => openAudio(item.track)}
                />
              ))
            ) : (
              <View style={styles.inlineEmpty}>
                <History color={palette.faint} size={20} />
                <Text style={styles.inlineEmptyText}>Your recent plays will appear here.</Text>
              </View>
            )}
              </>
            ) : null}

            {activeTab === 'playlists' ? (
              <>
            <ListenerSectionHeader title="Playlists" />
            {playlists.length ? (
              playlists.map((playlist) => (
                <ListenerListRow
                  key={playlist.id}
                  title={playlist.name}
                  subtitle={playlist.mode === 'series' ? 'Series' : 'Playlist'}
                  meta={`${playlist.trackCount || playlist.tracks.length} tracks`}
                  image={playlist.coverArt}
                  fallback={<ListMusic color={palette.blue} size={21} />}
                  onPress={() => openPlaylist(playlist)}
                />
              ))
            ) : (
              <View style={styles.inlineEmpty}>
                <ListMusic color={palette.faint} size={20} />
                <Text style={styles.inlineEmptyText}>Playlists you create from the player will appear here.</Text>
              </View>
            )}
              </>
            ) : null}

            {activeTab === 'stations' ? (
              <>
            <ListenerSectionHeader title="Followed stations" />
            {stations.length ? (
              stations.map((station) => (
                <ListenerListRow
                  key={station.id}
                  title={station.name}
                  subtitle={station.category || 'Echoo Station'}
                  meta={station.isLive ? 'LIVE' : `${station.followerCount || 0} followers`}
                  image={station.coverArt}
                  fallback={<Radio color={palette.blue} size={21} />}
                  onPress={() => router.push({ pathname: '/station', params: { stationId: station.id } })}
                />
              ))
            ) : (
              <View style={styles.inlineEmpty}>
                <Radio color={palette.faint} size={20} />
                <Text style={styles.inlineEmptyText}>Stations you follow will appear here.</Text>
              </View>
            )}
              </>
            ) : null}

            {activeTab === 'downloads' ? (
              <>
            <ListenerSectionHeader title="Downloads" />
            {downloads.length ? (
              downloads.map((download) => (
                <ListenerListRow
                  key={download.trackId}
                  title={download.track?.title || 'Downloaded audio'}
                  subtitle={download.track?.stationName || download.track?.subtitle || download.track?.artistName || 'Offline audio'}
                  meta="Device"
                  image={download.track?.coverArt}
                  fallback={<Download color={palette.blue} size={20} />}
                  trailing={
                    download.track ? (
                      <AudioRowActions
                        track={download.track}
                        initialSaved={saved.some((track) => track.id === download.trackId)}
                        downloaded
                        onChanged={() => loadLibrary(true)}
                      />
                    ) : (
                      <Pressable style={styles.removeButton} onPress={() => removeDownloadedAudio(download)}>
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </Pressable>
                    )
                  }
                  onPress={() => openAudio(download.track, download.localUri)}
                />
              ))
            ) : (
              <View style={styles.inlineEmpty}>
                <Download color={palette.faint} size={20} />
                <Text style={styles.inlineEmptyText}>Downloaded audio will stay playable from this device.</Text>
              </View>
            )}
              </>
            ) : null}
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

function LibraryGlyph({ activeTab }: { activeTab: LibraryTab }) {
  if (activeTab === 'downloads') return <Download color="#FFFFFF" size={23} />;
  if (activeTab === 'playlists') return <ListMusic color="#FFFFFF" size={23} />;
  if (activeTab === 'stations') return <Radio color="#FFFFFF" size={23} />;
  if (activeTab === 'history') return <History color="#FFFFFF" size={23} />;
  return <Heart color="#FFFFFF" fill="#FFFFFF" size={23} />;
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
  summaryCard: {
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { color: palette.ink, fontSize: 24, fontWeight: '900' },
  summaryText: { color: palette.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  offlinePill: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  offlinePillText: { color: palette.muted, fontSize: 10.5, fontWeight: '900' },
  tabRail: { gap: 8, paddingTop: 14, paddingBottom: 8 },
  tabButton: {
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tabButtonActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  tabText: { color: palette.ink2, fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: { color: palette.muted, fontSize: 10.5, fontWeight: '900' },
  tabCountActive: { color: 'rgba(255,255,255,0.8)' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  filterChip: {
    minHeight: 31,
    borderRadius: 16,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  filterChipActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  filterText: { color: palette.muted, fontSize: 11, fontWeight: '900' },
  filterTextActive: { color: '#FFFFFF' },
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
  removeButton: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: palette.surfaceRaised,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
  },
  removeButtonText: { color: palette.muted, fontSize: 10.5, fontWeight: '900' },
});
