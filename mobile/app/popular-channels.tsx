import { Image } from 'expo-image';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { ChevronLeft, Info } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerEmptyState, ListenerSkeletonRows, ListenerToast, friendlyErrorMessage } from '@/src/components/ListenerV2';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  EchooStation,
  followStation,
  getFollowedStations,
  getMobileDiscovery,
  hasEchooSession,
  unfollowStation,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function PopularChannelsScreen() {
  const { router, push } = useGuardedRouter();
  const palette = getEchooColors(useColorScheme());
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [stations, setStations] = useState<EchooStation[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pendingStationId, setPendingStationId] = useState('');

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const [discovery, session] = await Promise.all([
        getMobileDiscovery({ force }),
        hasEchooSession(),
      ]);
      const followed = session ? await getFollowedStations({ force }).catch(() => []) : [];
      setStations(
        [...discovery.stations]
          .sort((a, b) => (b.listenerCount || 0) - (a.listenerCount || 0) || (b.followerCount || 0) - (a.followerCount || 0))
          .slice(0, 20)
      );
      setFollowedIds(new Set(followed.map((station: EchooStation) => station.id)));
      setSignedIn(session);
      setError('');
    } catch (loadError: any) {
      setError(friendlyErrorMessage(loadError, 'Could not load popular channels.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async (station: EchooStation) => {
    if (!signedIn) {
      push('/auth');
      return;
    }
    if (pendingStationId) return;

    const wasFollowing = followedIds.has(station.id);
    setPendingStationId(station.id);
    setFollowedIds((current) => {
      const next = new Set(current);
      if (wasFollowing) next.delete(station.id);
      else next.add(station.id);
      return next;
    });

    try {
      if (wasFollowing) await unfollowStation(station.id);
      else await followStation(station.id);
    } catch (followError: any) {
      setFollowedIds((current) => {
        const next = new Set(current);
        if (wasFollowing) next.add(station.id);
        else next.delete(station.id);
        return next;
      });
      setError(friendlyErrorMessage(followError, 'Could not update this channel.'));
    } finally {
      setPendingStationId('');
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
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back">
            <ChevronLeft color="#050505" size={24} strokeWidth={2.4} />
          </Pressable>
          <Text style={styles.title}>Popular channels</Text>
        </View>
        <Text style={styles.subtitle}>Find a voice to return to. Follow a channel to keep it in your library.</Text>

        {loading ? <ListenerSkeletonRows count={5} /> : null}
        {!loading && error ? <ListenerToast message={error} /> : null}

        {!loading && stations.map((station) => {
          const following = followedIds.has(station.id);
          const pending = pendingStationId === station.id;
          return (
            <View key={station.id} style={styles.row}>
              <Pressable style={styles.stationOpen} onPress={() => push({ pathname: '/station', params: { stationId: station.id } })}>
                <View style={styles.artwork}>
                  {station.coverArt ? <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : null}
                </View>
                <View style={styles.copy}>
                  <Text style={styles.stationName} numberOfLines={1}>{station.name}</Text>
                  <Text style={styles.stationDetail} numberOfLines={1}>{following ? 'In your following' : 'Explore channel'}</Text>
                </View>
              </Pressable>
              <Pressable
                style={[styles.followButton, following && styles.followingButton, pending && styles.disabledButton]}
                onPress={() => void toggleFollow(station)}
                disabled={pending}
              >
                <Text style={[styles.followText, following && styles.followingText]}>{following ? 'Following' : 'Follow'}</Text>
              </Pressable>
            </View>
          );
        })}

        {!loading && !stations.length ? (
          <ListenerEmptyState title="Channels are warming up" subtitle="Popular channels will appear here as listeners discover them." />
        ) : null}

        <View style={styles.discoveryNote}>
          <Text style={styles.noteTitle}>Keep discovering</Text>
          <Text style={styles.noteText}>Explore each channel for teaching, collections and live audio.</Text>
        </View>
        <View style={styles.alertNote}>
          <Info color={palette.blue} size={22} />
          <Text style={styles.alertText}>Live alerts are optional. Choose them in Notifications.</Text>
        </View>
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
  subtitle: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 18, marginTop: 8, marginBottom: 17 },
  row: { height: 70, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stationOpen: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  artwork: { width: 62, height: 58, borderRadius: 10, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  copy: { flex: 1, minWidth: 0 },
  stationName: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 16 },
  stationDetail: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 4 },
  followButton: { width: 130, height: 40, borderRadius: 20, backgroundColor: '#2B5FC0', alignItems: 'center', justifyContent: 'center' },
  followingButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2B5FC0' },
  disabledButton: { opacity: 0.6 },
  followText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 14 },
  followingText: { color: '#2B5FC0' },
  discoveryNote: { marginTop: 36 },
  noteTitle: { color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 20, letterSpacing: -0.5 },
  noteText: { color: '#868686', fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 18, marginTop: 18 },
  alertNote: { marginTop: 18, minHeight: 60, borderRadius: 10, backgroundColor: '#E7EEFB', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  alertText: { flex: 1, color: '#2B5FC0', fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 17 },
});
