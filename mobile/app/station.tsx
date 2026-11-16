import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useLatestRequest } from '@/src/navigation/useLatestRequest';
import { subscribeSessionChanges } from '@/src/services/sessionLifecycle';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import {
  ChevronLeft,
  Headphones,
  Info,
  ListMusic,
  MoreVertical,
  Music2,
  Play,
  Radio,
} from 'lucide-react-native';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioRowActions } from '@/src/components/AudioRowActions';
import { ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { StationSkeleton } from '@/src/components/DiscoverySkeletons';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import {
  EchooAudio,
  EchooBroadcast,
  EchooPlaylist,
  EchooStation,
  followStation,
  getFollowedStations,
  getLiveBroadcastForStation,
  getPublicAudioByCreator,
  getPublicCollectionsForStation,
  getStationById,
  hasEchooSession,
  unfollowStation,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type StationTab = 'all' | 'live' | 'audio' | 'collections' | 'podcast';
type StationScreenSnapshot = {
  station: EchooStation | null;
  live: EchooBroadcast | null;
  publishedAudio: EchooAudio[];
  collections: EchooPlaylist[];
  signedIn: boolean;
  following: boolean;
};

const stationScreenCache = new Map<string, StationScreenSnapshot>();
const STATION_LIVE_REFRESH_MS = 30_000;
const STATION_LIVE_RETURN_DEBOUNCE_MS = 10_000;

const tabs: { key: StationTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live now' },
  { key: 'audio', label: 'Audio' },
  { key: 'collections', label: 'Collections' },
  { key: 'podcast', label: 'Podcast' },
];

function getInitialTab(value?: string): StationTab {
  return tabs.some((tab) => tab.key === value) ? (value as StationTab) : 'all';
}

function compactNumber(value = 0) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value || 0);
}

export default function StationScreen() {
  const requests = useLatestRequest();
  const liveRequests = useLatestRequest();
  const insets = useSafeAreaInsets();
  const { router, push } = useGuardedRouter();
  const params = useLocalSearchParams<{ stationId?: string; tab?: StationTab }>();
  const stationId = String(params.stationId || '');
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const playback = usePlayback();
  const cachedStationScreen = stationId ? stationScreenCache.get(stationId) : undefined;

  const [activeTab, setActiveTab] = useState<StationTab>(getInitialTab(String(params.tab || '')));
  const [station, setStation] = useState<EchooStation | null>(cachedStationScreen?.station || null);
  const [live, setLive] = useState<EchooBroadcast | null>(cachedStationScreen?.live || null);
  const [publishedAudio, setPublishedAudio] = useState<EchooAudio[]>(cachedStationScreen?.publishedAudio || []);
  const [collections, setCollections] = useState<EchooPlaylist[]>(cachedStationScreen?.collections || []);
  const [signedIn, setSignedIn] = useState(Boolean(cachedStationScreen?.signedIn));
  const [following, setFollowing] = useState(Boolean(cachedStationScreen?.following));
  const [loading, setLoading] = useState(!cachedStationScreen);
  const [contentLoading, setContentLoading] = useState(!cachedStationScreen);
  const [refreshing, setRefreshing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState('');
  const [contentError, setContentError] = useState('');
  const refreshingLiveRef = useRef(false);
  const lastLiveRefreshAtRef = useRef(0);

  const load = useCallback(async (force = false, silent = false) => {
    const active = requests.begin();
    const liveActive = liveRequests.begin();
    if (!stationId) {
      setError('Station ID is missing.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (force) setRefreshing(true);
    else if (!silent) {
      setLoading(true);
      setContentLoading(true);
    }
    setError('');
    setContentError('');

    try {
      const session = await hasEchooSession();
      const [nextStation, nextLive] = await Promise.all([
        getStationById(stationId, { force }),
        getLiveBroadcastForStation(stationId, { force }).catch(() => null),
      ]);

      if (!active()) return;

      setSignedIn(session);
      setStation(nextStation);
      if (liveActive()) setLive(nextLive);

      const ownerId = nextStation?.owner?.id || '';
      const [audioRows, collectionRows] = await Promise.all([
        getPublicAudioByCreator(ownerId, { force }).catch((audioError) => {
          if (active()) setContentError(friendlyErrorMessage(audioError, 'Could not load station content.'));
          return [];
        }),
        getPublicCollectionsForStation(stationId, { force }).catch(() => []),
      ]);
      if (!active()) return;
      setPublishedAudio(audioRows);
      setCollections(collectionRows);

      let nextFollowing = false;
      if (session) {
        const followed = await getFollowedStations({ force }).catch(() => []);
        nextFollowing = followed.some((item: EchooStation) => item.id === stationId);
      }
      if (!active()) return;
      setFollowing(nextFollowing);

      stationScreenCache.set(stationId, {
        station: nextStation,
        live: liveActive() ? nextLive : stationScreenCache.get(stationId)?.live || null,
        publishedAudio: audioRows,
        collections: collectionRows,
        signedIn: session,
        following: nextFollowing,
      });
    } catch (loadError: any) {
      if (!active()) return;
      setError(friendlyErrorMessage(loadError, 'Could not load this station.'));
    } finally {
      if (active()) {
        setLoading(false);
        setContentLoading(false);
        setRefreshing(false);
      }
    }
  }, [stationId, requests, liveRequests]);

  useEffect(() => {
    const cached = stationScreenCache.get(stationId);
    setStation(cached?.station || null);
    setLive(cached?.live || null);
    setPublishedAudio(cached?.publishedAudio || []);
    setCollections(cached?.collections || []);
    setFollowing(false);
    setSignedIn(false);
    load(false, Boolean(stationScreenCache.get(stationId)));
    return () => { requests.invalidate(); liveRequests.invalidate(); refreshingLiveRef.current = false; };
  }, [load, stationId, requests, liveRequests]);

  const refreshLiveStatus = useCallback(async () => {
    if (!stationId || refreshingLiveRef.current) return;
    const active = liveRequests.begin();
    refreshingLiveRef.current = true;
    try {
      const nextLive = await getLiveBroadcastForStation(stationId, { force: true }).catch(() => null);
      if (!active()) return;
      setLive(nextLive);
      const cached = stationScreenCache.get(stationId);
      if (cached) stationScreenCache.set(stationId, { ...cached, live: nextLive });
    } finally {
      refreshingLiveRef.current = false;
    }
  }, [stationId, liveRequests]);

  useFocusEffect(
    useCallback(() => {
      let appState = AppState.currentState;
      const refreshQuietly = () => {
        const now = Date.now();
        if (now - lastLiveRefreshAtRef.current < STATION_LIVE_RETURN_DEBOUNCE_MS) return;
        lastLiveRefreshAtRef.current = now;
        void refreshLiveStatus();
      };

      refreshQuietly();
      const unsubscribeSession = subscribeSessionChanges(() => {
        setSignedIn(false);
        setFollowing(false);
        void load(false, true);
      });
      const interval = setInterval(refreshQuietly, STATION_LIVE_REFRESH_MS);
      const subscription = AppState.addEventListener('change', (nextAppState) => {
        const returnedToApp =
          (appState === 'background' || appState === 'inactive') && nextAppState === 'active';
        appState = nextAppState;
        if (returnedToApp) refreshQuietly();
      });

      return () => {
        clearInterval(interval);
        subscription.remove();
        unsubscribeSession();
      };
    }, [refreshLiveStatus, load])
  );

  const toggleFollow = async () => {
    if (!stationId) return;
    if (!signedIn) {
      push('/auth');
      return;
    }

    setFollowBusy(true);
    setError('');
    try {
      if (following) {
        await unfollowStation(stationId);
        setFollowing(false);
        setStation((current) =>
          current ? { ...current, followerCount: Math.max(0, (current.followerCount || 0) - 1) } : current
        );
        const cached = stationScreenCache.get(stationId);
        if (cached) {
          stationScreenCache.set(stationId, {
            ...cached,
            following: false,
            station: cached.station
              ? { ...cached.station, followerCount: Math.max(0, (cached.station.followerCount || 0) - 1) }
              : cached.station,
          });
        }
      } else {
        await followStation(stationId);
        setFollowing(true);
        setStation((current) =>
          current ? { ...current, followerCount: (current.followerCount || 0) + 1 } : current
        );
        const cached = stationScreenCache.get(stationId);
        if (cached) {
          stationScreenCache.set(stationId, {
            ...cached,
            following: true,
            station: cached.station
              ? { ...cached.station, followerCount: (cached.station.followerCount || 0) + 1 }
              : cached.station,
          });
        }
      }
    } catch (followError: any) {
      setError(friendlyErrorMessage(followError, 'Could not update this station follow.'));
    } finally {
      setFollowBusy(false);
    }
  };

  const openLive = () => {
    if (!live) return;
    push({
      pathname: '/live-room',
      params: {
        broadcastId: live.id,
        title: live.title,
        stationName: station?.name || live.stationName || 'Echoo Station',
        stationId: live.stationId || station?.id || '',
        coverArt: live.coverArt || station?.coverArt || '',
      },
    });
  };

  const stationAudioQueue = useMemo<AudioPlaybackItem[]>(
    () => publishedAudio.map((track) => ({
      kind: 'audio',
      id: track.id,
      title: track.title,
      subtitle: station?.name || track.stationName || track.artistName || 'Echoo Audio',
      coverArt: track.coverArt || '',
      fileUrl: track.fileUrl || '',
      genre: track.genre || '',
      stationId,
      stationName: station?.name || track.stationName || '',
      collectionId: '',
      collectionName: '',
    })),
    [publishedAudio, station?.name, stationId]
  );

  const openAudio = async (track: EchooAudio, collection?: EchooPlaylist) => {
    const index = Math.max(0, stationAudioQueue.findIndex((item) => item.id === track.id));
    void playback.playAudioQueue(stationAudioQueue, index).catch(() => undefined);
    push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: station?.name || track.stationName || track.artistName || 'Echoo Audio',
        coverArt: track.coverArt || '',
        fileUrl: track.fileUrl || '',
        genre: track.genre || '',
        stationId,
        stationName: station?.name || '',
        collectionId: collection?.id || '',
        collectionName: collection?.name || '',
      },
    });
  };

  const openCollection = (collection: EchooPlaylist) => {
    push({
      pathname: '/collection' as any,
      params: { collectionId: collection.id, stationId, stationName: station?.name || '' },
    });
  };

  const renderContent = () => {
    if (contentLoading) {
      return (
        <ListenerSkeletonRows count={4} />
      );
    }

    if (contentError) {
      return (
        <ListenerEmptyState
          title="Content unavailable"
          subtitle={contentError}
          action="Try again"
          onAction={() => load(true)}
          icon={<Radio color={palette.blue} size={24} />}
        />
      );
    }

    if (activeTab === 'all') {
      return (
        <View style={styles.tabPanel}>
          {live ? <LiveFeature live={live} onPress={openLive} palette={palette} /> : null}
          {collections.length ? (
            <Section title="Latest audio" action="" onAction={() => setActiveTab('collections')} palette={palette}>
              {collections.slice(0, 3).map((collection) => <CollectionRow key={collection.id} collection={collection} onPress={() => openCollection(collection)} palette={palette} />)}
            </Section>
          ) : null}
          {publishedAudio.length ? (
            <Section title="Audio" action="" onAction={() => setActiveTab('audio')} palette={palette}>
              {publishedAudio.slice(0, 5).map((track) => <AudioRow key={track.id} track={track} station={station} onPress={() => void openAudio(track)} palette={palette} />)}
            </Section>
          ) : null}
          {!live && !publishedAudio.length && !collections.length ? (
            <CompactEmpty
              icon={<Headphones color={palette.blue} size={24} />}
              title="This station is getting ready"
              text="Audio, live rooms and collections will appear here."
              palette={palette}
            />
          ) : null}
        </View>
      );
    }

    if (activeTab === 'audio') {
      return publishedAudio.length ? (
        <View style={styles.listStack}>
          {publishedAudio.map((track) => (
            <AudioRow key={track.id} track={track} station={station} onPress={() => void openAudio(track)} palette={palette} />
          ))}
        </View>
      ) : (
        <CompactEmpty icon={<Music2 color={palette.blue} size={24} />} title="No audio yet" text="Published station audio will appear here." palette={palette} />
      );
    }

    if (activeTab === 'live') {
      return live ? (
        <LiveFeature live={live} onPress={openLive} palette={palette} />
      ) : (
        <CompactEmpty icon={<Radio color={palette.blue} size={24} />} title="Not live right now" text="Live broadcasts appear here when they start." palette={palette} />
      );
    }

    if (activeTab === 'collections') {
      return collections.length ? (
        <View style={styles.listStack}>
          {collections.map((collection) => (
            <CollectionRow key={collection.id} collection={collection} onPress={() => openCollection(collection)} palette={palette} />
          ))}
        </View>
      ) : (
        <CompactEmpty icon={<ListMusic color={palette.blue} size={24} />} title="No collections yet" text="Series and playlists will appear here." palette={palette} />
      );
    }
    const podcasts = publishedAudio.filter((track) => /podcast/i.test(`${track.genre || ''} ${track.title}`));
    return podcasts.length ? <View style={styles.listStack}>{podcasts.map((track) => <AudioRow key={track.id} track={track} station={station} onPress={() => void openAudio(track)} palette={palette} />)}</View> : <CompactEmpty icon={<Headphones color={palette.blue} size={24} />} title="No podcasts yet" text="Podcasts from this channel will appear here." palette={palette} />;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['right', 'bottom', 'left']}>
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
        {loading && !station ? <><Pressable style={styles.fallbackBack} onPress={() => router.back()} accessibilityLabel="Go back"><ChevronLeft color={palette.ink} size={26} /></Pressable><View style={styles.skeletonInset}><StationSkeleton /></View></> : null}

        {!loading && error && !station ? (
          <View style={[styles.errorStateInset, { paddingTop: Math.max(insets.top + 24, 64) }]}>
            <ListenerEmptyState
              title="Station unavailable"
              subtitle={error}
              action="Try again"
              onAction={() => load(true)}
              icon={<Radio color={palette.blue} size={25} />}
            />
          </View>
        ) : null}

        {!loading && station ? (
          <>
            <View style={styles.hero}>
              {station.coverArt ? (
                <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <LinearGradient colors={[palette.blue, palette.night2]} style={StyleSheet.absoluteFillObject} />
              )}
              <Pressable style={[styles.heroBack, { top: insets.top + 8 }]} onPress={() => router.back()} accessibilityLabel="Go back"><ChevronLeft color={palette.ink} size={25} strokeWidth={2.5} /></Pressable>
            </View>
              <View style={styles.heroInfo}>
                <Text style={styles.heroName}>{station.name}</Text>
                <Text style={styles.heroHandle}>@{station.slug || station.name.toLowerCase().replace(/\s+/g, '')}</Text>
                <Text style={styles.heroStats}>{compactNumber(station.followerCount)} followers  ·  {publishedAudio.length} audios</Text>
                <View style={styles.bioRow}><Text style={styles.heroBio} numberOfLines={3}>{station.description || station.category || 'Live audio, teachings, conversations and collections.'}</Text><Pressable style={styles.followButton} onPress={toggleFollow} disabled={followBusy} accessibilityRole="button" accessibilityLabel={following ? 'Unfollow channel' : 'Follow channel'}>{followBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.followText}>{following ? 'Following' : 'Follow'}</Text>}</Pressable></View>
              </View>
            {error ? <ListenerToast message={error} /> : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRail}>
              {tabs.map((tab) => (
                <Pressable key={tab.key} style={styles.tabButton} onPress={() => setActiveTab(tab.key)}>
                  <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                  {activeTab === tab.key ? <View style={styles.tabIndicator} /> : null}
                </Pressable>
              ))}
            </ScrollView>

            {renderContent()}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, action, onAction, children, palette }: {
  title: string;
  action: string;
  onAction: () => void;
  children: ReactNode;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action ? <Pressable onPress={onAction} hitSlop={8}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}
      </View>
      {children}
    </View>
  );
}

function AudioRow({ track, station, onPress, palette }: {
  track: EchooAudio;
  station: EchooStation | null;
  onPress: () => void;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const actionTrack = {
    ...track,
    stationId: track.stationId || station?.id || '',
    stationName: track.stationName || station?.name || '',
  };
  return (
    <Pressable style={styles.audioRow} onPress={onPress}>
      <View style={styles.audioArt}>
        {track.coverArt ? (
          <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <Music2 color={palette.blue} size={22} />
        )}
      </View>
      <View style={styles.audioCopy}>
        <Text style={styles.audioTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.audioSubtitle} numberOfLines={1}>{station?.name || track.artistName || 'Echoo'}</Text>
      </View>
      <View style={styles.rowAction}>
        <Play color="#FFFFFF" fill="#FFFFFF" size={13} />
      </View>
      <AudioRowActions track={actionTrack} />
    </Pressable>
  );
}

function CollectionRow({ collection, onPress, palette }: {
  collection: EchooPlaylist;
  onPress: () => void;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable style={styles.collectionRow} onPress={onPress}>
      <View style={styles.collectionArt}>
        {collection.coverArt ? (
          <Image source={{ uri: collection.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <LinearGradient colors={[palette.blueDeep, palette.blue]} style={StyleSheet.absoluteFillObject} />
        )}
      </View>
      <View style={styles.collectionCopy}><Text style={styles.collectionTitle} numberOfLines={1}>{collection.name}</Text><Text style={styles.collectionMeta} numberOfLines={1}>{collection.trackCount ?? collection.tracks.length} audios</Text></View>
      <MoreVertical color={palette.ink} size={21} />
    </Pressable>
  );
}

function LiveFeature({ live, onPress, palette }: {
  live: EchooBroadcast;
  onPress: () => void;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable style={styles.liveFeature} onPress={onPress}>
      <View style={styles.liveFeatureIcon}>
        <Radio color={palette.red} size={22} />
      </View>
      <View style={styles.liveFeatureCopy}>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>LIVE</Text>
        </View>
        <Text style={styles.liveTitle} numberOfLines={1}>{live.title}</Text>
        <Text style={styles.liveText}>{compactNumber(live.listenerCount)} listening now</Text>
      </View>
      <View style={styles.livePlay}>
        <Play color="#FFFFFF" fill="#FFFFFF" size={16} />
      </View>
    </Pressable>
  );
}

function CompactEmpty({ icon, title, text, palette }: {
  icon: ReactNode;
  title: string;
  text: string;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.emptyRow}>
      <Info color={palette.blue} size={82} strokeWidth={1.2} style={styles.emptyGhost} />
      <View style={styles.emptyIcon}>{icon}</View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{text}</Text>
      </View>
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingBottom: 140 },
  errorStateInset: { paddingHorizontal: 24 },
  fallbackBack: { marginTop: 48, marginLeft: 24, width: 42, height: 42, justifyContent: 'center' },
  skeletonInset: { marginHorizontal: 24 },
  hero: { height: 280, backgroundColor: palette.surfaceMuted, overflow: 'hidden' },
  heroBack: { position: 'absolute', top: 50, left: 24, width: 30, height: 30, borderRadius: 15, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  heroInfo: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16, backgroundColor: palette.background },
  heroName: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 23, letterSpacing: -0.6 },
  heroHandle: { color: palette.muted, fontFamily: 'DMSans_500Medium', fontSize: 13, marginTop: 4 },
  heroStats: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 4 },
  bioRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 6 },
  heroBio: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 17, flex: 1 },
  followButton: { width: 78, minHeight: 38, borderRadius: 20, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  followText: { color: '#FFFFFF', fontFamily: 'DMSans_500Medium', fontSize: 13 },
  nav: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  loadingState: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingBlock: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  banner: { height: 122, borderRadius: 20, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  avatar: { width: 86, height: 86, borderRadius: 43, overflow: 'hidden', backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, minWidth: 0 },
  stationName: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 24, lineHeight: 29, letterSpacing: -0.6 },
  handle: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 14, marginTop: 3 },
  statsLine: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 5 },
  bio: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  liveButton: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  liveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  inlineError: { color: palette.red, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  tabRail: { gap: 20, paddingTop: 14, paddingHorizontal: 24 },
  tabButton: { minHeight: 42, alignItems: 'center', justifyContent: 'flex-start' },
  tabText: { color: palette.faint, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  tabTextActive: { color: palette.blue },
  tabIndicator: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1, backgroundColor: palette.blue },
  tabPanel: { paddingTop: 18, gap: 22, paddingHorizontal: 24 },
  section: { gap: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 20 },
  sectionAction: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 13 },
  listStack: { paddingTop: 16, gap: 11, paddingHorizontal: 24 },
  audioRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  audioArt: { width: 66, height: 58, borderRadius: 5, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  audioCopy: { flex: 1, minWidth: 0 },
  audioTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 15 },
  audioSubtitle: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  durationLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  durationText: { color: palette.faint, fontSize: 10.5, fontWeight: '700' },
  rowAction: { width: 24, height: 24, borderRadius: 12, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  collectionRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  collectionArt: { width: 66, height: 58, borderRadius: 5, overflow: 'hidden', backgroundColor: palette.blueSoft },
  collectionBadge: { display: 'none' },
  collectionBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  collectionCopy: { flex: 1, minWidth: 0 },
  collectionTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 15 },
  collectionMeta: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 5 },
  liveFeature: { minHeight: 92, borderRadius: 18, backgroundColor: palette.blueSoft, flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12 },
  liveFeatureIcon: { width: 50, height: 50, borderRadius: 8, backgroundColor: `${palette.red}16`, alignItems: 'center', justifyContent: 'center' },
  liveFeatureCopy: { flex: 1, minWidth: 0 },
  livePill: { alignSelf: 'flex-start', minHeight: 20, borderRadius: 4, backgroundColor: `${palette.red}20`, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.red },
  livePillText: { color: palette.red, fontSize: 9, fontWeight: '900' },
  liveTitle: { color: palette.ink, fontSize: 14.5, fontWeight: '900', marginTop: 7 },
  liveText: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
  livePlay: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  aboutCard: { marginTop: 16, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceRaised, padding: 15 },
  description: { color: palette.ink2, fontSize: 12.5, lineHeight: 19 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.line },
  ownerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.blue, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ownerInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  ownerCopy: { flex: 1, paddingLeft: 11 },
  ownerLabel: { color: palette.blue, fontSize: 9.5, fontWeight: '900', letterSpacing: 0 },
  ownerName: { color: palette.ink, fontSize: 13.5, fontWeight: '900', marginTop: 2 },
  ownerHandle: { color: palette.muted, fontSize: 11, marginTop: 1 },
  emptyRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 13, overflow: 'hidden' },
  emptyGhost: { position: 'absolute', right: -10, top: -6, opacity: 0.07 },
  emptyIcon: { width: 44, height: 44, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  emptyCopy: { flex: 1, minWidth: 0 },
  emptyTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  emptyText: { color: palette.muted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
});
