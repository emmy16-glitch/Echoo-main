import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText,
  Dumbbell,
  Headphones,
  Heart,
  MessageCircleMore,
  Music2,
  Newspaper,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ListenerTopBar } from '@/src/components/ListenerV2';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EchooBroadcast,
  EchooStation,
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

const categories = [
  { label: 'Worship', icon: Sparkles },
  { label: 'Talk', icon: MessageCircleMore },
  { label: 'Music', icon: Music2 },
  { label: 'News', icon: Newspaper },
  { label: 'Sports', icon: Dumbbell },
];

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

  const liveNow: EchooBroadcast[] = discovery.live.slice(0, 8);
  const topStations: EchooStation[] = [...discovery.stations]
    .sort(
      (a: EchooStation, b: EchooStation) =>
        (b.listenerCount || 0) - (a.listenerCount || 0) ||
        (b.followerCount || 0) - (a.followerCount || 0)
    )
    .slice(0, 5);

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

  const openStation = (station: EchooStation) => {
    router.push({ pathname: '/station', params: { stationId: station.id } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerTopBar />

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.greeting}>{greeting()}, 👋</Text>
            <Text style={styles.heroTitle}>What do you{`\n`}want to listen to?</Text>
            <Text style={styles.heroSubtitle}>
              Discover live stations, shows and podcasts from creators worldwide.
            </Text>
          </View>

          <View style={styles.orbitWrap}>
            <View style={[styles.orbit, styles.orbitLarge]} />
            <View style={[styles.orbit, styles.orbitMedium]} />
            <View style={[styles.orbit, styles.orbitSmall]} />
            <LinearGradient colors={['#4378FF', '#2155EA']} style={styles.listenOrb}>
              <Headphones color="#FFFFFF" size={29} strokeWidth={2.6} />
            </LinearGradient>
            <View style={[styles.orbitPoint, { top: 12, right: 5 }]} />
            <View style={[styles.orbitPoint, { bottom: 23, left: 4 }]} />
          </View>
        </View>

        <View style={styles.searchRow}>
          <Pressable style={styles.searchBox} onPress={() => router.push('/search')}>
            <Search color={palette.muted} size={20} />
            <Text style={styles.searchPlaceholder}>Search stations, shows, podcasts...</Text>
          </Pressable>
          <Pressable style={styles.filterButton} onPress={() => router.push('/search')}>
            <SlidersHorizontal color={palette.ink2} size={20} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Finding what is live on Echoo...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Echoo is temporarily quiet</Text>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        <SectionHeader title="Live now" action="View all" palette={palette} onPress={() => router.push('/live')} />

        {liveNow.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRail}>
            {liveNow.map((item: EchooBroadcast) => (
              <LiveCard
                key={item.id}
                item={item}
                palette={palette}
                onPress={() => openLiveRoom(item)}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyLiveCard}>
            <View style={styles.emptyLiveIcon}>
              <Headphones color={palette.blue} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emptyLiveTitle}>No one is live right now</Text>
              <Text style={styles.emptyLiveText}>Scheduled broadcasts will appear here as soon as they go on air.</Text>
            </View>
          </View>
        )}

        <View style={styles.accountCard}>
          <View style={styles.accountIcon}>
            {signedIn ? <Heart color="#FFFFFF" fill="#FFFFFF" size={21} /> : <Headphones color="#FFFFFF" size={21} />}
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountTitle}>{signedIn ? 'Your Echoo is synced' : 'Make Echoo yours'}</Text>
            <Text style={styles.accountText}>
              {signedIn
                ? 'Saved audio, favorites and history stay with your account.'
                : 'Sign in to save audio, follow stations and sync your listening history.'}
            </Text>
          </View>
          <Pressable style={styles.accountAction} onPress={() => router.push(signedIn ? '/library' : '/auth')}>
            <Text style={styles.accountActionText}>{signedIn ? 'Open' : 'Sign in'}</Text>
          </Pressable>
        </View>

        <SectionHeader title="Categories" action="View all" palette={palette} onPress={() => router.push('/search')} />
        <View style={styles.categoryRow}>
          {categories.map(({ label, icon: Icon }) => (
            <Pressable
              key={label}
              style={styles.categoryCard}
              onPress={() => router.push({ pathname: '/search', params: { q: label } })}
            >
              <Icon color={palette.blue} size={21} strokeWidth={2.1} />
              <Text style={styles.categoryText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Top stations" action="View all" palette={palette} onPress={() => router.push('/search')} />
        <View style={styles.stationList}>
          {topStations.length ? (
            topStations.map((station: EchooStation) => (
              <StationRow
                key={station.id}
                station={station}
                palette={palette}
                onPress={() => openStation(station)}
              />
            ))
          ) : (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>No public stations yet</Text>
              <Text style={styles.noticeText}>Creator stations will appear here once they are published.</Text>
            </View>
          )}
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  action,
  palette,
  onPress,
}: {
  title: string;
  action?: string;
  palette: EchooColors;
  onPress?: () => void;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onPress}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LiveCard({
  item,
  palette,
  onPress,
}: {
  item: EchooBroadcast;
  palette: EchooColors;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable style={styles.liveCard} onPress={onPress}>
      {item.coverArt ? (
        <Image source={{ uri: item.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : (
        <LinearGradient colors={['#0E6D68', '#102A5E']} style={StyleSheet.absoluteFillObject} />
      )}
      <LinearGradient colors={['rgba(4,9,22,0.03)', 'rgba(4,9,22,0.92)']} style={StyleSheet.absoluteFillObject} />
      <View style={styles.liveBadge}>
        <Text style={styles.liveBadgeText}>LIVE</Text>
      </View>
      <View style={styles.liveCardCopy}>
        <Text style={styles.liveCardTitle} numberOfLines={1}>{item.stationName || item.title}</Text>
        <Text style={styles.liveCardSubtitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.listenerLine}>
          <Users color="#FFFFFF" size={13} />
          <Text style={styles.listenerText}>{compactNumber(item.listenerCount || 0)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function StationRow({
  station,
  palette,
  onPress,
}: {
  station: EchooStation;
  palette: EchooColors;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable style={styles.stationRow} onPress={onPress}>
      <View style={styles.stationArt}>
        {station.coverArt ? (
          <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <BookOpenText color="#FFFFFF" size={21} />
        )}
      </View>
      <View style={styles.stationCopy}>
        <Text style={styles.stationTitle} numberOfLines={1}>{station.name}</Text>
        <Text style={styles.stationSubtitle} numberOfLines={1}>{station.category || 'Echoo Station'}</Text>
      </View>
      <View style={styles.stationAudience}>
        <Users color={palette.muted} size={14} />
        <Text style={styles.stationAudienceText}>{compactNumber(station.listenerCount || station.followerCount || 0)}</Text>
      </View>
      {station.isLive ? (
        <View style={styles.stationPlayButton}>
          <Play color="#FFFFFF" fill="#FFFFFF" size={16} />
        </View>
      ) : null}
    </Pressable>
  );
}

const createStyles = (palette: EchooColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 108 },
    hero: { minHeight: 180, flexDirection: 'row', alignItems: 'center', marginTop: 12 },
    heroCopy: { flex: 1, paddingRight: 4 },
    greeting: { color: palette.ink2, fontSize: 15, marginBottom: 7, fontWeight: '600' },
    heroTitle: { color: palette.ink, fontSize: 29, lineHeight: 31, fontWeight: '900', letterSpacing: -1.1 },
    heroSubtitle: { color: palette.muted, fontSize: 13.5, lineHeight: 20, marginTop: 9, maxWidth: 270 },
    orbitWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
    orbit: { position: 'absolute', borderWidth: 1, borderColor: palette.lineStrong, opacity: 0.55 },
    orbitLarge: { width: 122, height: 122, borderRadius: 61 },
    orbitMedium: { width: 92, height: 92, borderRadius: 46 },
    orbitSmall: { width: 67, height: 67, borderRadius: 34 },
    listenOrb: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#2F63F6', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
    orbitPoint: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: palette.blue },
    searchRow: { flexDirection: 'row', gap: 9, marginTop: 8 },
    searchBox: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
    searchPlaceholder: { color: palette.muted, fontSize: 13, flex: 1 },
    filterButton: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
    loadingState: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
    loadingText: { color: palette.muted, fontSize: 13 },
    noticeCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.line, padding: 16, marginTop: 8 },
    noticeTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
    noticeText: { color: palette.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 11 },
    sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
    sectionAction: { color: palette.blue, fontSize: 12, fontWeight: '800' },
    liveRail: { gap: 9, paddingRight: 18 },
    liveCard: { width: 136, height: 158, borderRadius: 15, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
    liveBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: '#FF453A', paddingHorizontal: 6, height: 19, borderRadius: 5, justifyContent: 'center' },
    liveBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
    liveCardCopy: { position: 'absolute', left: 10, right: 9, bottom: 10 },
    liveCardTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
    liveCardSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 10.5, marginTop: 3 },
    listenerLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
    listenerText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '700' },
    emptyLiveCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 14 },
    emptyLiveIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
    emptyLiveTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
    emptyLiveText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    accountCard: { minHeight: 82, marginTop: 18, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
    accountIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
    accountCopy: { flex: 1 },
    accountTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
    accountText: { color: palette.muted, fontSize: 10.8, lineHeight: 15, marginTop: 3 },
    accountAction: { minHeight: 36, borderRadius: 12, backgroundColor: palette.blueSoft, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
    accountActionText: { color: palette.blue, fontSize: 11, fontWeight: '900' },
    categoryRow: { flexDirection: 'row', gap: 8 },
    categoryCard: { flex: 1, minWidth: 0, height: 69, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', gap: 7 },
    categoryText: { color: palette.ink2, fontSize: 10.5, fontWeight: '600' },
    stationList: { gap: 9 },
    stationRow: { minHeight: 70, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', padding: 9, gap: 10 },
    stationArt: { width: 50, height: 50, borderRadius: 12, backgroundColor: palette.blueDeep, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    stationCopy: { flex: 1 },
    stationTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
    stationSubtitle: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
    stationAudience: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stationAudienceText: { color: palette.ink2, fontSize: 11.5, fontWeight: '700' },
    stationPlayButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
    spacer: { height: 24 },
  });
