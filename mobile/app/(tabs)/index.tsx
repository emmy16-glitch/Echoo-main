import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  Headphones,
  Library,
  Music2,
  Play,
  Radio,
  Search,
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
import { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerTopBar } from '@/src/components/ListenerV2';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EchooAudio,
  EchooBroadcast,
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

const quickSearches = ['Music', 'Talk', 'Worship', 'News'];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function compactNumber(value = 0) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value || 0);
}

export default function HomeScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [discovery, setDiscovery] = useState<Discovery>(emptyDiscovery);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    Promise.all([getMobileDiscovery(), hasEchooSession()])
      .then(([next, activeSession]) => {
        if (!active) return;
        setDiscovery(next);
        setSignedIn(activeSession);
        setError('');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError?.message || 'Could not load Echoo right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const published = discovery.audio.slice(0, 8);
  const liveNow = discovery.live.slice(0, 8);
  const topStations = [...discovery.stations]
    .sort(
      (a, b) =>
        (b.listenerCount || 0) - (a.listenerCount || 0) ||
        (b.followerCount || 0) - (a.followerCount || 0)
    )
    .slice(0, 6);

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

  const openLiveRoom = (item: EchooBroadcast) => {
    if (!signedIn) {
      router.push('/auth');
      return;
    }
    router.push({
      pathname: '/live-room',
      params: {
        broadcastId: item.id,
        title: item.title,
        stationName: item.stationName || 'Echoo Station',
        coverArt: item.coverArt || '',
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ListenerTopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeRow}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.welcomeTitle}>Listen now</Text>
          </View>
          <Pressable
            style={styles.searchButton}
            onPress={() => router.push('/search')}
            accessibilityLabel="Search Echoo"
          >
            <Search color={palette.ink} size={21} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRail}
        >
          {quickSearches.map((label) => (
            <Pressable
              key={label}
              style={styles.chip}
              onPress={() => router.push({ pathname: '/search', params: { q: label } })}
            >
              <Text style={styles.chipText}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Loading your Echoo...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Echoo is temporarily quiet</Text>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        <SectionHeader
          title="Fresh releases"
          action="Search"
          onPress={() => router.push('/search')}
          palette={palette}
        />
        {published.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.releaseRail}
          >
            {published.map((track: EchooAudio) => (
              <Pressable key={track.id} style={styles.releaseCard} onPress={() => openAudio(track)}>
                <Artwork uri={track.coverArt} style={styles.releaseArt} palette={palette} />
                <Text style={styles.releaseTitle} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.releaseSubtitle} numberOfLines={1}>
                  {track.subtitle || track.artistName || track.genre || 'Echoo Audio'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <EmptyRow
            icon={<Music2 color={palette.blue} size={22} />}
            backgroundIcon="music"
            title="Fresh audio is coming"
            subtitle="New uploads will land here."
            palette={palette}
          />
        )}

        <SectionHeader
          title="Live now"
          action="View all"
          onPress={() => router.push('/live')}
          palette={palette}
        />
        {liveNow.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.liveRail}
          >
            {liveNow.map((item: EchooBroadcast) => (
              <Pressable key={item.id} style={styles.liveCard} onPress={() => openLiveRoom(item)}>
                <Artwork uri={item.coverArt} style={styles.liveArt} palette={palette} />
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
                <View style={styles.liveCopy}>
                  <Text style={styles.liveTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.liveSubtitle} numberOfLines={1}>
                    {item.stationName || 'Echoo Station'}
                  </Text>
                  <Text style={styles.liveMeta}>{compactNumber(item.listenerCount)} listening</Text>
                </View>
                <View style={styles.livePlay}>
                  <Play color="#FFFFFF" fill="#FFFFFF" size={16} />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <EmptyRow
            icon={<Headphones color={palette.red} size={22} />}
            backgroundIcon="live"
            title="No live rooms"
            subtitle="Live shows appear as they start."
            palette={palette}
          />
        )}

        <SectionHeader
          title="Popular stations"
          action="Discover"
          onPress={() => router.push('/search')}
          palette={palette}
        />
        <View style={styles.stationList}>
          {topStations.length ? (
            topStations.map((station, index) => (
              <Pressable
                key={station.id}
                style={styles.stationRow}
                onPress={() => router.push({ pathname: '/station', params: { stationId: station.id } })}
              >
                <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
                <Artwork uri={station.coverArt} style={styles.stationArt} palette={palette} />
                <View style={styles.stationCopy}>
                  <Text style={styles.stationTitle} numberOfLines={1}>{station.name}</Text>
                  <Text style={styles.stationSubtitle} numberOfLines={1}>
                    {station.category || 'Echoo Station'}
                  </Text>
                </View>
                <Text style={styles.stationMeta}>
                  {station.isLive ? 'LIVE' : compactNumber(station.followerCount)}
                </Text>
              </Pressable>
            ))
          ) : (
            <EmptyRow
              icon={<Radio color={palette.blue} size={22} />}
              backgroundIcon="station"
              title="Stations are warming up"
              subtitle="Rankings show as listeners grow."
              palette={palette}
            />
          )}
        </View>

        <Pressable
          style={styles.libraryPrompt}
          onPress={() => router.push(signedIn ? '/library' : '/auth')}
        >
          <View style={styles.libraryIcon}>
            <Library color="#FFFFFF" size={20} />
          </View>
          <View style={styles.libraryCopy}>
            <Text style={styles.libraryTitle}>
              {signedIn ? 'Your library is ready' : 'Keep the audio you love'}
            </Text>
            <Text style={styles.libraryText} numberOfLines={2}>
              {signedIn
                ? 'Open saved audio, followed stations and recent plays.'
                : 'Sign in to save tracks and sync listening across devices.'}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
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
    <View style={[style, stylesForArtwork.frame]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" transition={180} />
      ) : (
        <LinearGradient
          colors={[palette.blueDeep, palette.surfaceMuted]}
          style={[StyleSheet.absoluteFillObject, stylesForArtwork.fallback]}
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
}: {
  title: string;
  action: string;
  onPress: () => void;
  palette: EchooColors;
}) {
  const sectionStyles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={sectionStyles.sectionHeader}>
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

const stylesForArtwork = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#181320' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
});

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 140 },
  welcomeRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  greeting: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  welcomeTitle: { color: palette.ink, fontSize: 30, lineHeight: 34, fontWeight: '900', marginTop: 1 },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRail: { gap: 8, paddingTop: 14, paddingBottom: 0 },
  chip: {
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.surfaceRaised,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: palette.ink2, fontSize: 12, fontWeight: '800' },
  loadingState: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  notice: { marginTop: 18, backgroundColor: palette.surfaceRaised, borderRadius: 8, padding: 15 },
  noticeTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  noticeText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionHeader: {
    marginTop: 25,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  sectionAction: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  releaseRail: { gap: 13, paddingRight: 18 },
  releaseCard: { width: 146 },
  releaseArt: { width: 146, height: 146, borderRadius: 8 },
  releaseTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '800', marginTop: 9 },
  releaseSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
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
  libraryPrompt: {
    marginTop: 24,
    minHeight: 68,
    borderRadius: 8,
    backgroundColor: palette.surfaceRaised,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  libraryIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryCopy: { flex: 1 },
  libraryTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  libraryText: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
});
