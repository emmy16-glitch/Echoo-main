import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useGuardedRouter } from '@/src/navigation/useGuardedRouter';
import { ChevronDown, Headphones, MessageCircle, MoreVertical, Radio, Share2, Square } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { friendlyErrorMessage } from '@/src/components/ListenerV2';
import { LiveChatSheet } from '@/src/components/LiveChatSheet';
import { getBroadcastPresence } from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LivePlaybackItem, usePlayback } from '@/src/playback/PlaybackProvider';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function LiveRoomScreen() {
  const { router } = useGuardedRouter();
  const params = useLocalSearchParams<{
    broadcastId?: string;
    title?: string;
    stationName?: string;
    stationId?: string;
    coverArt?: string;
  }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const playback = usePlayback();
  const playLive = playback.playLive;
  const stopPlayback = playback.stop;

  const broadcastId = String(params.broadcastId || '');
  const title = String(params.title || 'Live broadcast');
  const stationName = String(params.stationName || 'Echoo Station');
  const stationId = String(params.stationId || '');
  const coverArt = params.coverArt ? String(params.coverArt) : '';
  const requestedLive = useMemo<LivePlaybackItem>(
    () => ({
      kind: 'live',
      id: broadcastId,
      title,
      subtitle: stationName,
      coverArt,
    }),
    [broadcastId, coverArt, stationName, title]
  );

  const [preparing, setPreparing] = useState(true);
  const [prepareError, setPrepareError] = useState('');
  const [listenerCount, setListenerCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const liveEndedRef = useRef(false);
  const isCurrentLive = playback.current?.kind === 'live' && playback.current.id === broadcastId;
  const listening = isCurrentLive && playback.isPlaying;
  const loading = preparing || (isCurrentLive && playback.isLoading);
  const error = prepareError || (isCurrentLive ? playback.error : '');
  const broadcastEnded = /live broadcast has ended/i.test(error);
  const nativeModuleUnavailable = isCurrentLive && playback.liveNativeUnavailable;
  const shareLive = useCallback(async () => {
    try {
      await Share.share({ message: `Listen to ${title} live on Echoo: https://echoo.digi02.org/listen/live/${encodeURIComponent(broadcastId)}` });
    } catch (shareError: any) {
      Alert.alert('Could not share broadcast', friendlyErrorMessage(shareError, 'Please try again.'));
    }
  }, [broadcastId, title]);

  const stopListening = useCallback(() => {
    playback.stop();
    router.back();
  }, [playback, router]);

  const applyPresence = useCallback((presence: { status?: string; listenerCount?: number } | null) => {
    const status = String(presence?.status || '');
    setListenerCount(Number(presence?.listenerCount) || 0);

    if (!status || ['starting', 'live'].includes(status) || liveEndedRef.current) return;
    liveEndedRef.current = true;
    stopPlayback();
    setPrepareError('This live broadcast has ended.');
  }, [stopPlayback]);

  useEffect(() => {
    liveEndedRef.current = false;
  }, [broadcastId]);

  useEffect(() => {
    let active = true;

    const prepare = async () => {
      setPreparing(true);
      setPrepareError('');

      try {
        if (!broadcastId) throw new Error('Broadcast ID is missing.');

        const presence = await getBroadcastPresence(broadcastId).catch(() => null);
        if (!active) return;
        applyPresence(presence);
        if (liveEndedRef.current) return;

        if (!isCurrentLive) await playLive(requestedLive);
      } catch (prepareError: any) {
        if (!active) return;
        setPrepareError(friendlyErrorMessage(prepareError, 'Could not join this live broadcast.'));
      } finally {
        if (active) setPreparing(false);
      }
    };

    prepare();
    return () => {
      active = false;
    };
  }, [applyPresence, broadcastId, isCurrentLive, playLive, requestedLive]);

  useEffect(() => {
    if (!broadcastId || nativeModuleUnavailable) return;
    const timer = setInterval(() => {
      getBroadcastPresence(broadcastId)
        .then(applyPresence)
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [applyPresence, broadcastId, nativeModuleUnavailable]);

  const roomContent = (
    <LiveRoomContent
      title={title}
      stationName={stationName}
      coverArt={coverArt}
      listenerCount={listenerCount}
      listening={listening}
      broadcastEnded={broadcastEnded}
      playbackError={error}
      onRetry={() => { void playLive(requestedLive); }}
      onVisit={() => stationId ? router.replace({ pathname: '/station', params: { stationId } }) : router.replace('/(tabs)' as any)}
      onClose={() => router.back()}
      onStop={stopListening}
      onShare={() => { void shareLive(); }}
      onOpenChat={() => setChatOpen(true)}
      palette={palette}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {loading && !isCurrentLive ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.blue} size="large" />
            <Text style={styles.stateTitle}>Connecting to Echoo Live...</Text>
            <Text style={styles.stateText}>Preparing your receive-only listener session.</Text>
          </View>
        ) : null}

        {!loading && nativeModuleUnavailable ? (
          <View style={styles.centerState}>
            <View style={styles.errorIcon}><Headphones color={palette.blue} size={26} /></View>
            <Text style={styles.stateTitle}>Live audio needs the Echoo development build</Text>
            <Text style={styles.stateText}>
              Expo Go does not include the LiveKit native WebRTC module. The rest of Echoo can run in Expo Go, but live listening requires an iOS/Android development build.
            </Text>
            <Pressable style={styles.backHomeButton} onPress={() => router.back()}>
              <Text style={styles.backHomeText}>Back to Echoo</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !nativeModuleUnavailable && (isCurrentLive || broadcastEnded || error) ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {roomContent}
          </ScrollView>
        ) : null}
        <LiveChatSheet
          visible={chatOpen}
          broadcastId={broadcastId}
          title={title}
          onClose={() => setChatOpen(false)}
        />
      </View>
    </SafeAreaView>
  );
}

function LiveRoomContent({
  title,
  stationName,
  coverArt,
  listenerCount,
  listening,
  broadcastEnded,
  playbackError,
  onRetry,
  onVisit,
  onClose,
  onStop,
  onShare,
  onOpenChat,
  palette,
}: {
  title: string;
  stationName: string;
  coverArt: string;
  listenerCount: number;
  listening: boolean;
  broadcastEnded: boolean;
  playbackError: string;
  onRetry: () => void;
  onVisit: () => void;
  onClose: () => void;
  onStop: () => void;
  onShare: () => void;
  onOpenChat: () => void;
  palette: EchooColors;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { width, height } = useWindowDimensions();
  const artworkSize = Math.max(165, Math.min(width - 48, height * 0.43, 390));

  return (
    <View style={styles.roomSurface}>
      {coverArt ? <Image source={{ uri: coverArt }} style={styles.backgroundArtwork} contentFit="cover" blurRadius={56} /> : null}
      <LinearGradient colors={['rgba(44,25,17,0.35)', 'rgba(42,26,18,0.62)', 'rgba(43,27,20,0.88)']} style={StyleSheet.absoluteFillObject} />
      <View style={styles.streamingHeader}>
        <Pressable style={styles.headerIcon} onPress={onClose}><ChevronDown color="#FFFFFF" size={27} /></Pressable>
        <Text style={styles.streamingTitle}>Now Streaming</Text>
        <Pressable style={styles.headerIcon} accessibilityLabel="Live stream options" onPress={() => Alert.alert('Live stream', 'Choose an action', [
          { text: 'Share broadcast', onPress: onShare },
          { text: 'Stop listening', style: 'destructive', onPress: onStop },
          { text: 'Cancel', style: 'cancel' },
        ])}><MoreVertical color="#FFFFFF" size={25} /></Pressable>
      </View>
      <View style={[styles.artworkWrap, { width: artworkSize, height: artworkSize, alignSelf: 'center' }]}>
        {coverArt ? (
          <Image source={{ uri: coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        ) : (
          <LinearGradient colors={[palette.blue, palette.night2]} style={StyleSheet.absoluteFillObject} />
        )}
        <LinearGradient colors={['rgba(2,8,24,0.05)', 'rgba(2,8,24,0.68)']} style={StyleSheet.absoluteFillObject} />
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>Live Now</Text>
        </View>
      </View>

      <View style={styles.roomCopy}>
        <Text style={styles.roomTitle}>{title}</Text>
        <Text style={styles.stationName}>{stationName}</Text>
      </View>

      {broadcastEnded ? <View style={styles.liveState}><View style={styles.endedNotice}><Radio color={palette.blue} size={21} /><Text style={styles.endedNoticeText}>This live stream has ended.</Text></View><Text style={styles.liveStateTitle}>Thanks for listening</Text><Text style={styles.liveStateText}>Keep exploring audio from {stationName}.</Text><Pressable style={styles.primaryControl} onPress={onVisit}><Text style={styles.primaryControlText}>Visit page</Text></Pressable><Pressable style={styles.secondaryAction} onPress={onClose}><Text style={styles.secondaryActionText}>Browse other audio</Text></Pressable></View> : playbackError ? <View style={styles.liveState}><View style={styles.reconnectingLine}><ActivityIndicator color="#FFFFFF" size="large" /><Text style={styles.liveStateTitle}>Reconnecting...</Text></View><Text style={styles.liveStateText}>You’ll return to the live point when the connection is restored</Text><Pressable style={styles.primaryControl} onPress={onRetry}><Text style={styles.primaryControlText}>Retry now</Text></Pressable></View> : <View style={styles.controls}><View style={styles.actionsRow}><View style={styles.liveStats}><Headphones color="#FFFFFF" size={22} /><Text style={styles.liveStatsText}>{listenerCount || 0} listening</Text></View><Pressable style={styles.roundControl} onPress={onOpenChat} accessibilityLabel="Open live comments"><MessageCircle color="#FFFFFF" size={23} /></Pressable><Pressable style={styles.roundControl} onPress={onShare} accessibilityLabel="Share live broadcast"><Share2 color="#FFFFFF" size={23} /></Pressable></View><Pressable style={styles.stopControl} onPress={onStop} accessibilityLabel="Stop listening"><Square color="#FFFFFF" fill="#FFFFFF" size={22} /></Pressable></View>}
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#6C4D39' },
  content: { flex: 1 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateTitle: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 18, textAlign: 'center', marginTop: 14 },
  stateText: { color: 'rgba(255,255,255,0.82)', fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 5, maxWidth: 330 },
  errorIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  backHomeButton: { marginTop: 16, minHeight: 44, borderRadius: 14, paddingHorizontal: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  backHomeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  roomSurface: { flex: 1, paddingHorizontal: 24, paddingBottom: 28, overflow: 'hidden' },
  backgroundArtwork: { ...StyleSheet.absoluteFillObject, opacity: 0.58, transform: [{ scale: 1.2 }] },
  streamingHeader: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  streamingTitle: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 18 },
  artworkWrap: { width: '100%', aspectRatio: 1, maxHeight: 360, borderRadius: 18, overflow: 'hidden' },
  liveBadge: { position: 'absolute', top: 16, left: 16, minHeight: 34, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF4D59' },
  liveBadgeText: { color: '#777777', fontSize: 13, fontWeight: '700' },
  waveArea: { position: 'absolute', left: 20, right: 20, bottom: 20, minHeight: 64, borderRadius: 18, backgroundColor: 'rgba(7,17,38,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 13 },
  waveBar: { width: 4, borderRadius: 3, backgroundColor: '#FFFFFF' },
  roomCopy: { paddingTop: 20 },
  stationName: { color: 'rgba(255,255,255,0.82)', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 5 },
  roomTitle: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 18, lineHeight: 24 },
  listenerLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  listenerText: { color: palette.muted, fontSize: 11.5, fontWeight: '700' },
  statusCard: { marginTop: 16, minHeight: 74, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  statusCopy: { flex: 1 },
  statusTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  statusText: { color: palette.muted, fontSize: 10.8, lineHeight: 15, marginTop: 3 },
  controls: { alignItems: 'center', marginTop: 'auto', paddingTop: 28 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  liveStats: { minHeight: 50, borderRadius: 25, paddingHorizontal: 15, backgroundColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveStatsText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  roundControl: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  stopControl: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#C90028', alignItems: 'center', justifyContent: 'center', marginTop: 32 },
  liveState: { paddingTop: 30, alignItems: 'stretch', flex: 1 },
  endedNotice: { minHeight: 66, borderRadius: 12, backgroundColor: '#E5EEFE', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  endedNoticeText: { color: palette.blue, fontSize: 13.5, fontWeight: '800' },
  liveStateTitle: { color: '#FFFFFF', fontSize: 26, lineHeight: 31, fontWeight: '900', textAlign: 'center', marginTop: 22 },
  liveStateText: { color: 'rgba(255,255,255,0.86)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  reconnectingLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  secondaryAction: { minHeight: 56, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  secondaryActionText: { color: palette.blue, fontSize: 15, fontWeight: '900' },
  secondaryControl: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryControlText: { color: palette.ink, fontSize: 12.5, fontWeight: '900' },
  chatControl: { width: 52, height: 52, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  primaryControl: { flexGrow: 1, flexShrink: 1, flexBasis: 170, minHeight: 56, borderRadius: 28, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, marginTop: 32 },
  primaryControlDisabled: { opacity: 0.72 },
  primaryControlText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' },
});
