import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bell,
  BookOpen,
  ChevronDown,
  Clock3,
  Headphones,
  Info,
  ListMusic,
  MoreVertical,
  Music2,
  Play,
  Radio,
  Search,
} from 'lucide-react-native';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioRowActions } from '@/src/components/AudioRowActions';
import { ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
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

type StationTab = 'home' | 'audio' | 'live' | 'collections' | 'about';
type StationScreenSnapshot = {
  station: EchooStation | null;
  live: EchooBroadcast | null;
  publishedAudio: EchooAudio[];
  collections: EchooPlaylist[];
  signedIn: boolean;
  following: boolean;
};

const stationScreenCache = new Map<string, StationScreenSnapshot>();

const tabs: { key: StationTab; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'audio', label: 'Audio' },
  { key: 'live', label: 'Live' },
  { key: 'collections', label: 'Collections' },
  { key: 'about', label: 'About' },
];

function getInitialTab(value?: string): StationTab {
  return tabs.some((tab) => tab.key === value) ? (value as StationTab) : 'home';
}

function formatDuration(seconds = 0) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function compactNumber(value = 0) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value || 0);
}

function formatDate(value?: string) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function StationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stationId?: string; tab?: StationTab }>();
  const stationId = String(params.stationId || '');
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
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

  const load = useCallback(async (force = false, silent = false) => {
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

      setSignedIn(session);
      setStation(nextStation);
      setLive(nextLive);

      const ownerId = nextStation?.owner?.id || '';
      const [audioRows, collectionRows] = await Promise.all([
        getPublicAudioByCreator(ownerId, { force }).catch((audioError) => {
          setContentError(friendlyErrorMessage(audioError, 'Could not load station content.'));
          return [];
        }),
        getPublicCollectionsForStation(stationId, { force }).catch(() => []),
      ]);
      setPublishedAudio(audioRows);
      setCollections(collectionRows);

      let nextFollowing = false;
      if (session) {
        const followed = await getFollowedStations({ force }).catch(() => []);
        nextFollowing = followed.some((item: EchooStation) => item.id === stationId);
      }
      setFollowing(nextFollowing);

      stationScreenCache.set(stationId, {
        station: nextStation,
        live: nextLive,
        publishedAudio: audioRows,
        collections: collectionRows,
        signedIn: session,
        following: nextFollowing,
      });
    } catch (loadError: any) {
      setError(friendlyErrorMessage(loadError, 'Could not load this station.'));
    } finally {
      setLoading(false);
      setContentLoading(false);
      setRefreshing(false);
    }
  }, [stationId]);

  useEffect(() => {
    load(false, Boolean(stationScreenCache.get(stationId)));
  }, [load]);

  const toggleFollow = async () => {
    if (!stationId) return;
    if (!signedIn) {
      router.push('/auth');
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
    if (!signedIn) {
      router.push('/auth');
      return;
    }
    router.push({
      pathname: '/live-room',
      params: {
        broadcastId: live.id,
        title: live.title,
        stationName: station?.name || live.stationName || 'Echoo Station',
        coverArt: live.coverArt || station?.coverArt || '',
      },
    });
  };

  const openAudio = (track: EchooAudio, collection?: EchooPlaylist) => {
    router.push({
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
    router.push({
      pathname: '/collection' as any,
      params: { collectionId: collection.id, stationId, stationName: station?.name || '' },
    });
  };

  const featuredAudio = publishedAudio[0] || null;
  const featuredCollection = collections[0] || null;

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

    if (activeTab === 'home') {
      return (
        <View style={styles.tabPanel}>
          {live ? <LiveFeature live={live} onPress={openLive} palette={palette} /> : null}
          {featuredAudio ? (
            <Section title="Latest audio" action="View all" onAction={() => setActiveTab('audio')} palette={palette}>
              <AudioRow track={featuredAudio} station={station} onPress={() => openAudio(featuredAudio)} palette={palette} />
            </Section>
          ) : null}
          {featuredCollection ? (
            <Section title="Collections" action="View all" onAction={() => setActiveTab('collections')} palette={palette}>
              <CollectionRow collection={featuredCollection} onPress={() => openCollection(featuredCollection)} palette={palette} />
            </Section>
          ) : null}
          {!live && !featuredAudio && !featuredCollection ? (
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
            <AudioRow key={track.id} track={track} station={station} onPress={() => openAudio(track)} palette={palette} />
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

    return (
      <View style={styles.aboutCard}>
        <Text style={styles.description}>
          {station?.description || 'This station has not added a public description yet.'}
        </Text>
        {station?.owner ? (
          <View style={styles.ownerRow}>
            <View style={styles.ownerAvatar}>
              {station.owner.avatar ? (
                <Image source={{ uri: station.owner.avatar }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <Text style={styles.ownerInitial}>{station.owner.displayName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.ownerCopy}>
              <Text style={styles.ownerLabel}>CREATOR</Text>
              <Text style={styles.ownerName}>{station.owner.displayName}</Text>
              <Text style={styles.ownerHandle}>@{station.owner.username}</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
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
        <View style={styles.nav}>
          <Pressable style={styles.iconButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <ChevronDown color={palette.ink} size={26} style={styles.backIcon} />
          </Pressable>
          <View style={styles.navActions}>
            <Pressable style={styles.iconButton} onPress={() => router.push('/search')} accessibilityLabel="Search">
              <Search color={palette.ink} size={23} />
            </Pressable>
            <Pressable style={styles.iconButton} accessibilityLabel="More options">
              <MoreVertical color={palette.ink} size={22} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <ListenerSkeletonRows count={5} />
        ) : null}

        {!loading && error && !station ? (
          <ListenerEmptyState
            title="Station unavailable"
            subtitle={error}
            action="Try again"
            onAction={() => load(true)}
            icon={<Radio color={palette.blue} size={25} />}
          />
        ) : null}

        {!loading && station ? (
          <>
            <View style={styles.banner}>
              {station.coverArt ? (
                <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <LinearGradient colors={[palette.blue, palette.night2]} style={StyleSheet.absoluteFillObject} />
              )}
            </View>

            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                {station.coverArt ? (
                  <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : (
                  <Radio color="#FFFFFF" size={28} />
                )}
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.stationName} numberOfLines={2}>{station.name}</Text>
                <Text style={styles.handle} numberOfLines={1}>
                  @{station.owner?.username || station.name.toLowerCase().replace(/\s+/g, '')}
                </Text>
                <Text style={styles.statsLine} numberOfLines={1}>
                  {compactNumber(station.followerCount)} followers - {publishedAudio.length} audio - {collections.length} collections
                </Text>
              </View>
            </View>

            <Text style={styles.bio} numberOfLines={2}>
              {station.description || station.category || 'Live audio, teachings, conversations and station collections.'}
            </Text>

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.followButton, following && styles.followButtonActive]}
                onPress={toggleFollow}
                disabled={followBusy}
              >
                {followBusy ? (
                  <ActivityIndicator color={following ? '#FFFFFF' : palette.blue} />
                ) : (
                  <Bell color={following ? '#FFFFFF' : palette.blue} size={19} />
                )}
                <Text style={[styles.followText, following && styles.followTextActive]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
              {live ? (
                <Pressable style={styles.liveButton} onPress={openLive}>
                  <Headphones color="#FFFFFF" size={18} />
                  <Text style={styles.liveButtonText}>Live now</Text>
                </Pressable>
              ) : null}
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
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
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
        <Text style={styles.audioTitle} numberOfLines={2}>{track.title}</Text>
        <Text style={styles.audioSubtitle} numberOfLines={1}>
          {station?.name || track.artistName || 'Echoo'} - {compactNumber(track.playCount)} plays
        </Text>
        <View style={styles.durationLine}>
          <Clock3 color={palette.faint} size={12} />
          <Text style={styles.durationText}>{formatDuration(track.duration)}</Text>
        </View>
      </View>
      <View style={styles.rowAction}>
        <Play color={palette.ink} fill={palette.ink} size={15} />
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
  const isSeries = collection.mode === 'series';
  return (
    <Pressable style={styles.collectionRow} onPress={onPress}>
      <View style={styles.collectionArt}>
        {collection.coverArt ? (
          <Image source={{ uri: collection.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <LinearGradient colors={[palette.blueDeep, palette.blue]} style={StyleSheet.absoluteFillObject} />
        )}
        <View style={styles.collectionBadge}>
          {isSeries ? <BookOpen color="#FFFFFF" size={13} /> : <ListMusic color="#FFFFFF" size={13} />}
          <Text style={styles.collectionBadgeText}>{collection.trackCount ?? collection.tracks.length}</Text>
        </View>
      </View>
      <View style={styles.collectionCopy}>
        <Text style={styles.collectionTitle} numberOfLines={2}>{collection.name}</Text>
        <Text style={styles.collectionMeta} numberOfLines={1}>
          {isSeries ? 'Series' : 'Playlist'} - Updated {formatDate(collection.updatedAt || collection.createdAt)}
        </Text>
      </View>
      <MoreVertical color={palette.muted} size={18} />
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
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 88 },
  nav: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backIcon: { transform: [{ rotate: '90deg' }] },
  loadingState: { minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingBlock: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  banner: { height: 122, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 },
  avatar: { width: 86, height: 86, borderRadius: 43, overflow: 'hidden', backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  profileCopy: { flex: 1, minWidth: 0 },
  stationName: { color: palette.ink, fontSize: 27, lineHeight: 31, fontWeight: '900', letterSpacing: 0 },
  handle: { color: palette.ink2, fontSize: 13, fontWeight: '700', marginTop: 3 },
  statsLine: { color: palette.muted, fontSize: 12, marginTop: 5 },
  bio: { color: palette.ink2, fontSize: 12.5, lineHeight: 18, marginTop: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  followButton: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  followButtonActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  followText: { color: palette.blue, fontSize: 13, fontWeight: '900' },
  followTextActive: { color: '#FFFFFF' },
  liveButton: { flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  liveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  inlineError: { color: palette.red, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  tabRail: { gap: 22, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: palette.line },
  tabButton: { minHeight: 42, alignItems: 'center', justifyContent: 'flex-start' },
  tabText: { color: palette.muted, fontSize: 14, fontWeight: '800' },
  tabTextActive: { color: palette.ink },
  tabIndicator: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1, backgroundColor: palette.ink },
  tabPanel: { paddingTop: 18, gap: 22 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  sectionAction: { color: palette.blue, fontSize: 12, fontWeight: '900' },
  listStack: { paddingTop: 16, gap: 11 },
  audioRow: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  audioArt: { width: 72, height: 72, borderRadius: 7, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  audioCopy: { flex: 1, minWidth: 0 },
  audioTitle: { color: palette.ink, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  audioSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
  durationLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  durationText: { color: palette.faint, fontSize: 10.5, fontWeight: '700' },
  rowAction: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  collectionRow: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  collectionArt: { width: 112, height: 68, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.blueSoft },
  collectionBadge: { position: 'absolute', right: 6, bottom: 6, minHeight: 22, borderRadius: 4, backgroundColor: 'rgba(2,4,8,0.74)', paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  collectionBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  collectionCopy: { flex: 1, minWidth: 0 },
  collectionTitle: { color: palette.ink, fontSize: 14.5, lineHeight: 18, fontWeight: '900' },
  collectionMeta: { color: palette.muted, fontSize: 11.5, marginTop: 5 },
  liveFeature: { minHeight: 92, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', padding: 13, gap: 12 },
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
