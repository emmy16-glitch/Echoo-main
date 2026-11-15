import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { ArrowLeft, Play } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerAuthCard, ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooAudio, EchooHistoryItem, clearListeningHistory, getCachedListeningHistorySnapshot, getListeningHistory, hasEchooSession } from '@/src/services/echooApi';

const BLUE = '#2B5FC0';

function dayKey(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayHeading(value: string | undefined, today: Date) {
  const date = value ? new Date(value) : today;
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const label = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  if (dayKey(value) === dayKey(today.toISOString())) return `Today · ${label}`;
  if (dayKey(value) === dayKey(yesterday.toISOString())) return `Yesterday · ${label}`;
  return label;
}

function playbackItem(track: EchooAudio): AudioPlaybackItem {
  return {
    kind: 'audio', id: track.id, title: track.title,
    subtitle: track.stationName || track.subtitle || track.artistName || 'Echoo Audio',
    coverArt: track.coverArt || '', fileUrl: track.fileUrl || '', genre: track.genre || '',
    stationId: track.stationId || '', stationName: track.stationName || '',
    collectionId: track.collectionId || '', collectionName: track.collectionName || '',
  };
}

function historyStatus(item: EchooHistoryItem) {
  if (item.completed) return 'Played';
  if ((item.progress || 0) <= 0) return 'Played';
  const duration = Number(item.track?.duration) || 0;
  if (!duration) return 'Continue listening';
  const seconds = Math.floor(duration * Math.min(100, item.progress || 0) / 100);
  return `Resume at ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ListeningHistoryScreen() {
  const { router, push } = useGuardedRouter();
  const playback = usePlayback();
  const [history, setHistory] = useState<EchooHistoryItem[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const session = await hasEchooSession();
      setSignedIn(session);
      setHistory(session ? await getListeningHistory({ force }) : []);
      setError('');
    } catch (cause) {
      setError(friendlyErrorMessage(cause, 'Could not load your listening history.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const session = await hasEchooSession();
      if (!active) return;
      setSignedIn(session);
      if (session) {
        const cached = await getCachedListeningHistorySnapshot().catch(() => []);
        if (active && cached.length) { setHistory(cached); setLoading(false); }
      }
      if (active) void load();
    })();
    return () => { active = false; };
  }, [load]));

  const groups = useMemo(() => {
    const sorted = history.filter((item) => item.track?.id).sort((a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime());
    const byDay = new Map<string, EchooHistoryItem[]>();
    for (const item of sorted) {
      const key = dayKey(item.playedAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)?.push(item);
    }
    const today = new Date();
    return [...byDay.values()].map((items) => ({ heading: dayHeading(items[0].playedAt, today), items }));
  }, [history]);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    return history.flatMap(({ track }) => {
      if (!track?.id || seen.has(track.id)) return [];
      seen.add(track.id);
      return [playbackItem(track)];
    });
  }, [history]);

  const playTrack = async (track: EchooAudio) => {
    await playback.playAudioQueue(queue, Math.max(0, queue.findIndex((item) => item.id === track.id)));
    push({ pathname: '/audio-player', params: { audioId: track.id, title: track.title, subtitle: track.stationName || track.artistName || track.subtitle || '', coverArt: track.coverArt || '', fileUrl: track.fileUrl || '' } });
  };

  const confirmClear = () => Alert.alert('Clear listening history?', 'This removes your listening history from your account.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: () => { void (async () => {
      setClearing(true);
      try { await clearListeningHistory(); setHistory([]); setError(''); }
      catch (cause) { setError(friendlyErrorMessage(cause, 'Could not clear listening history.')); }
      finally { setClearing(false); }
    })(); } },
  ]);

  return <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={BLUE} colors={[BLUE]} />}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}><ArrowLeft color="#050505" size={23} /></Pressable>
        <Text style={styles.title}>Listening History</Text>
        {signedIn && history.length ? <Pressable onPress={confirmClear} disabled={clearing} accessibilityRole="button" accessibilityLabel="Clear listening history"><Text style={styles.clear}>{clearing ? 'Clearing' : 'Clear'}</Text></Pressable> : null}
      </View>
      {loading && !history.length ? <View style={styles.skeleton}><ListenerSkeletonRows count={6} /></View> : null}
      {error ? <View style={styles.message}><ListenerToast message={error} /></View> : null}
      {!loading && !signedIn ? <ListenerAuthCard title="Sign in to see your history" subtitle="Your listening history is private to your Echoo account." onPress={() => push('/auth')} /> : null}
      {!loading && signedIn && !groups.length ? <ListenerEmptyState title="Nothing played yet" subtitle="Audio you play will appear here." /> : null}
      {groups.map((group) => <View key={group.heading} style={styles.group}>
        <Text style={styles.groupTitle}>{group.heading}</Text>
        {group.items.map((item, index) => {
          const track = item.track!;
          return <Pressable key={`${item.id || track.id}-${index}`} style={styles.row} onPress={() => void playTrack(track)} accessibilityRole="button" accessibilityLabel={`Play ${track.title}`}>
            <View style={styles.artwork}>{track.coverArt ? <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}</View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>{track.stationName || track.artistName || track.subtitle || 'Echoo Audio'} · {historyStatus(item)}</Text>
            </View>
            <View style={styles.play}><Play color="#FFFFFF" fill="#FFFFFF" size={13} /></View>
          </Pressable>;
        })}
      </View>)}
      {groups.length ? <Text style={styles.footer}>History is shown newest first.</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FBFF' },
  content: { paddingBottom: 120 },
  header: { marginTop: 20, marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', minHeight: 42 },
  back: { marginRight: 8, paddingVertical: 8 },
  title: { flex: 1, color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 23, letterSpacing: -0.5 },
  clear: { color: BLUE, fontFamily: 'DMSans_500Medium', fontSize: 15 },
  skeleton: { marginHorizontal: 24, marginTop: 30 }, message: { marginHorizontal: 24, marginTop: 16 },
  group: { marginTop: 28, marginHorizontal: 24 },
  groupTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 20, letterSpacing: -0.4, marginBottom: 11 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 70, marginBottom: 1 },
  artwork: { width: 62, height: 58, borderRadius: 6, overflow: 'hidden', backgroundColor: '#E7EAF0' },
  rowCopy: { flex: 1, marginLeft: 12, marginRight: 12 },
  rowTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16, letterSpacing: -0.25 },
  rowSubtitle: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 2 },
  play: { width: 23, height: 23, borderRadius: 12, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  footer: { marginTop: 12, marginHorizontal: 24, color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 12 },
});
