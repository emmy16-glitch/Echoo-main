import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Clock3, Headphones, Radio, Users } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ListenerEmptyState,
  ListenerListRow,
  ListenerPageHeader,
  ListenerSectionHeader,
  ListenerTopBar,
} from '@/src/components/ListenerV2';
import {
  EchooBroadcast,
  getMobileDiscovery,
  hasEchooSession,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function LiveScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [live, setLive] = useState<EchooBroadcast[]>([]);
  const [scheduled, setScheduled] = useState<EchooBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, activeSession] = await Promise.all([
        getMobileDiscovery(),
        hasEchooSession(),
      ]);
      setLive(data.live);
      setScheduled(data.scheduled);
      setSignedIn(activeSession);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load live broadcasts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const featured = live[0];
  const liveAudience = live.reduce((sum, item) => sum + (item.listenerCount || 0), 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerTopBar />
        <ListenerPageHeader
          eyebrow="ON AIR"
          title="Live on Echoo"
          subtitle="Join creators as they broadcast in real time, or see what is starting soon."
        />

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Checking who is live...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <ListenerEmptyState
            title="Live discovery is unavailable"
            subtitle={error}
            action="Try again"
            onAction={load}
          />
        ) : null}

        {!loading && !error && featured ? (
          <Pressable style={styles.featuredCard} onPress={() => !signedIn && router.push('/auth')}>
            {featured.coverArt ? (
              <Image source={{ uri: featured.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <LinearGradient colors={['#123E85', '#071126']} style={StyleSheet.absoluteFillObject} />
            )}
            <LinearGradient
              colors={['rgba(2,8,24,0.12)', 'rgba(2,8,24,0.94)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE NOW</Text>
            </View>
            <View style={styles.featuredCopy}>
              <Text style={styles.featuredStation} numberOfLines={1}>{featured.stationName || 'Echoo Station'}</Text>
              <Text style={styles.featuredTitle} numberOfLines={2}>{featured.title}</Text>
              <View style={styles.featuredMeta}>
                <Users color="#FFFFFF" size={14} />
                <Text style={styles.featuredMetaText}>{featured.listenerCount || 0} listening</Text>
              </View>
              <View style={styles.listenButton}>
                <Headphones color="#FFFFFF" size={18} />
                <Text style={styles.listenButtonText}>{signedIn ? 'Open live room' : 'Sign in to listen'}</Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {!loading && !error && !featured ? (
          <ListenerEmptyState
            title="No one is live right now"
            subtitle="Scheduled broadcasts move here automatically once creators go on air."
            icon={<Radio color={palette.blue} size={24} />}
          />
        ) : null}

        {!loading && !error ? (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Radio color={palette.red} size={19} />
              <Text style={styles.statValue}>{live.length}</Text>
              <Text style={styles.statLabel}>Live rooms</Text>
            </View>
            <View style={styles.statCard}>
              <Users color={palette.blue} size={19} />
              <Text style={styles.statValue}>{liveAudience}</Text>
              <Text style={styles.statLabel}>Listening now</Text>
            </View>
          </View>
        ) : null}

        {live.length ? (
          <>
            <ListenerSectionHeader title="All live broadcasts" />
            {live.map((item) => (
              <ListenerListRow
                key={item.id}
                title={item.title}
                subtitle={item.stationName || 'Echoo Station'}
                meta={`${item.listenerCount || 0} live`}
                image={item.coverArt}
                fallback={<Radio color={palette.red} size={21} />}
                onPress={() => !signedIn && router.push('/auth')}
              />
            ))}
          </>
        ) : null}

        <ListenerSectionHeader title="Starting soon" />
        {scheduled.length ? (
          scheduled.slice(0, 10).map((item) => (
            <ListenerListRow
              key={item.id}
              title={item.title}
              subtitle={item.stationName || 'Echoo Station'}
              meta={item.startTime ? formatStart(item.startTime) : 'Scheduled'}
              image={item.coverArt}
              fallback={<Clock3 color={palette.blue} size={21} />}
            />
          ))
        ) : (
          <ListenerEmptyState
            title="Nothing scheduled yet"
            subtitle="Upcoming public broadcasts will be listed here as creators schedule them."
            icon={<Clock3 color={palette.blue} size={24} />}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatStart(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Scheduled';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  featuredCard: { height: 290, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: palette.lineStrong },
  liveBadge: { position: 'absolute', top: 16, left: 16, minHeight: 28, borderRadius: 9, backgroundColor: palette.red, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  featuredCopy: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  featuredStation: { color: '#DCE4F5', fontSize: 12, fontWeight: '800' },
  featuredTitle: { color: '#FFFFFF', fontSize: 27, lineHeight: 30, fontWeight: '900', letterSpacing: -0.7, marginTop: 4, maxWidth: 310 },
  featuredMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  featuredMetaText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },
  listenButton: { marginTop: 14, alignSelf: 'flex-start', minHeight: 43, borderRadius: 14, backgroundColor: palette.blue, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 8 },
  listenButtonText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statCard: { flex: 1, minHeight: 103, borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 13 },
  statValue: { color: palette.ink, fontSize: 23, fontWeight: '900', marginTop: 7 },
  statLabel: { color: palette.muted, fontSize: 11.5, fontWeight: '700' },
});
