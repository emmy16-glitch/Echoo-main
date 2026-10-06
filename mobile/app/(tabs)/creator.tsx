import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  Library,
  Mic,
  Radio,
  ShieldCheck,
  Upload,
  Users,
  Wifi,
} from 'lucide-react-native';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ListenerAuthCard,
  ListenerEmptyState,
  ListenerListRow,
  ListenerSkeletonRows,
  ListenerToast,
  ListenerTopBar,
} from '@/src/components/ListenerV2';
import {
  EchooAudio,
  EchooBroadcast,
  EchooCreatorDashboard,
  EchooStation,
  EchooUser,
  getCreatorContent,
  getCreatorDashboard,
  getCurrentUser,
  getMyBroadcasts,
  getMyStations,
  hasEchooSession,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const emptyDashboard: EchooCreatorDashboard = {
  stats: { listeners: 0, peakListeners: 0, plays: 0, followers: 0, engagement: 0 },
  recentContent: [],
  upcomingSchedule: [],
  activeBroadcasts: [],
  totalTracks: 0,
  totalPlays: 0,
};

const formatNumber = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value || 0);
};

const shortDate = (value?: string) => {
  if (!value) return 'No upcoming';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No upcoming';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function CreatorScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<EchooUser | null>(null);
  const [dashboard, setDashboard] = useState<EchooCreatorDashboard>(emptyDashboard);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [broadcasts, setBroadcasts] = useState<EchooBroadcast[]>([]);
  const [content, setContent] = useState<EchooAudio[]>([]);
  const [toast, setToast] = useState('');

  const loadCreator = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setToast('');

    const session = await hasEchooSession();
    setSignedIn(session);

    if (!session) {
      setUser(null);
      setDashboard(emptyDashboard);
      setStations([]);
      setBroadcasts([]);
      setContent([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const nextUser = await getCurrentUser();
      setUser(nextUser);

      if (nextUser.userType !== 'creator') {
        setDashboard(emptyDashboard);
        setStations([]);
        setBroadcasts([]);
        setContent([]);
        return;
      }

      const [nextDashboard, nextStations, nextBroadcasts, nextContent] = await Promise.all([
        getCreatorDashboard({ force }).catch(() => emptyDashboard),
        getMyStations({ force }).catch(() => []),
        getMyBroadcasts({ force }).catch(() => []),
        getCreatorContent({ force }).catch(() => []),
      ]);

      setDashboard(nextDashboard);
      setStations(nextStations);
      setBroadcasts(nextBroadcasts);
      setContent(nextContent);
    } catch (error: any) {
      if (error?.code === 'AUTH_REQUIRED' || error?.code === 'SESSION_EXPIRED') {
        setSignedIn(false);
        setUser(null);
      } else {
        setToast(error?.message || 'Could not load Creator Studio.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCreator();
    }, [loadCreator])
  );

  const station = stations[0] || null;
  const liveBroadcast = [...dashboard.activeBroadcasts, ...broadcasts].find((item) =>
    ['starting', 'live'].includes(String(item.status || ''))
  );
  const upcomingBroadcast = [...dashboard.upcomingSchedule, ...broadcasts].find(
    (item) => String(item.status || '') === 'scheduled'
  );
  const recentContent = content.length ? content : dashboard.recentContent;
  const isCreator = user?.userType === 'creator';

  const openAudio = (track: EchooAudio) => {
    router.push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: track.stationName || track.subtitle || track.artistName || 'Echoo Audio',
        coverArt: track.coverArt || '',
        fileUrl: track.fileUrl || '',
        genre: track.genre || '',
        stationId: track.stationId || station?.id || '',
        stationName: track.stationName || station?.name || '',
      },
    });
  };

  const showNextPhase = (label: string) => {
    setToast(`${label} is ready for the next creator phase.`);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ListenerTopBar />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadCreator(true)}
            tintColor={palette.blue}
            colors={[palette.blue]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CREATOR STUDIO</Text>
          <Text style={styles.title}>Create from your phone</Text>
          <Text style={styles.subtitle}>
            Phone mic live, quick uploads, and the essentials without desktop clutter.
          </Text>
        </View>

        {loading ? <ListenerSkeletonRows count={5} /> : null}

        {!loading && !signedIn ? (
          <ListenerAuthCard
            title="Sign in as a creator"
            subtitle="Creator tools need your Echoo account so broadcasts, uploads, and stations stay connected."
            onPress={() => router.push('/auth')}
          />
        ) : null}

        {!loading && signedIn && !isCreator ? (
          <ListenerEmptyState
            title="Creator access is not active"
            subtitle="This account can listen now. Activate creator tools from Echoo web studio before using mobile broadcast controls."
            icon={<Mic color={palette.blue} size={24} />}
            action="Back to listener home"
            onAction={() => router.push('/')}
          />
        ) : null}

        {!loading && isCreator ? (
          <>
            <Pressable
              style={styles.goLiveCard}
              onPress={() => {
                if (!station) {
                  showNextPhase('Station setup');
                  return;
                }
                router.push({
                  pathname: '/creator-live' as any,
                  params: {
                    stationId: station.id,
                    stationName: station.name,
                  },
                });
              }}
            >
              <View style={styles.liveTopRow}>
                <View style={styles.liveIcon}>
                  <Mic color="#FFFFFF" size={27} />
                </View>
                <View style={styles.liveStatus}>
                  <Wifi color={liveBroadcast ? palette.green : palette.blue} size={15} />
                  <Text style={styles.liveStatusText}>
                    {liveBroadcast ? 'Live room active' : 'Phone mic ready'}
                  </Text>
                </View>
              </View>
              <Text style={styles.goLiveTitle}>{liveBroadcast ? liveBroadcast.title : 'Go live now'}</Text>
              <Text style={styles.goLiveText} numberOfLines={2}>
                {station
                  ? `${station.name} is selected as your mobile station.`
                  : 'Create or connect a station before starting a mobile broadcast.'}
              </Text>
              <View style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{liveBroadcast ? 'Open live room' : 'Start broadcast'}</Text>
                <ChevronRight color="#FFFFFF" size={18} />
              </View>
            </Pressable>

            <View style={styles.stationCard}>
              <View style={styles.stationArt}>
                {station?.coverArt ? (
                  <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : (
                  <Radio color={palette.blue} size={26} />
                )}
              </View>
              <View style={styles.stationCopy}>
                <Text style={styles.stationLabel}>Mobile station</Text>
                <Text style={styles.stationName} numberOfLines={1}>{station?.name || 'No station yet'}</Text>
                <Text style={styles.stationMeta} numberOfLines={1}>
                  {station
                    ? `${station.category || 'Other'} · ${formatNumber(station.followerCount || 0)} followers`
                    : 'Set up your channel on web'}
                </Text>
              </View>
              {station ? (
                <Pressable
                  style={styles.stationButton}
                  onPress={() => router.push('/creator-station' as any)}
                >
                  <ChevronRight color={palette.ink} size={18} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.actionGrid}>
              <CreatorAction
                icon={<Upload color={palette.blue} size={23} />}
                title="Upload audio"
                subtitle="Publish from device"
                onPress={() => router.push('/creator-upload' as any)}
                palette={palette}
              />
              <CreatorAction
                icon={<Library color={palette.blue} size={23} />}
                title="My content"
                subtitle={`${dashboard.totalTracks || recentContent.length} tracks`}
                onPress={() => router.push('/creator-content' as any)}
                palette={palette}
              />
              <CreatorAction
                icon={<CalendarClock color={palette.blue} size={23} />}
                title="Schedule"
                subtitle={shortDate(upcomingBroadcast?.startTime)}
                onPress={() => router.push('/creator-schedule' as any)}
                palette={palette}
              />
              <CreatorAction
                icon={<BarChart3 color={palette.blue} size={23} />}
                title="Stats"
                subtitle={`${formatNumber(dashboard.stats.plays)} plays`}
                onPress={() => showNextPhase('Creator stats')}
                palette={palette}
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today</Text>
              <Text style={styles.sectionAction}>Live view</Text>
            </View>
            <View style={styles.statsRow}>
              <StatTile value={formatNumber(dashboard.stats.listeners)} label="Live now" icon={<Headphones color={palette.red} size={18} />} palette={palette} />
              <StatTile value={formatNumber(dashboard.stats.followers)} label="Followers" icon={<Users color={palette.blue} size={18} />} palette={palette} />
              <StatTile value={formatNumber(dashboard.totalTracks || recentContent.length)} label="Uploads" icon={<Upload color={palette.green} size={18} />} palette={palette} />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Live checklist</Text>
            </View>
            <View style={styles.checklist}>
              <ChecklistRow title="Phone microphone" text="Default input for mobile broadcasts." done palette={palette} />
              <ChecklistRow title="Server replay" text="Echoo saves the official MP3 after live ends." done palette={palette} />
              <ChecklistRow title="Device recovery copy" text="Keep a local safety copy when available." palette={palette} />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent content</Text>
            </View>
            {recentContent.length ? (
              <View style={styles.listGroup}>
                {recentContent.slice(0, 5).map((track) => (
                  <ListenerListRow
                    key={track.id}
                    title={track.title}
                    subtitle={track.genre || track.subtitle || 'Creator audio'}
                    meta={`${formatNumber(track.playCount || 0)} plays`}
                    image={track.coverArt}
                    fallback={<Upload color={palette.blue} size={20} />}
                    onPress={() => openAudio(track)}
                  />
                ))}
              </View>
            ) : (
              <ListenerEmptyState
                title="No creator audio yet"
                subtitle="Your uploads and finished replays will appear here."
                icon={<Library color={palette.blue} size={24} />}
              />
            )}

            <View style={styles.webStudioCard}>
              <ShieldCheck color={palette.blue} size={22} />
              <View style={styles.webStudioCopy}>
                <Text style={styles.webStudioTitle}>Advanced studio stays on web</Text>
                <Text style={styles.webStudioText}>
                  Use desktop for detailed scheduling, editing, trimming, and deep analytics.
                </Text>
              </View>
            </View>

            {broadcasts.some((item) => String(item.status || '') === 'completed') ? (
              <Pressable
                style={styles.listenerButton}
                onPress={() => {
                  const completed = broadcasts.find((item) => String(item.status || '') === 'completed');
                  if (!completed) return;
                  router.push({
                    pathname: '/creator-replay' as any,
                    params: { broadcastId: completed.id, title: completed.title },
                  });
                }}
              >
                <Text style={styles.listenerButtonText}>Check latest replay</Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.listenerButton} onPress={() => router.push('/')}>
              <Text style={styles.listenerButtonText}>Back to listener home</Text>
            </Pressable>
          </>
        ) : null}

        <ListenerToast message={toast} tone="info" />
      </ScrollView>
    </SafeAreaView>
  );
}

function CreatorAction({
  icon,
  title,
  subtitle,
  onPress,
  palette,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress?: () => void;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable style={styles.actionCard} onPress={onPress}>
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </Pressable>
  );
}

function StatTile({
  value,
  label,
  icon,
  palette,
}: {
  value: string;
  label: string;
  icon: ReactNode;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.statTile}>
      {icon}
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ChecklistRow({
  title,
  text,
  done,
  palette,
}: {
  title: string;
  text: string;
  done?: boolean;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkDot, done && styles.checkDotDone]}>
        {done ? <CheckCircle2 color="#FFFFFF" size={15} /> : <Clock3 color={palette.muted} size={15} />}
      </View>
      <View style={styles.checkCopy}>
        <Text style={styles.checkTitle}>{title}</Text>
        <Text style={styles.checkText}>{text}</Text>
      </View>
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 150 },
  header: { paddingTop: 12, paddingBottom: 18 },
  eyebrow: { color: palette.blue, fontSize: 11, fontWeight: '900' },
  title: { color: palette.ink, fontSize: 30, lineHeight: 35, fontWeight: '900', marginTop: 5 },
  subtitle: { color: palette.muted, fontSize: 13.5, lineHeight: 20, marginTop: 6, maxWidth: 350 },
  goLiveCard: {
    minHeight: 210,
    borderRadius: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
  },
  liveTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveIcon: { width: 58, height: 58, borderRadius: 8, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  liveStatus: { minHeight: 30, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveStatusText: { color: palette.ink2, fontSize: 11, fontWeight: '900' },
  goLiveTitle: { color: palette.ink, fontSize: 25, lineHeight: 30, fontWeight: '900', marginTop: 18 },
  goLiveText: { color: palette.muted, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  primaryButton: { marginTop: 18, minHeight: 46, borderRadius: 23, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  stationCard: { marginTop: 14, minHeight: 92, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stationArt: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  stationCopy: { flex: 1, minWidth: 0 },
  stationLabel: { color: palette.blue, fontSize: 10.5, fontWeight: '900' },
  stationName: { color: palette.ink, fontSize: 17, fontWeight: '900', marginTop: 3 },
  stationMeta: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
  stationButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  actionCard: { width: '48.6%', minHeight: 112, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 13 },
  actionIcon: { width: 42, height: 42, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900', marginTop: 10 },
  actionSubtitle: { color: palette.muted, fontSize: 11, marginTop: 3 },
  sectionHeader: { marginTop: 26, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  sectionAction: { color: palette.muted, fontSize: 11.5, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statTile: { flex: 1, minHeight: 92, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 11, justifyContent: 'center' },
  statValue: { color: palette.ink, fontSize: 21, fontWeight: '900', marginTop: 7 },
  statLabel: { color: palette.muted, fontSize: 10.5, fontWeight: '800', marginTop: 2 },
  checklist: { borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, overflow: 'hidden' },
  checkRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: palette.line },
  checkDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  checkDotDone: { backgroundColor: palette.blue },
  checkCopy: { flex: 1, minWidth: 0 },
  checkTitle: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  checkText: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  listGroup: { gap: 2 },
  webStudioCard: { marginTop: 24, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 14, flexDirection: 'row', gap: 12 },
  webStudioCopy: { flex: 1 },
  webStudioTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  webStudioText: { color: palette.muted, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  listenerButton: { marginTop: 14, minHeight: 46, borderRadius: 23, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  listenerButtonText: { color: palette.ink, fontSize: 13, fontWeight: '900' },
});
