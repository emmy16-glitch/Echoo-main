import { AudioSession, LiveKitRoom } from '@livekit/react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Headphones, Radio, Users, Volume2, X } from 'lucide-react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ListenerAuthCard, ListenerBackHeader } from '@/src/components/ListenerV2';
import {
  getBroadcastPresence,
  getListenerLiveKitCredentials,
  hasEchooSession,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type Credentials = {
  token: string;
  roomName: string;
  livekitUrl: string;
  broadcastId: string;
  role?: string;
};

export default function LiveRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    broadcastId?: string;
    title?: string;
    stationName?: string;
    coverArt?: string;
  }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const broadcastId = String(params.broadcastId || '');
  const title = String(params.title || 'Live broadcast');
  const stationName = String(params.stationName || 'Echoo Station');
  const coverArt = params.coverArt ? String(params.coverArt) : '';

  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(true);

  useEffect(() => {
    let active = true;

    const prepare = async () => {
      setLoading(true);
      setError('');
      try {
        const activeSession = await hasEchooSession();
        if (!active) return;
        setSignedIn(activeSession);

        if (!activeSession) {
          setLoading(false);
          return;
        }

        if (!broadcastId) throw new Error('Broadcast ID is missing.');

        const [nextCredentials, presence] = await Promise.all([
          getListenerLiveKitCredentials(broadcastId),
          getBroadcastPresence(broadcastId).catch(() => null),
        ]);

        if (!active) return;
        setCredentials(nextCredentials);
        setListenerCount(Number(presence?.listenerCount) || 0);
      } catch (prepareError: any) {
        if (!active) return;
        setError(prepareError?.message || 'Could not join this live broadcast.');
      } finally {
        if (active) setLoading(false);
      }
    };

    prepare();
    return () => {
      active = false;
    };
  }, [broadcastId]);

  useEffect(() => {
    if (!broadcastId || !signedIn) return;
    const timer = setInterval(() => {
      getBroadcastPresence(broadcastId)
        .then((presence) => setListenerCount(Number(presence?.listenerCount) || 0))
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [broadcastId, signedIn]);

  const roomContent = (
    <LiveRoomContent
      title={title}
      stationName={stationName}
      coverArt={coverArt}
      listenerCount={listenerCount}
      listening={listening}
      onToggleListening={() => setListening((value) => !value)}
      onClose={() => router.back()}
      palette={palette}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ListenerBackHeader title="Live room" />

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.blue} size="large" />
            <Text style={styles.stateTitle}>Connecting to Echoo Live...</Text>
            <Text style={styles.stateText}>Preparing your receive-only listener session.</Text>
          </View>
        ) : null}

        {!loading && !signedIn ? (
          <View style={styles.centerWrap}>
            <ListenerAuthCard
              title="Sign in to listen live"
              subtitle="Echoo live rooms use authenticated, receive-only LiveKit sessions for listeners."
              onPress={() => router.push('/auth')}
            />
          </View>
        ) : null}

        {!loading && signedIn && error ? (
          <View style={styles.centerState}>
            <View style={styles.errorIcon}><Radio color={palette.red} size={25} /></View>
            <Text style={styles.stateTitle}>Could not join live audio</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.backHomeButton} onPress={() => router.back()}>
              <Text style={styles.backHomeText}>Back to Live</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && signedIn && credentials && !error ? (
          listening ? (
            <LiveAudioConnection
              serverUrl={credentials.livekitUrl}
              token={credentials.token}
              onError={(message) => setError(message)}
            >
              {roomContent}
            </LiveAudioConnection>
          ) : (
            roomContent
          )
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function LiveAudioConnection({
  serverUrl,
  token,
  children,
  onError,
}: {
  serverUrl: string;
  token: string;
  children: ReactNode;
  onError: (message: string) => void;
}) {
  useEffect(() => {
    AudioSession.startAudioSession().catch((error) => {
      onError(error?.message || 'Could not start the device audio session.');
    });
    return () => {
      AudioSession.stopAudioSession();
    };
  }, [onError]);

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect
      audio={false}
      video={false}
      options={{ adaptiveStream: true }}
      onError={(roomError) => onError(roomError?.message || 'LiveKit connection failed.')}
    >
      {children}
    </LiveKitRoom>
  );
}

function LiveRoomContent({
  title,
  stationName,
  coverArt,
  listenerCount,
  listening,
  onToggleListening,
  onClose,
  palette,
}: {
  title: string;
  stationName: string;
  coverArt: string;
  listenerCount: number;
  listening: boolean;
  onToggleListening: () => void;
  onClose: () => void;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.roomSurface}>
      <View style={styles.artworkWrap}>
        {coverArt ? (
          <Image source={{ uri: coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <LinearGradient colors={['#2457E9', '#071126']} style={StyleSheet.absoluteFillObject} />
        )}
        <LinearGradient colors={['rgba(2,8,24,0.05)', 'rgba(2,8,24,0.68)']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <View style={styles.waveArea}>
          {[16, 28, 42, 25, 48, 34, 20, 38, 26, 44, 30].map((height, index) => (
            <View key={`${height}-${index}`} style={[styles.waveBar, { height }]} />
          ))}
        </View>
      </View>

      <View style={styles.roomCopy}>
        <Text style={styles.stationName}>{stationName}</Text>
        <Text style={styles.roomTitle}>{title}</Text>
        <View style={styles.listenerLine}>
          <Users color={palette.muted} size={15} />
          <Text style={styles.listenerText}>{listenerCount} listening now</Text>
        </View>
      </View>

      <View style={styles.statusCard}>
        <Volume2 color={palette.blue} size={20} />
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>{listening ? 'Listening live' : 'Live audio paused'}</Text>
          <Text style={styles.statusText}>
            Your listener token can subscribe to audio, but cannot publish microphone, video or data.
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable style={styles.secondaryControl} onPress={onClose}>
          <X color={palette.ink} size={21} />
          <Text style={styles.secondaryControlText}>Leave</Text>
        </Pressable>
        <Pressable style={styles.primaryControl} onPress={onToggleListening}>
          <Headphones color="#FFFFFF" size={21} />
          <Text style={styles.primaryControlText}>{listening ? 'Pause live audio' : 'Resume listening'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 },
  centerWrap: { flex: 1, justifyContent: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateTitle: { color: palette.ink, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 14 },
  stateText: { color: palette.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 5, maxWidth: 320 },
  errorIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: `${palette.red}18`, alignItems: 'center', justifyContent: 'center' },
  backHomeButton: { marginTop: 16, minHeight: 44, borderRadius: 14, paddingHorizontal: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  backHomeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  roomSurface: { flex: 1, paddingTop: 8 },
  artworkWrap: { width: '100%', aspectRatio: 1, maxHeight: 360, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: palette.lineStrong },
  liveBadge: { position: 'absolute', top: 16, left: 16, minHeight: 29, borderRadius: 9, backgroundColor: palette.red, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  liveBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  waveArea: { position: 'absolute', left: 20, right: 20, bottom: 20, minHeight: 64, borderRadius: 18, backgroundColor: 'rgba(7,17,38,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 13 },
  waveBar: { width: 4, borderRadius: 3, backgroundColor: '#FFFFFF' },
  roomCopy: { paddingTop: 18 },
  stationName: { color: palette.blue, fontSize: 12.5, fontWeight: '900' },
  roomTitle: { color: palette.ink, fontSize: 27, lineHeight: 31, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  listenerLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  listenerText: { color: palette.muted, fontSize: 11.5, fontWeight: '700' },
  statusCard: { marginTop: 16, minHeight: 74, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  statusCopy: { flex: 1 },
  statusTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  statusText: { color: palette.muted, fontSize: 10.8, lineHeight: 15, marginTop: 3 },
  controls: { flexDirection: 'row', gap: 10, marginTop: 'auto', paddingTop: 16 },
  secondaryControl: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryControlText: { color: palette.ink, fontSize: 12.5, fontWeight: '900' },
  primaryControl: { flex: 1, minHeight: 52, borderRadius: 16, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  primaryControlText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
});
