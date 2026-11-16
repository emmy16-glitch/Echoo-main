import { useFocusEffect } from '@react-navigation/native';
import { useLatestRequest } from '@/src/navigation/useLatestRequest';
import { subscribeSessionChanges } from '@/src/services/sessionLifecycle';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import {
  Compass,
  Library,
  Headphones,
  Music2,
  Play,
  Radio,
} from 'lucide-react-native';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  AppState,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { HomeSkeleton } from '@/src/components/DiscoverySkeletons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import {
  EchooAudio,
  EchooBroadcast,
  EchooStation,
  EchooUser,
  getCachedMobileDiscoverySnapshot,
  getCurrentUser,
  getMobileDiscovery,
  hasEchooSession,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type Discovery = Awaited<ReturnType<typeof getMobileDiscovery>>;

const emptyDiscovery: Discovery = {
  stations: [],
  live: [],
  scheduled: [],
  audio: [],
};

const HOME_BACKGROUND_REFRESH_MS = 30_000;
const HOME_RETURN_REFRESH_DEBOUNCE_MS = 12_000;

function compactNumber(value = 0) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value || 0);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function profileInitials(name?: string) {
  const words = String(name || 'Guest').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('');
}

function collapseCollectionReleases(tracks: EchooAudio[], limit = 8) {
  const seenCollectionIds = new Set<string>();
  const seenTrackIds = new Set<string>();
  const releases: EchooAudio[] = [];

  for (const track of tracks) {
    if (!track.id || seenTrackIds.has(track.id)) continue;
    seenTrackIds.add(track.id);
    const collectionId = String(track.collectionId || '');
    if (collectionId) {
      if (seenCollectionIds.has(collectionId)) continue;
      seenCollectionIds.add(collectionId);
    }

    releases.push(track);
    if (releases.length >= limit) break;
  }

  return releases;
}

export default function HomeScreen() {
  const viewerRequests = useLatestRequest();
  const { push } = useGuardedRouter();
  const playback = usePlayback();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [discovery, setDiscovery] = useState<Discovery>(emptyDiscovery);
  const [viewer, setViewer] = useState<EchooUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const hasLoadedOnce = useRef(false);
  const loadingHomeRef = useRef(false);
  const lastBackgroundRefreshAtRef = useRef(0);

  const loadHome = useCallback(async (force = false, silent = false) => {
    if (loadingHomeRef.current) return;
    loadingHomeRef.current = true;

    if (force && !silent) setRefreshing(true);
    else if (!silent) setLoading(true);

    try {
      const next = await getMobileDiscovery({ force });
      setDiscovery(next);

      setError('');
    } catch (loadError: any) {
      if (!silent) {
        setError(friendlyErrorMessage(loadError, 'Could not load Echoo right now.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOnce.current = true;
      loadingHomeRef.current = false;
    }
  }, []);

  useEffect(() => {
    const loadViewer = () => {
      const active = viewerRequests.begin();
      setViewer(null);
      void hasEchooSession().then(async (session) => {
        const next = session ? await getCurrentUser() : null;
        if (active()) setViewer(next);
      }).catch(() => { if (active()) setViewer(null); });
    };
    loadViewer();
    return subscribeSessionChanges(loadViewer);
  }, [viewerRequests]);

  useEffect(() => {
    let active = true;

    const hydrateThenRefresh = async () => {
      let hydrated = false;

      if (!hasLoadedOnce.current) {
        const cachedDiscovery = await getCachedMobileDiscoverySnapshot();
        if (!active) return;

        if (cachedDiscovery) {
          setDiscovery(cachedDiscovery);
          hydrated = true;
        }

        if (hydrated) setLoading(false);
      }

      if (active) loadHome(false, hydrated || hasLoadedOnce.current);
    };

    hydrateThenRefresh();
    return () => {
      active = false;
    };
  }, [loadHome]);

  useFocusEffect(
    useCallback(() => {
      let appState = AppState.currentState;

      const refreshInBackground = () => {
        const now = Date.now();
        if (
          !hasLoadedOnce.current ||
          loadingHomeRef.current ||
          now - lastBackgroundRefreshAtRef.current < HOME_RETURN_REFRESH_DEBOUNCE_MS
        ) {
          return;
        }

        lastBackgroundRefreshAtRef.current = now;
        void loadHome(true, true);
      };

      // A live broadcast can start or end while Home is already open. Keep
      // discovery current without disturbing the listener's scroll position.
      const interval = setInterval(refreshInBackground, HOME_BACKGROUND_REFRESH_MS);
      const subscription = AppState.addEventListener('change', (nextAppState) => {
        const returnedToApp =
          (appState === 'background' || appState === 'inactive') && nextAppState === 'active';
        appState = nextAppState;
        if (returnedToApp) refreshInBackground();
      });

      refreshInBackground();
      return () => {
        clearInterval(interval);
        subscription.remove();
      };
    }, [loadHome])
  );


  const published = collapseCollectionReleases(discovery.audio, 8);
  const freshReleaseQueue = useMemo<AudioPlaybackItem[]>(
    () => published.map((track) => ({
      kind: 'audio',
      id: track.id,
      title: track.title,
      subtitle: track.subtitle || track.artistName || track.genre || 'Echoo Audio',
      coverArt: track.coverArt || '',
      fileUrl: track.fileUrl || '',
      genre: track.genre || '',
      stationId: track.stationId || '',
      stationName: track.stationName || track.artistName || '',
      collectionId: track.collectionId || '',
      collectionName: track.collectionName || '',
    })),
    [published]
  );
  const liveNow = uniqueById<EchooBroadcast>(discovery.live).slice(0, 8);
  const featuredLive = liveNow[0];
  const topStations = uniqueById<EchooStation>(discovery.stations)
    .sort(
      (a, b) =>
        (b.listenerCount || 0) - (a.listenerCount || 0) ||
        (b.followerCount || 0) - (a.followerCount || 0)
    )
    .slice(0, 6);

  const openAudio = (track: EchooAudio) => {
    push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: track.subtitle || track.artistName || track.genre || 'Echoo Audio',
        coverArt: track.coverArt || '',
        fileUrl: track.fileUrl || '',
        genre: track.genre || '',
        stationId: track.stationId || '',
        stationName: track.stationName || track.artistName || '',
      },
    });
  };

  const openFreshRelease = async (track: EchooAudio) => {
    const index = freshReleaseQueue.findIndex((item) => item.id === track.id);
    void playback.playAudioQueue(freshReleaseQueue, Math.max(0, index)).catch(() => undefined);
    openAudio(track);
  };

  const openLiveRoom = (item: EchooBroadcast) => {
    push({
      pathname: '/live-room',
      params: {
        broadcastId: item.id,
        title: item.title,
        stationName: item.stationName || 'Echoo Station',
        stationId: item.stationId || '',
        coverArt: item.coverArt || '',
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHome(true)}
            tintColor={palette.blue}
            colors={[palette.blue]}
          />
        }
      >
        <Pressable style={styles.avatarButton} onPress={() => push('/profile')} accessibilityLabel="Open your profile">
          {viewer?.avatar ? <Image source={{ uri: viewer.avatar }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Text style={styles.avatarInitial}>{profileInitials(viewer?.displayName || viewer?.username)}</Text>}
        </Pressable>

        {loading && !topStations.length && !published.length && !featuredLive ? <HomeSkeleton /> : <>
        <HomeHeroCarousel live={featuredLive} onLivePress={() => featuredLive ? openLiveRoom(featuredLive) : push('/live')} onBrowsePress={() => push('/search')} onLibraryPress={() => push('/library')} palette={palette} />

        {!loading && error ? <ListenerToast message={error} /> : null}

        <SectionHeader
          title="Popular Channel"
          action="See All"
          onPress={() => push('/popular-channels')}
          palette={palette}
        />
        {topStations.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.channelRail}
          >
            {topStations.map((station) => (
              <Pressable
                key={station.id}
                style={styles.channelCard}
                onPress={() => push({ pathname: '/station', params: { stationId: station.id } })}
              >
                <Artwork uri={station.coverArt} style={styles.channelArt} palette={palette} />
                <Text style={styles.channelTitle} numberOfLines={1}>{station.name}</Text>
                <Text style={styles.channelMeta} numberOfLines={1}>
                  {station.isLive ? 'Live now' : `${compactNumber(station.followerCount)} followers`}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : !loading ? (
          <EmptyRow
            icon={<Radio color={palette.blue} size={22} />}
            backgroundIcon="station"
            title="Channels are warming up"
            subtitle="Popular channels appear as listeners grow."
            palette={palette}
          />
        ) : null}

        <SectionHeader
          title="Made for you"
          action="See All"
          onPress={() => push('/made-for-you')}
          palette={palette}
          extraTopSpace
        />
        {published.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.releaseRail}
          >
            {published.map((track: EchooAudio) => (
              <Pressable key={track.id} style={styles.releaseCard} onPress={() => void openFreshRelease(track)}>
                <Artwork uri={track.coverArt} style={styles.releaseArt} palette={palette} />
                <Text style={styles.releaseTitle} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.releaseSubtitle} numberOfLines={1}>
                  {track.subtitle || track.artistName || track.genre || 'Echoo Audio'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : !loading ? (
          <EmptyRow
            icon={<Music2 color={palette.blue} size={22} />}
            backgroundIcon="music"
            title="Audio is coming"
            subtitle="New uploads will land here."
            palette={palette}
          />
        ) : null}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

function HomeHeroCarousel({ live, onLivePress, onBrowsePress, onLibraryPress, palette }: { live?: EchooBroadcast; onLivePress: () => void; onBrowsePress: () => void; onLibraryPress: () => void; palette: EchooColors }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 48;
  const [page, setPage] = useState(0);
  const heroStyles = useMemo(() => createStyles(palette), [palette]);
  const cards = [
    { key: 'live', label: live ? 'Live Now' : 'Live on Echoo', title: live?.title || 'Find a voice to listen to live', button: live ? 'Listen' : 'Explore live', onPress: onLivePress, live: Boolean(live), icon: <Radio color={palette.blue} size={42} strokeWidth={1.65} /> },
    { key: 'discover', label: 'Discover more', title: 'Good audio stays with you, wherever you go.', button: 'Explore audio', onPress: onBrowsePress, live: false, icon: <Compass color={palette.blue} size={42} strokeWidth={1.65} /> },
    { key: 'library', label: 'Your listening space', title: 'Keep your favourite audio close.', button: 'Open library', onPress: onLibraryPress, live: false, icon: <Library color={palette.blue} size={42} strokeWidth={1.65} /> },
  ];
  return <View style={heroStyles.carouselWrap}>
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} decelerationRate="fast" onMomentumScrollEnd={(event) => setPage(Math.min(2, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / cardWidth))))}>
      {cards.map((card) => <View key={card.key} style={{ width: cardWidth, paddingVertical: 7, paddingHorizontal: 3 }}><View style={heroStyles.carouselCard}>
        <View pointerEvents="none" style={heroStyles.carouselIcon}>{card.icon}</View>
        <View style={heroStyles.liveHeroStatus}>{card.live ? <View style={heroStyles.liveHeroDot} /> : null}<Text style={heroStyles.liveHeroStatusText}>{card.label}</Text></View>
        <Text style={heroStyles.carouselTitle} numberOfLines={2}>{card.title}</Text>
        <Pressable style={heroStyles.listenButton} onPress={card.onPress} accessibilityRole="button" accessibilityLabel={card.button}><Play color="#FFFFFF" fill="#FFFFFF" size={16} /><Text style={heroStyles.listenButtonText}>{card.button}</Text></Pressable>
      </View></View>)}
    </ScrollView>
    <View style={heroStyles.carouselDots}>{cards.map((card, index) => <View key={card.key} style={[heroStyles.carouselDot, index === page && heroStyles.carouselDotActive]} />)}</View>
  </View>;
}

function Artwork({
  uri,
  style,
  palette,
}: {
  uri?: string | null;
  style: object;
  palette: EchooColors;
}) {
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: palette.surfaceMuted }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={180} />
      ) : (
        <LinearGradient
          colors={[palette.blueDeep, palette.surfaceMuted]}
          style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
        >
          <Music2 color="rgba(255,255,255,0.9)" size={28} />
        </LinearGradient>
      )}
    </View>
  );
}

function SectionHeader({
  title,
  action,
  onPress,
  palette,
  extraTopSpace = false,
}: {
  title: string;
  action: string;
  onPress: () => void;
  palette: EchooColors;
  extraTopSpace?: boolean;
}) {
  const sectionStyles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={[sectionStyles.sectionHeader, extraTopSpace && sectionStyles.sectionHeaderSpaced]}>
      <Text style={sectionStyles.sectionTitle}>{title}</Text>
      <Pressable onPress={onPress} hitSlop={8}>
        <Text style={sectionStyles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  );
}

function EmptyRow({
  icon,
  backgroundIcon,
  title,
  subtitle,
  palette,
}: {
  icon: ReactNode;
  backgroundIcon: 'music' | 'live' | 'station';
  title: string;
  subtitle: string;
  palette: EchooColors;
}) {
  const emptyStyles = useMemo(() => createStyles(palette), [palette]);
  const BackgroundIcon = backgroundIcon === 'live' ? Headphones : backgroundIcon === 'station' ? Radio : Music2;

  return (
    <View style={emptyStyles.emptyRow}>
      <BackgroundIcon
        color={palette.blue}
        size={92}
        strokeWidth={1.3}
        style={emptyStyles.emptyBackgroundIcon}
      />
      <View style={emptyStyles.emptyIcon}>{icon}</View>
      <View style={emptyStyles.emptyCopy}>
        <Text style={emptyStyles.emptyTitle}>{title}</Text>
        <Text style={emptyStyles.emptyText}>{subtitle}</Text>
      </View>
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 24, paddingTop: 15, paddingBottom: 150 },
  avatarButton: { width: 49, height: 49, borderRadius: 25, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 36 },
  avatarInitial: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 23 },
  carouselWrap: {},
  carouselCard: {
    minHeight: 138,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 17,
    paddingVertical: 11,
    justifyContent: 'center',
    shadowColor: palette.ink,
    shadowOpacity: 0.05,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  carouselIcon: { position: 'absolute', right: 18, top: 18, width: 58, height: 58, borderRadius: 18, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center', opacity: 0.9 },
  carouselTitle: { color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 20, lineHeight: 24, letterSpacing: -0.7, marginTop: 5, paddingRight: 62 },
  carouselDots: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 7, marginTop: 7 },
  carouselDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.lineStrong },
  carouselDotActive: { width: 17, borderRadius: 4, backgroundColor: palette.blue },
  liveHero: { paddingTop: 0, paddingBottom: 16, minHeight: 175 },
  emptyLiveHero: { minHeight: 130 },
  liveHeroStatus: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  liveHeroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.red },
  liveHeroStatusText: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 14 },
  liveHeroTitle: { color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 32, lineHeight: 40, letterSpacing: -1.6, marginTop: 7 },
  emptyLiveHeroTitle: { fontFamily: 'DMSans_500Medium', fontSize: 20, lineHeight: 27, letterSpacing: -0.5 },
  listenButton: { alignSelf: 'flex-start', height: 34, minWidth: 96, borderRadius: 18, backgroundColor: palette.blue, paddingHorizontal: 14, marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  listenButtonText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 14 },
  loadingState: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  notice: { marginTop: 18, backgroundColor: palette.surfaceRaised, borderRadius: 8, padding: 15 },
  noticeTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  noticeText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionHeader: {
    marginTop: 26,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderSpaced: { marginTop: 42 },
  sectionTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 20, letterSpacing: -0.6 },
  sectionAction: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 14 },
  channelRail: { gap: 16, paddingRight: 18 },
  channelCard: { width: 151 },
  channelArt: { width: 151, height: 153, borderRadius: 20 },
  channelTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 17, marginTop: 12 },
  channelMeta: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13.5, marginTop: 3 },
  releaseRail: { gap: 16, paddingRight: 18 },
  releaseCard: { width: 151 },
  releaseArt: { width: 151, height: 153, borderRadius: 20 },
  releaseTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 13.5, marginTop: 9 },
  releaseSubtitle: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 11.5, marginTop: 3 },
  liveRail: { gap: 14, paddingRight: 18 },
  liveCard: {
    width: 246,
    minHeight: 282,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.surfaceRaised,
  },
  liveArt: { width: '100%', height: 184, borderRadius: 0 },
  liveBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    height: 25,
    borderRadius: 5,
    backgroundColor: 'rgba(5,3,10,0.82)',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.red },
  liveBadgeText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900' },
  liveCopy: { padding: 13, paddingRight: 54 },
  liveTitle: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  liveSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
  liveMeta: { color: palette.faint, fontSize: 10.5, marginTop: 5 },
  livePlay: {
    position: 'absolute',
    right: 13,
    bottom: 17,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationList: { gap: 1 },
  personalStack: { gap: 4 },
  personalRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 5,
  },
  personalIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: palette.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personalArt: { width: 50, height: 50, borderRadius: 8 },
  personalCopy: { flex: 1, minWidth: 0 },
  personalTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  personalText: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
  liveTinyBadge: {
    minHeight: 22,
    borderRadius: 4,
    backgroundColor: `${palette.red}20`,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTinyText: { color: palette.red, fontSize: 9, fontWeight: '900' },
  stationRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  rank: { width: 28, color: palette.faint, fontSize: 11, fontWeight: '800' },
  stationArt: { width: 56, height: 56, borderRadius: 7 },
  stationCopy: { flex: 1, paddingHorizontal: 12 },
  stationTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  stationSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
  stationMeta: { color: palette.muted, fontSize: 10.5, fontWeight: '800' },
  emptyRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceRaised,
    borderRadius: 8,
    padding: 12,
    gap: 12,
    overflow: 'hidden',
  },
  emptyBackgroundIcon: {
    position: 'absolute',
    right: -14,
    top: -9,
    opacity: 0.08,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: palette.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  emptyText: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
});
