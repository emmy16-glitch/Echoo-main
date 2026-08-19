import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BellRing,
  Clock3,
  Headphones,
  Heart,
  Music2,
  Play,
  Radio,
  Users,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ListenerBackHeader,
  ListenerEmptyState,
  ListenerSectionHeader,
} from '@/src/components/ListenerV2';
import {
  API_URL,
  EchooAudio,
  EchooBroadcast,
  EchooStation,
  followStation,
  getFollowedStations,
  getLiveBroadcastForStation,
  getStationById,
  hasEchooSession,
  normalizeAudio,
  unfollowStation,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

function formatDuration(seconds = 0) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

async function getPublishedAudioByCreator(creatorId: string): Promise<EchooAudio[]> {
  if (!creatorId) return [];

  const response = await fetch(
    `${API_URL}/audio?public=true&userId=${encodeURIComponent(creatorId)}&page=1&limit=100`
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || payload?.message || 'Could not load published station audio.'
    );
  }

  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map(normalizeAudio).filter((item: EchooAudio) => item.id && item.fileUrl);
}

export default function StationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ stationId?: string }>();
  const stationId = String(params.stationId || '');
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [station, setStation] = useState<EchooStation | null>(null);
  const [live, setLive] = useState<EchooBroadcast | null>(null);
  const [publishedAudio, setPublishedAudio] = useState<EchooAudio[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [audioLoading, setAudioLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState('');
  const [audioError, setAudioError] = useState('');

  const load = useCallback(async () => {
    if (!stationId) {
      setError('Station ID is missing.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setAudioError('');
    try {
      const session = await hasEchooSession();
      const [nextStation, nextLive] = await Promise.all([
        getStationById(stationId),
        getLiveBroadcastForStation(stationId).catch(() => null),
      ]);

      setSignedIn(session);
      setStation(nextStation);
      setLive(nextLive);

      const ownerId = nextStation?.owner?.id || '';
      if (ownerId) {
        setAudioLoading(true);
        try {
          const audio = await getPublishedAudioByCreator(ownerId);
          setPublishedAudio(audio);
        } catch (publishedError: any) {
          setPublishedAudio([]);
          setAudioError(publishedError?.message || 'Could not load this station audio.');
        } finally {
          setAudioLoading(false);
        }
      } else {
        setPublishedAudio([]);
        setAudioLoading(false);
      }

      if (session) {
        const followed = await getFollowedStations().catch(() => []);
        setFollowing(followed.some((item: EchooStation) => item.id === stationId));
      } else {
        setFollowing(false);
      }
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load this station.');
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!stationId) return;
    if (!signedIn) {
      router.push('/auth');
      return;
    }

    setFollowBusy(true);
    setError('');
    try {
      if (following) {
        await unfollowStation(stationId);
        setFollowing(false);
        setStation((current) => current ? {
          ...current,
          followerCount: Math.max(0, (current.followerCount || 0) - 1),
        } : current);
      } else {
        await followStation(stationId);
        setFollowing(true);
        setStation((current) => current ? {
          ...current,
          followerCount: (current.followerCount || 0) + 1,
        } : current);
      }
    } catch (followError: any) {
      setError(followError?.message || 'Could not update this station follow.');
    } finally {
      setFollowBusy(false);
    }
  };

  const openLive = () => {
    if (!live) return;
    if (!signedIn) {
      router.push('/auth');
      return;
    }
    router.push({
      pathname: '/live-room',
      params: {
        broadcastId: live.id,
        title: live.title,
        stationName: station?.name || live.stationName || 'Echoo Station',
        coverArt: live.coverArt || station?.coverArt || '',
      },
    });
  };

  const openAudio = (track: EchooAudio) => {
    router.push({
      pathname: '/audio-player',
      params: {
        audioId: track.id,
        title: track.title,
        subtitle: track.subtitle || track.artistName || station?.name || 'Echoo Audio',
        coverArt: track.coverArt || '',
        fileUrl: track.fileUrl || '',
        genre: track.genre || '',
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerBackHeader title="Station" />

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} size="large" />
            <Text style={styles.loadingText}>Loading station...</Text>
          </View>
        ) : null}

        {!loading && error && !station ? (
          <ListenerEmptyState
            title="Station unavailable"
            subtitle={error}
            action="Try again"
            onAction={load}
            icon={<Radio color={palette.blue} size={25} />}
          />
        ) : null}

        {!loading && station ? (
          <>
            <View style={styles.cover}>
              {station.coverArt ? (
                <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <LinearGradient colors={['#2457E9', '#071126']} style={StyleSheet.absoluteFillObject} />
              )}
              <LinearGradient
                colors={['rgba(4,9,22,0.03)', 'rgba(4,9,22,0.82)']}
                style={StyleSheet.absoluteFillObject}
              />
              {live ? (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              ) : null}
              <View style={styles.coverCopy}>
                <Text style={styles.category}>{station.category || 'Echoo Station'}</Text>
                <Text style={styles.stationName}>{station.name}</Text>
                <View style={styles.audienceLine}>
                  <Users color="#FFFFFF" size={14} />
                  <Text style={styles.audienceText}>{station.followerCount || 0} followers</Text>
                  {station.listenerCount ? (
                    <>
                      <View style={styles.metaDot} />
                      <Text style={styles.audienceText}>{station.listenerCount} listening</Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[styles.followButton, following && styles.followButtonActive]}
                onPress={toggleFollow}
                disabled={followBusy}
              >
                {followBusy ? (
                  <ActivityIndicator color={following ? '#FFFFFF' : palette.blue} />
                ) : (
                  <Heart
                    color={following ? '#FFFFFF' : palette.blue}
                    fill={following ? '#FFFFFF' : 'transparent'}
                    size={19}
                  />
                )}
                <Text style={[styles.followText, following && styles.followTextActive]}>
                  {following ? 'Following' : 'Follow station'}
                </Text>
              </Pressable>

              {live ? (
                <Pressable style={styles.listenButton} onPress={openLive}>
                  <Headphones color="#FFFFFF" size={19} />
                  <Text style={styles.listenText}>{signedIn ? 'Listen live' : 'Sign in to listen'}</Text>
                </Pressable>
              ) : null}
            </View>

            {error ? <Text style={styles.inlineError}>{error}</Text> : null}

            <ListenerSectionHeader title="Published audio" />
            <Text style={styles.sectionHint}>
              Public recordings published by {station.owner?.displayName || 'this station creator'}.
            </Text>

            {audioLoading ? (
              <View style={styles.audioLoadingCard}>
                <ActivityIndicator color={palette.blue} />
                <Text style={styles.audioLoadingText}>Loading published audio...</Text>
              </View>
            ) : null}

            {!audioLoading && audioError ? (
              <View style={styles.audioErrorCard}>
                <Text style={styles.audioErrorTitle}>Published audio could not be loaded</Text>
                <Text style={styles.audioErrorText}>{audioError}</Text>
                <Pressable onPress={load} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}

            {!audioLoading && !audioError && publishedAudio.length ? (
              <View style={styles.audioList}>
                {publishedAudio.map((track) => (
                  <Pressable key={track.id} style={styles.audioRow} onPress={() => openAudio(track)}>
                    <View style={styles.audioArt}>
                      {track.coverArt ? (
                        <Image
                          source={{ uri: track.coverArt }}
                          style={StyleSheet.absoluteFillObject}
                          contentFit="cover"
                        />
                      ) : (
                        <Music2 color={palette.blue} size={22} />
                      )}
                    </View>
                    <View style={styles.audioCopy}>
                      <Text style={styles.audioTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.audioSubtitle} numberOfLines={1}>
                        {track.genre || 'Audio'} · {track.playCount || 0} plays
                      </Text>
                      <View style={styles.durationLine}>
                        <Clock3 color={palette.faint} size={12} />
                        <Text style={styles.durationText}>{formatDuration(track.duration)}</Text>
                      </View>
                    </View>
                    <View style={styles.audioPlayButton}>
                      <Play color="#FFFFFF" fill="#FFFFFF" size={16} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {!audioLoading && !audioError && !publishedAudio.length ? (
              <ListenerEmptyState
                title="No published audio yet"
                subtitle="When this creator publishes an audio recording, episode, teaching or show, listeners will see it here."
                icon={<Music2 color={palette.blue} size={24} />}
              />
            ) : null}

            <ListenerSectionHeader title="About this station" />
            <View style={styles.infoCard}>
              <Text style={styles.description}>
                {station.description || 'This station has not added a public description yet.'}
              </Text>
              {station.owner ? (
                <View style={styles.ownerRow}>
                  <View style={styles.ownerAvatar}>
                    {station.owner.avatar ? (
                      <Image source={{ uri: station.owner.avatar }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    ) : (
                      <Text style={styles.ownerInitial}>{station.owner.displayName.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.ownerCopy}>
                    <Text style={styles.ownerLabel}>CREATOR</Text>
                    <Text style={styles.ownerName}>{station.owner.displayName}</Text>
                    <Text style={styles.ownerHandle}>@{station.owner.username}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            <ListenerSectionHeader title="Live status" />
            {live ? (
              <Pressable style={styles.liveCard} onPress={openLive}>
                <View style={styles.liveIcon}>
                  <BellRing color={palette.red} size={22} />
                </View>
                <View style={styles.liveCopy}>
                  <Text style={styles.liveTitle}>{live.title}</Text>
                  <Text style={styles.liveText}>{live.listenerCount || 0} people are listening now</Text>
                </View>
                <Headphones color={palette.blue} size={22} />
              </Pressable>
            ) : (
              <ListenerEmptyState
                title="This station is not live"
                subtitle="When the creator starts a public broadcast, the live room will appear here automatically."
                icon={<Radio color={palette.blue} size={24} />}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 52 },
  loadingState: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  cover: { height: 310, borderRadius: 27, overflow: 'hidden', borderWidth: 1, borderColor: palette.lineStrong, marginTop: 8 },
  liveBadge: { position: 'absolute', top: 16, left: 16, backgroundColor: palette.red, borderRadius: 9, minHeight: 29, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  coverCopy: { position: 'absolute', left: 18, right: 18, bottom: 18 },
  category: { color: '#DDE5F5', fontSize: 11.5, fontWeight: '800' },
  stationName: { color: '#FFFFFF', fontSize: 31, lineHeight: 34, fontWeight: '900', letterSpacing: -0.9, marginTop: 3 },
  audienceLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  audienceText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700' },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.55)', marginHorizontal: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 13 },
  followButton: { flex: 1, minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: palette.blue, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  followButtonActive: { backgroundColor: palette.blue },
  followText: { color: palette.blue, fontSize: 12.5, fontWeight: '900' },
  followTextActive: { color: '#FFFFFF' },
  listenButton: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  listenText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
  inlineError: { color: palette.red, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 9 },
  sectionHint: { color: palette.muted, fontSize: 11.5, lineHeight: 17, marginTop: -5, marginBottom: 10 },
  audioLoadingCard: { minHeight: 72, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  audioLoadingText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  audioErrorCard: { borderRadius: 18, borderWidth: 1, borderColor: `${palette.red}55`, backgroundColor: palette.surface, padding: 15 },
  audioErrorTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  audioErrorText: { color: palette.muted, fontSize: 11.5, lineHeight: 17, marginTop: 4 },
  retryButton: { alignSelf: 'flex-start', marginTop: 10, minHeight: 38, borderRadius: 12, backgroundColor: palette.blue, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '900' },
  audioList: { gap: 9 },
  audioRow: { minHeight: 76, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  audioArt: { width: 54, height: 54, borderRadius: 14, backgroundColor: palette.blueSoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  audioCopy: { flex: 1 },
  audioTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  audioSubtitle: { color: palette.muted, fontSize: 11, marginTop: 3 },
  durationLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  durationText: { color: palette.faint, fontSize: 10.5, fontWeight: '700' },
  audioPlayButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  infoCard: { borderRadius: 19, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 15 },
  description: { color: palette.ink2, fontSize: 12.5, lineHeight: 19 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.line },
  ownerAvatar: { width: 48, height: 48, borderRadius: 15, backgroundColor: palette.blue, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ownerInitial: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  ownerCopy: { flex: 1, paddingLeft: 11 },
  ownerLabel: { color: palette.blue, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8 },
  ownerName: { color: palette.ink, fontSize: 13.5, fontWeight: '900', marginTop: 2 },
  ownerHandle: { color: palette.muted, fontSize: 11, marginTop: 1 },
  liveCard: { minHeight: 78, borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  liveIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: `${palette.red}16`, alignItems: 'center', justifyContent: 'center' },
  liveCopy: { flex: 1 },
  liveTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  liveText: { color: palette.muted, fontSize: 11, marginTop: 3 },
});