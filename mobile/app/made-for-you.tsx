import { Image } from 'expo-image';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { ChevronLeft, Play } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AudioPlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import {
  EchooAudio,
  EchooBroadcast,
  EchooHistoryItem,
  EchooStation,
  followStation,
  getCurrentUser,
  getFollowedStations,
  getListeningHistory,
  getMobileDiscovery,
  hasEchooSession,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type Discovery = {
  stations: EchooStation[];
  live: EchooBroadcast[];
  scheduled: EchooBroadcast[];
  audio: EchooAudio[];
};

function uniqueCollections(tracks: EchooAudio[]) {
  const collectionIds = new Set<string>();
  return tracks.filter((track) => {
    if (!track.collectionId || collectionIds.has(track.collectionId)) return false;
    collectionIds.add(track.collectionId);
    return true;
  }).slice(0, 2);
}

export default function MadeForYouScreen() {
  const { router, push } = useGuardedRouter();
  const playback = usePlayback();
  const palette = getEchooColors(useColorScheme());
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [history, setHistory] = useState<EchooAudio[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [profileName, setProfileName] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [following, setFollowing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const [nextDiscovery, session] = await Promise.all([getMobileDiscovery({ force }), hasEchooSession()]);
      setDiscovery(nextDiscovery);
      setSignedIn(session);

      if (session) {
        const [account, listeningHistory, followed] = await Promise.all([
          getCurrentUser({ force }).catch(() => null),
          getListeningHistory({ force }).catch(() => []),
          getFollowedStations({ force }).catch(() => []),
        ]);
        setProfileName(account?.displayName || account?.username || '');
        setHistory(listeningHistory.map((item: EchooHistoryItem) => item.track).filter((track: EchooAudio | undefined): track is EchooAudio => Boolean(track?.id)).filter((track: EchooAudio, index: number, rows: EchooAudio[]) => rows.findIndex((item) => item.id === track.id) === index));
        setFollowedIds(new Set(followed.map((station: EchooStation) => station.id)));
      } else {
        setProfileName('');
        setHistory([]);
        setFollowedIds(new Set());
      }
      setError('');
    } catch (loadError: any) {
      setError(friendlyErrorMessage(loadError, 'Could not load suggestions right now.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const published = discovery?.audio || [];
  const collections = uniqueCollections(published);
  const historyIds = new Set(history.map((track) => track.id));
  const nextListen = [...history, ...published.filter((track: EchooAudio) => !historyIds.has(track.id))].slice(0, 3);
  const channel = discovery?.stations
    .filter((station: EchooStation) => !followedIds.has(station.id))
    .sort((a: EchooStation, b: EchooStation) => (b.listenerCount || 0) - (a.listenerCount || 0) || (b.followerCount || 0) - (a.followerCount || 0))[0];
  const queue = useMemo<AudioPlaybackItem[]>(() => nextListen.map((track) => ({
    kind: 'audio', id: track.id, title: track.title,
    subtitle: track.subtitle || track.artistName || track.stationName || 'Echoo Audio',
    coverArt: track.coverArt || '', fileUrl: track.fileUrl || '', genre: track.genre || '',
    stationId: track.stationId || '', stationName: track.stationName || track.artistName || '',
    collectionId: track.collectionId || '', collectionName: track.collectionName || '',
  })), [nextListen]);

  const playTrack = async (track: EchooAudio) => {
    const index = queue.findIndex((item) => item.id === track.id);
    await playback.playAudioQueue(queue, Math.max(0, index));
    push({ pathname: '/audio-player', params: { audioId: track.id, title: track.title, subtitle: track.subtitle || track.artistName || track.stationName || 'Echoo Audio', coverArt: track.coverArt || '', fileUrl: track.fileUrl || '' } });
  };

  const followChannel = async (station: EchooStation) => {
    if (!signedIn) {
      push('/auth');
      return;
    }
    setFollowing(true);
    try {
      await followStation(station.id);
      setFollowedIds((current) => new Set(current).add(station.id));
    } catch (followError: any) {
      setError(friendlyErrorMessage(followError, 'Could not follow this channel.'));
    } finally {
      setFollowing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.blue} colors={[palette.blue]} />}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back"><ChevronLeft color="#050505" size={24} strokeWidth={2.4} /></Pressable>
          <Text style={styles.title}>Made for you</Text>
        </View>
        <Text style={styles.subtitle}>{profileName ? `A little more of what you enjoy, ${profileName.split(' ')[0]}.` : 'A little more of what you enjoy.'}</Text>

        {loading ? <ListenerSkeletonRows count={5} /> : null}
        {!loading && error ? <ListenerToast message={error} /> : null}

        {!loading && collections.length ? (
          <View style={styles.collectionRail}>
            {collections.map((collection) => (
              <Pressable
                key={collection.collectionId}
                style={styles.collectionCard}
                onPress={() => push({ pathname: '/collection', params: { collectionId: collection.collectionId || '', stationId: collection.stationId || '', stationName: collection.stationName || '' } })}
              >
                <View style={styles.collectionArt}>
                  {collection.coverArt ? <Image source={{ uri: collection.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
                </View>
                <Text style={styles.collectionTitle} numberOfLines={1}>{collection.collectionName || collection.title}</Text>
                <Text style={styles.collectionSubtitle} numberOfLines={1}>{collection.stationName || collection.artistName ? `${collection.stationName || collection.artistName} · Collection` : 'Collection'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!loading && nextListen.length ? (
          <>
            <Text style={styles.sectionTitle}>For your next listen</Text>
            <View style={styles.trackStack}>
              {nextListen.map((track) => (
                <Pressable key={track.id} style={styles.trackRow} onPress={() => void playTrack(track)}>
                  <View style={styles.trackArt}>
                    {track.coverArt ? <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
                  </View>
                  <View style={styles.trackCopy}>
                    <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.trackSubtitle} numberOfLines={1}>{track.stationName || track.subtitle || track.artistName || 'Echoo Audio'}</Text>
                  </View>
                  <View style={styles.playButton}><Play color="#FFFFFF" fill="#FFFFFF" size={15} /></View>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {!loading && channel ? (
          <>
            <Text style={styles.sectionTitle}>A channel to explore</Text>
            <View style={styles.channelRow}>
              <Pressable style={styles.channelOpen} onPress={() => push({ pathname: '/station', params: { stationId: channel.id } })}>
                <View style={styles.channelArt}>
                  {channel.coverArt ? <Image source={{ uri: channel.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
                </View>
                <View style={styles.channelCopy}>
                  <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
                  <Text style={styles.channelDetail} numberOfLines={1}>Explore channel</Text>
                </View>
              </Pressable>
              <Pressable style={[styles.followButton, following && styles.disabledButton]} onPress={() => void followChannel(channel)} disabled={following}>
                <Text style={styles.followText}>Follow</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {!loading && !collections.length && !nextListen.length && !channel ? (
          <ListenerEmptyState title="Suggestions are coming" subtitle="Audio, collections and channels will appear here as Echoo grows." />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FBFF' },
  content: { paddingHorizontal: 24, paddingTop: 15, paddingBottom: 140 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backButton: { width: 28, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  title: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 24, letterSpacing: -0.6 },
  subtitle: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 18, marginTop: 8, marginBottom: 10 },
  collectionRail: { flexDirection: 'row', gap: 26 },
  collectionCard: { flex: 1, minWidth: 0 },
  collectionArt: { width: '100%', height: 153, borderRadius: 20, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  collectionTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16, marginTop: 11 },
  collectionSubtitle: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  sectionTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 20, letterSpacing: -0.5, marginTop: 38, marginBottom: 14 },
  trackStack: { gap: 12 },
  trackRow: { height: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackArt: { width: 62, height: 58, borderRadius: 5, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  trackCopy: { flex: 1, minWidth: 0 },
  trackTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  trackSubtitle: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  playButton: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2B5FC0', alignItems: 'center', justifyContent: 'center' },
  channelRow: { height: 70, flexDirection: 'row', alignItems: 'center', gap: 12 },
  channelOpen: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  channelArt: { width: 62, height: 58, borderRadius: 10, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  channelCopy: { flex: 1, minWidth: 0 },
  channelName: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  channelDetail: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  followButton: { width: 130, height: 40, borderRadius: 20, backgroundColor: '#2B5FC0', alignItems: 'center', justifyContent: 'center' },
  disabledButton: { opacity: 0.6 },
  followText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 14 },
});
