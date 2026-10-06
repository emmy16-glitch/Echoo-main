import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { CalendarClock, ChevronLeft, Mic, Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerEmptyState, ListenerSkeletonRows, ListenerToast } from '@/src/components/ListenerV2';
import {
  EchooBroadcast,
  EchooStation,
  createCreatorBroadcast,
  getMyBroadcasts,
  getMyStations,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const toLocalInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const parseLocalDate = (value: string) => {
  const normalized = value.trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value?: string) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function CreatorScheduleScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const defaultDate = useMemo(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(date);
  }, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [broadcasts, setBroadcasts] = useState<EchooBroadcast[]>([]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(defaultDate);
  const [toast, setToast] = useState('');

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const [nextBroadcasts, nextStations] = await Promise.all([
        getMyBroadcasts({ force }),
        getMyStations({ force }),
      ]);
      setBroadcasts(nextBroadcasts);
      setStations(nextStations);
    } catch (error: any) {
      setToast(error?.message || 'Could not load schedule.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const station = stations[0] || null;
  const scheduled = broadcasts
    .filter((item) => String(item.status || '') === 'scheduled')
    .sort((a, b) => new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime());

  const createSchedule = async () => {
    setToast('');
    if (!station) {
      setToast('Create a station before scheduling.');
      return;
    }
    const date = parseLocalDate(startAt);
    if (!date) {
      setToast('Use date format YYYY-MM-DD HH:mm.');
      return;
    }
    const cleanTitle = title.trim() || `${station.name} live`;
    setCreating(true);
    try {
      await createCreatorBroadcast({
        title: cleanTitle,
        description,
        stationId: station.id,
        startTime: date.toISOString(),
        isPublic: true,
      });
      setTitle('');
      setDescription('');
      setToast('Broadcast scheduled.');
      await load(true);
    } catch (error: any) {
      setToast(error?.message || 'Could not schedule broadcast.');
    } finally {
      setCreating(false);
    }
  };

  const startScheduled = (item: EchooBroadcast) => {
    router.push({
      pathname: '/creator-live' as any,
      params: {
        broadcastId: item.id,
        title: item.title,
        stationId: item.stationId || station?.id || '',
        stationName: item.stationName || station?.name || 'Echoo Station',
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <ChevronLeft color={palette.ink} size={25} />
        </Pressable>
        <Text style={styles.topTitle}>Schedule</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={palette.blue} colors={[palette.blue]} />}
      >
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <CalendarClock color={palette.blue} size={24} />
            <View>
              <Text style={styles.formTitle}>Create scheduled live</Text>
              <Text style={styles.formText}>{station?.name || 'No station selected'}</Text>
            </View>
          </View>
          <TextInput value={title} onChangeText={setTitle} placeholder="Broadcast title" placeholderTextColor={palette.faint} style={styles.input} editable={!creating} />
          <TextInput value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={palette.faint} style={[styles.input, styles.textArea]} multiline editable={!creating} />
          <TextInput value={startAt} onChangeText={setStartAt} placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={palette.faint} style={styles.input} editable={!creating} />
          <Pressable style={styles.primaryButton} onPress={createSchedule} disabled={creating}>
            <Plus color="#FFFFFF" size={19} />
            <Text style={styles.primaryButtonText}>{creating ? 'Scheduling...' : 'Schedule broadcast'}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Upcoming</Text>
        {loading ? <ListenerSkeletonRows count={4} /> : null}
        {!loading && !scheduled.length ? (
          <ListenerEmptyState title="Nothing scheduled" subtitle="Create a live slot and start it from here when it is time." icon={<CalendarClock color={palette.blue} size={24} />} />
        ) : null}
        {!loading && scheduled.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={styles.rowIcon}><CalendarClock color={palette.blue} size={20} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.rowMeta}>{formatDate(item.startTime)}</Text>
            </View>
            <Pressable style={styles.startButton} onPress={() => startScheduled(item)}>
              <Mic color="#FFFFFF" size={17} />
              <Text style={styles.startButtonText}>Start</Text>
            </Pressable>
          </View>
        ))}
        <ListenerToast message={toast} tone="info" />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 48 },
  formCard: { borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 14 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  formTitle: { color: palette.ink, fontSize: 16, fontWeight: '900' },
  formText: { color: palette.muted, fontSize: 11.5, marginTop: 2 },
  input: { minHeight: 50, borderRadius: 8, backgroundColor: palette.surfaceMuted, color: palette.ink, paddingHorizontal: 13, fontSize: 14, fontWeight: '800', marginTop: 10 },
  textArea: { minHeight: 88, paddingTop: 13, textAlignVertical: 'top' },
  primaryButton: { marginTop: 12, minHeight: 50, borderRadius: 25, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '900', marginTop: 24, marginBottom: 10 },
  row: { minHeight: 76, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  rowIcon: { width: 48, height: 48, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  rowMeta: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
  startButton: { minHeight: 38, borderRadius: 19, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12 },
  startButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});
