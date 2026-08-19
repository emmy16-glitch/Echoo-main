import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpenText,
  Dumbbell,
  Headphones,
  Menu,
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

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EchooAudio,
  EchooBroadcast,
  EchooStation,
  getMobileDiscovery,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type Discovery = {
  stations: EchooStation[];
  live: EchooBroadcast[];
  scheduled: EchooBroadcast[];
  audio: EchooAudio[];
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    getMobileDiscovery()
      .then((next) => {
        if (!active) return;
        setDiscovery(next);
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

  const liveNow = discovery.live.slice(0, 8);
  const topStations = [...discovery.stations]
    .sort(
      (a, b) =>
        (b.listenerCount || 0) - (a.listenerCount || 0) ||
        (b.followerCount || 0) - (a.followerCount || 0)
    )
    .slice(0, 5);

  const featuredAudio = discovery.audio[0];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} accessibilityLabel="Open menu">
            <Menu color={palette.ink} size={25} strokeWidth={2.1} />
          </Pressable>

          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <View style={[styles.brandDot, styles.brandDotOne]} />
              <View style={[styles.brandDot, styles.brandDotTwo]} />
              <View style={[styles.brandDot, styles.brandDotThree]} />
            </View>
            <Text style={styles.brandText}>echoo</Text>
          </View>

          <Pressable style={styles.notificationButton} accessibilityLabel="Notifications">
            <Bell color={palette.ink} size={23} strokeWidth={2.1} />
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>3</Text>
            </View>
          </Pressable>
        </View>

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
            <LinearGradient
              colors={['#4378FF', '#2155EA']}
              style={styles.listenOrb}
            >
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

        <SectionHeader
          title="Live now"
          action="View all"
          palette={palette}
          onPress={() => router.push('/live')}
        />

        {liveNow.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.liveRail}
          >
            {liveNow.map((item) => (
              <LiveCard
                key={item.id}
                item={item}
                palette={palette}
                onPress={() => router.push('/live')}
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

        <SectionHeader title="Categories" action="View all" palette={palette} />
        <View style={styles.categoryRow}>
          {categories.map(({ label, icon: Icon }) => (
            <Pressable
              key={label}
              style={styles.categoryCard}
              onPress={() => router.push('/search')}
            >
              <Icon color={palette.blue} size={21} strokeWidth={2.1} />
              <Text style={styles.categoryText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Top stations" action="View all" palette={palette} />
        <View style={styles.stationList}>
          {topStations.length ? (
            topStations.map((station) => (
              <StationRow key={station.id} station={station} palette={palette} />
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

      {featuredAudio ? (
        <View style={styles.miniPlayer}>
          <View style={styles.miniArt}>
            {featuredAudio.coverArt ? (
              <Image source={{ uri: featuredAudio.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <Music2 color="#FFFFFF" size={18} />
            )}
          </View>
          <View style={styles.miniCopy}>
            <Text style={styles.miniTitle} numberOfLines={1}>{featuredAudio.title}</Text>
            <Text style={styles.miniSubtitle} numberOfLines={1}>{featuredAudio.subtitle || 'Echoo Audio'}</Text>
          </View>
          <Pressable style={styles.miniPlayButton}>
            <Play color="#FFFFFF" fill="#FFFFFF" size={17} />
          </Pressable>
        </View>
      ) : null}
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
      <LinearGradient
        colors={['rgba(4,9,22,0.03)', 'rgba(4,9,22,0.92)']}
        style={StyleSheet.absoluteFillObject}
      />
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

function StationRow({ station, palette }: { station: EchooStation; palette: EchooColors }) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.stationRow}>
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
      <Pressable style={styles.stationPlayButton}>
        <Play color="#FFFFFF" fill="#FFFFFF" size={16} />
      </Pressable>
    </View>
  );
}

const createStyles = (palette: EchooColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 130 },
    topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    brandMark: { width: 26, height: 26 },
    brandDot: { position: 'absolute', width: 13, height: 13, borderRadius: 7 },
    brandDotOne: { left: 1, top: 6, backgroundColor: '#2F63F6' },
    brandDotTwo: { right: 1, top: 2, backgroundColor: '#4B7BFF' },
    brandDotThree: { right: 3, bottom: 1, backgroundColor: '#7E9DFF', opacity: 0.78 },
    brandText: { color: palette.ink, fontSize: 22, fontWeight: '900', letterSpacing: -0.8 },
    notificationButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line },
    notificationBadge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
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
    miniPlayer: { position: 'absolute', left: 14, right: 14, bottom: 8, height: 64, borderRadius: 18, backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, gap: 10, shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
    miniArt: { width: 46, height: 46, borderRadius: 12, backgroundColor: palette.blueDeep, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    miniCopy: { flex: 1 },
    miniTitle: { color: palette.ink, fontSize: 13, fontWeight: '800' },
    miniSubtitle: { color: palette.muted, fontSize: 11, marginTop: 2 },
    miniPlayButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  });
