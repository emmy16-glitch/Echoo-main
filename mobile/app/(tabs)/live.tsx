import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { ArrowLeft, ChevronRight, Clock3, Headphones, Mic, Play, Radio } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { EchooBroadcast, getCachedMobileDiscoverySnapshot, getMobileDiscovery } from '@/src/services/echooApi';

const BLUE = '#2B5FC0';

export default function LiveScreen() {
  const { push, router } = useGuardedRouter();
  const [live, setLive] = useState<EchooBroadcast[]>([]);
  const [scheduled, setScheduled] = useState<EchooBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loaded = useRef(false);
  const loadingRef = useRef(false);
  const lastRefresh = useRef(0);

  const load = useCallback(async (force = false, silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (force && !silent) setRefreshing(true);
    else if (!silent) setLoading(true);
    try {
      const data = await getMobileDiscovery({ force });
      setLive(data.live);
      setScheduled(data.scheduled);
      setError('');
    } catch (cause) {
      if (!silent) setError(friendlyErrorMessage(cause, 'Could not load live broadcasts.'));
    } finally {
      loaded.current = true;
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    let appState = AppState.currentState;
    void (async () => {
      if (!loaded.current) {
        const cached = await getCachedMobileDiscoverySnapshot();
        if (!active) return;
        if (cached) {
          setLive(cached.live);
          setScheduled(cached.scheduled);
          setLoading(false);
        }
      }
      if (active) void load(loaded.current, loaded.current);
    })();
    const refresh = () => {
      if (!active || loadingRef.current || Date.now() - lastRefresh.current < 10_000) return;
      lastRefresh.current = Date.now();
      void load(true, true);
    };
    const interval = setInterval(refresh, 30_000);
    const subscription = AppState.addEventListener('change', (next) => {
      if ((appState === 'background' || appState === 'inactive') && next === 'active') refresh();
      appState = next;
    });
    return () => { active = false; clearInterval(interval); subscription.remove(); };
  }, [load]));

  const openRoom = (item: EchooBroadcast) => push({ pathname: '/live-room', params: {
    broadcastId: item.id, title: item.title, stationName: item.stationName || 'Echoo Station',
    stationId: item.stationId || '', coverArt: item.coverArt || '',
  } });

  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={BLUE} colors={[BLUE]} />}>
      <Pressable style={styles.search} onPress={() => push('/search')} accessibilityRole="search" accessibilityLabel="Search channels and audio">
        <Text style={styles.searchText}>Channels, title, artist, shows</Text><Mic color="#050505" size={25} strokeWidth={2.5} />
      </Pressable>
      <View style={styles.headingRow}>
        <Pressable style={styles.back} onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft color="#050505" size={25} /></Pressable>
        <Text style={styles.heading}>Live now</Text>
      </View>
      <Text style={styles.intro}>Listen with others as it happens.</Text>
      {error ? <View style={styles.notice}><ListenerToast message={error} /></View> : null}
      {loading && !live.length && !scheduled.length ? <View style={styles.skeleton}><ListenerSkeletonRows count={4} /></View> : null}

      {!loading && !live.length ? <View style={styles.empty}>
        <View style={styles.emptyIcon}><Radio color={BLUE} size={25} /></View>
        <Text style={styles.emptyTitle}>No one is live right now</Text>
        <Text style={styles.emptyCopy}>When a channel starts broadcasting, you’ll find it here.</Text>
        <Pressable style={styles.emptyButton} onPress={() => push('/search')}><Text style={styles.emptyButtonText}>Browse audio</Text></Pressable>
      </View> : null}

      {live.length ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>On air</Text>
        {live.map((item) => <Pressable key={item.id} style={styles.liveRow} onPress={() => openRoom(item)} accessibilityRole="button" accessibilityLabel={`Listen to ${item.title}`}>
          <View style={styles.artwork}>
            {item.coverArt ? <Image source={{ uri: item.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Radio color={BLUE} size={32} />}
            <View style={styles.liveBadge}><View style={styles.dot} /><Text style={styles.badgeText}>LIVE</Text></View>
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>{item.stationName || 'Echoo Station'}</Text>
            <View style={styles.listenerLine}><Headphones color="#858585" size={14} /><Text style={styles.listenerText}>{item.listenerCount || 0} listening</Text></View>
          </View>
          <View style={styles.playButton}><Play color="#FFFFFF" fill="#FFFFFF" size={18} /></View>
        </Pressable>)}
      </View> : null}

      {!loading && scheduled.length ? <View style={styles.section}>
        <Text style={styles.sectionTitle}>Starting soon</Text>
        {scheduled.map((item) => <View key={item.id} style={styles.scheduledRow}>
          <View style={styles.smallArtwork}>{item.coverArt ? <Image source={{ uri: item.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Clock3 color={BLUE} size={25} />}</View>
          <View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{item.stationName || 'Echoo Station'} · {formatStart(item.startTime)}</Text></View>
          {item.stationId ? <Pressable style={styles.channelLink} onPress={() => push({ pathname: '/station', params: { stationId: item.stationId } })} accessibilityLabel={`View ${item.stationName || 'channel'}`}><ChevronRight color="#050505" size={22} /></Pressable> : null}
        </View>)}
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

function formatStart(value?: string) {
  if (!value) return 'Scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Scheduled' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FBFF' }, content: { paddingTop: 22, paddingBottom: 150 },
  search: { height: 48, borderRadius: 25, backgroundColor: '#F2F3F5', marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 31 },
  searchText: { color: '#848484', fontFamily: 'DMSans_400Regular', fontSize: 16, flexShrink: 1 },
  headingRow: { marginTop: 18, marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 8 }, back: { width: 25, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  heading: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.5 }, intro: { marginTop: 12, marginHorizontal: 24, color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 20 },
  notice: { marginHorizontal: 24 }, skeleton: { marginHorizontal: 24, marginTop: 24 },
  section: { marginTop: 30 }, sectionTitle: { marginHorizontal: 24, marginBottom: 14, color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 21, letterSpacing: -0.5 },
  liveRow: { marginHorizontal: 24, marginBottom: 18, minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 13 },
  artwork: { width: 106, height: 106, borderRadius: 17, overflow: 'hidden', backgroundColor: '#E7EAF0', alignItems: 'center', justifyContent: 'center' },
  liveBadge: { position: 'absolute', left: 6, top: 6, backgroundColor: '#FFFFFF', borderRadius: 7, paddingHorizontal: 7, height: 20, flexDirection: 'row', alignItems: 'center', gap: 4 }, dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4D59' }, badgeText: { color: '#6B6B6B', fontFamily: 'DMSans_700Bold', fontSize: 9 },
  rowCopy: { flex: 1, justifyContent: 'center' }, rowTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16, lineHeight: 21 }, rowSubtitle: { marginTop: 3, color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13 }, listenerLine: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }, listenerText: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 12 },
  playButton: { width: 31, height: 31, borderRadius: 16, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  scheduledRow: { marginHorizontal: 24, marginBottom: 14, minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 12 }, smallArtwork: { width: 62, height: 62, borderRadius: 9, overflow: 'hidden', backgroundColor: '#E7EAF0', alignItems: 'center', justifyContent: 'center' }, channelLink: { width: 30, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { marginTop: 32, marginHorizontal: 24, paddingVertical: 25, alignItems: 'center' }, emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E5EEFE', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { marginTop: 14, color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 19 }, emptyCopy: { marginTop: 5, color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center' }, emptyButton: { marginTop: 18, minHeight: 42, borderRadius: 21, paddingHorizontal: 22, backgroundColor: BLUE, justifyContent: 'center' }, emptyButtonText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 13 },
});
