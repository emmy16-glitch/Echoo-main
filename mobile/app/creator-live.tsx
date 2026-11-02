import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ImagePlus,
  MessageCircle,
  Mic,
  MicOff,
  Radio,
  Square,
  Users,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  PermissionsAndroid,
  Platform,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Room as LiveKitRoom } from 'livekit-client';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ListenerToast,
} from '@/src/components/ListenerV2';
import { LiveChatSheet } from '@/src/components/LiveChatSheet';
import { usePlayback } from '@/src/playback/PlaybackProvider';
import {
  confirmCreatorBroadcastLive,
  createCreatorBroadcast,
  discardCreatorReplay,
  endCreatorBroadcast,
  getBroadcastPresence,
  startCreatorBroadcast,
  updateCreatorBroadcastCover,
  uploadBroadcastCover,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';
import {
  ensureLiveAudioNotificationPermission,
  startLiveAudioService,
  stopLiveAudioService,
} from 'echoo-live-audio-service';

type CreatorLiveState = 'idle' | 'preparing' | 'connecting' | 'live' | 'ending' | 'ended' | 'error';

type BroadcastCoverDraft = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
};

let liveKitGlobalsRegistered = false;

async function loadLiveKitForCreator() {
  const [nativeLiveKit, liveKitClient] = await Promise.all([
    import('@livekit/react-native'),
    import('livekit-client'),
  ]);

  if (!liveKitGlobalsRegistered) {
    nativeLiveKit.registerGlobals();
    liveKitGlobalsRegistered = true;
  }

  return { nativeLiveKit, liveKitClient };
}

async function ensureMicrophonePermission() {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return true;

  if (current.canAskAgain === false) {
    Alert.alert(
      'Microphone access is off',
      'Turn on microphone access for Echoo in Settings before going live.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  const requested = await requestRecordingPermissionsAsync();
  if (requested.granted) return true;

  if (requested.canAskAgain === false) {
    Alert.alert(
      'Microphone access is off',
      'Turn on microphone access for Echoo in Settings before going live.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
  }

  return false;
}

export default function CreatorLiveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    broadcastId?: string;
    title?: string;
    stationId?: string;
    stationName?: string;
    coverArt?: string;
  }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const playback = usePlayback();

  const stationId = String(params.stationId || '');
  const stationName = String(params.stationName || 'Echoo Station');
  const existingBroadcastId = String(params.broadcastId || '');
  const existingCoverArt = params.coverArt ? String(params.coverArt) : '';
  const defaultTitle = useMemo(() => {
    const date = new Date();
    return `${stationName} live - ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }, [stationName]);

  const roomRef = useRef<LiveKitRoom | null>(null);
  const audioSessionRef = useRef<{ stopAudioSession: () => Promise<void> } | null>(null);
  const [title, setTitle] = useState(String(params.title || defaultTitle));
  const [state, setState] = useState<CreatorLiveState>('idle');
  const [broadcastId, setBroadcastId] = useState('');
  const [broadcastCover, setBroadcastCover] = useState<BroadcastCoverDraft | null>(null);
  const [broadcastCoverUploaded, setBroadcastCoverUploaded] = useState(Boolean(existingCoverArt));
  const [uploadedBroadcastCoverArt, setUploadedBroadcastCoverArt] = useState(existingCoverArt);
  const [listenerCount, setListenerCount] = useState(0);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  const live = state === 'live';
  const broadcasting = live || state === 'ending';
  const busy = ['preparing', 'connecting', 'ending'].includes(state);

  const cleanupLiveKit = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      await room.localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      await room.disconnect(true).catch(() => undefined);
    }
    const audioSession = audioSessionRef.current;
    audioSessionRef.current = null;
    if (audioSession) await audioSession.stopAudioSession().catch(() => undefined);
    await stopLiveAudioService();
  }, []);

  useEffect(() => () => {
    void cleanupLiveKit();
  }, [cleanupLiveKit]);

  useEffect(() => {
    if (!live || !broadcastId) return;
    const timer = setInterval(() => {
      getBroadcastPresence(broadcastId)
        .then((presence) => setListenerCount(Number(presence?.listenerCount) || 0))
        .catch(() => undefined);
    }, 8000);
    return () => clearInterval(timer);
  }, [broadcastId, live]);

  const pickBroadcastCover = async () => {
    if (busy || live) return;
    setToast('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.86,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setBroadcastCover({
      uri: asset.uri,
      name: asset.fileName || 'echoo-broadcast-cover.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
    });
    setBroadcastCoverUploaded(false);
    setUploadedBroadcastCoverArt('');
    setState((currentState) => currentState === 'error' ? 'idle' : currentState);
    setToast('Broadcast Cover selected.');
  };

  const startLive = async () => {
    if (!stationId) {
      setToast('Set up a station before going live from mobile.');
      return;
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setToast('Add a broadcast title first.');
      return;
    }

    setToast('');
    setState('preparing');
    let startedBroadcastId = '';

    try {
      if (!broadcastCoverUploaded && !broadcastCover?.uri) {
        setState('idle');
        setToast('Add a Broadcast Cover before going live.');
        return;
      }

      const permission = await ensureMicrophonePermission();
      if (!permission) {
        setState('idle');
        setToast('Microphone permission is required to go live.');
        return;
      }

      let coverArtForBroadcast = uploadedBroadcastCoverArt;
      if (!broadcastCoverUploaded && broadcastCover?.uri) {
        coverArtForBroadcast = await uploadBroadcastCover(broadcastCover);
        if (!coverArtForBroadcast) throw new Error('Could not upload the Broadcast Cover.');
        setUploadedBroadcastCoverArt(coverArtForBroadcast);
        setBroadcastCoverUploaded(true);
      }

      playback.stop();

      // Android requires the microphone foreground service to be started while
      // Echoo is visible. Starting it after minimizing is restricted on Android 14+.
      if (Platform.OS === 'android') {
        void ensureLiveAudioNotificationPermission();
        const backgroundReady = await startLiveAudioService({
          title: cleanTitle,
          artist: stationName,
          broadcastId: existingBroadcastId,
          kind: 'broadcast',
        });
        if (!backgroundReady) {
          throw new Error('This Android build cannot keep microphone broadcasting active when minimized. Update Echoo and try again.');
        }
      }

      const { nativeLiveKit, liveKitClient } = await loadLiveKitForCreator();
      audioSessionRef.current = nativeLiveKit.AudioSession;
      await nativeLiveKit.AudioSession.configureAudio({
        android: {
          audioTypeOptions: nativeLiveKit.AndroidAudioTypePresets.communication,
        },
      });
      await nativeLiveKit.AudioSession.startAudioSession();

      const broadcast = existingBroadcastId
        ? { id: existingBroadcastId, title: cleanTitle }
        : await createCreatorBroadcast({
            title: cleanTitle,
            stationId,
            isPublic: true,
            coverArt: coverArtForBroadcast,
          });
      startedBroadcastId = broadcast.id;
      setBroadcastId(broadcast.id);

      if (existingBroadcastId && coverArtForBroadcast && coverArtForBroadcast !== existingCoverArt) {
        await updateCreatorBroadcastCover(existingBroadcastId, coverArtForBroadcast);
      }

      const credentials = await startCreatorBroadcast(broadcast.id);
      if (!credentials?.token || !credentials?.livekitUrl) {
        throw new Error('Echoo could not prepare the LiveKit room.');
      }

      setState('connecting');
      const room = new liveKitClient.Room({
        adaptiveStream: false,
        dynacast: false,
      });
      roomRef.current = room;

      room.on(liveKitClient.RoomEvent.Disconnected, () => {
        setToast('LiveKit disconnected. End and start again if listeners cannot hear you.');
      });
      room.on(liveKitClient.RoomEvent.Reconnecting, () => {
        setToast('Reconnecting live audio...');
      });
      room.on(liveKitClient.RoomEvent.Reconnected, () => {
        setToast('Live audio reconnected.');
      });

      await room.connect(credentials.livekitUrl, credentials.token, {
        autoSubscribe: false,
      });
      await room.localParticipant.setMicrophoneEnabled(
        true,
        {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        {
          name: 'echoo-studio-mix',
          source: liveKitClient.Track.Source.Microphone,
          stream: 'echoo-mobile-live',
        }
      );

      const confirmed = await confirmCreatorBroadcastLive(broadcast.id);
      setBroadcastId(confirmed.id || broadcast.id);
      setMuted(false);
      setState('live');
      setToast('You are live. You can minimize Echoo and continue broadcasting.');
    } catch (error: any) {
      await cleanupLiveKit();
      if (startedBroadcastId) {
        await endCreatorBroadcast(startedBroadcastId).catch(() => undefined);
      }
      setState('error');
      setToast(error?.message || 'Could not start mobile live.');
    }
  };

  const toggleMute = async () => {
    const room = roomRef.current;
    if (!room || !live) return;
    const nextMuted = !muted;
    setMuted(nextMuted);
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    } catch (error: any) {
      setMuted(!nextMuted);
      setToast(error?.message || 'Could not update microphone.');
    }
  };

  const finishLive = async (discardReplay: boolean) => {
    if (!broadcastId) {
      await cleanupLiveKit();
      setState('ended');
      return;
    }

    setState('ending');
    setToast('');
    try {
      await cleanupLiveKit();
      await endCreatorBroadcast(broadcastId);
      if (discardReplay) {
        await discardCreatorReplay(broadcastId).catch(() => null);
      }
      setState('ended');
      setToast(discardReplay ? 'Broadcast ended. Replay discard requested.' : 'Broadcast ended. Replay is processing.');
      if (!discardReplay) {
        router.replace({
          pathname: '/creator-replay' as any,
          params: { broadcastId, title },
        });
      }
    } catch (error: any) {
      setState('live');
      setToast(error?.message || 'Could not end broadcast.');
    }
  };

  const confirmEnd = () => {
    Alert.alert(
      'End broadcast?',
      'Choose whether Echoo should keep the replay after ending.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End, no replay', style: 'destructive', onPress: () => void finishLive(true) },
        { text: 'End and save', onPress: () => void finishLive(false) },
      ]
    );
  };

  // Back navigation must never disconnect the creator without explicitly
  // ending the broadcast on the server. Home and lock buttons still minimize
  // the app normally, with the native audio service running.
  // Android hardware Back is handled here; the on-screen Back follows the same rule.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (live) confirmEnd();
      else if (busy) setToast('Finish connecting before leaving the studio.');
      else return false;
      return true;
    });
    return () => subscription.remove();
  }, [live, busy, confirmEnd]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => live ? confirmEnd() : router.back()} disabled={busy}>
          <ChevronLeft color={palette.ink} size={25} />
        </Pressable>
        <Text style={styles.topTitle}>Mobile live</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.content}>
        <View style={styles.liveCard}>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, live && styles.statusDotLive]} />
            <Text style={styles.statusText}>
              {live ? 'ON AIR' : state === 'ended' ? 'ENDED' : 'READY'}
            </Text>
          </View>

          <View style={styles.micCircle}>
            {muted ? <MicOff color="#FFFFFF" size={56} /> : <Mic color="#FFFFFF" size={58} />}
          </View>

          <Text style={styles.heroTitle}>{live ? title.trim() : 'Broadcast with phone mic'}</Text>
          <Text style={styles.heroSubtitle}>
            {live
              ? `${listenerCount} listeners connected to ${stationName}.`
              : `${stationName} will receive your phone microphone as the live program.`}
          </Text>
        </View>

        {!live && state !== 'ended' ? (
          <View style={styles.formCard}>
            <Text style={styles.label}>Broadcast title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={!busy}
              placeholder="Add a title"
              placeholderTextColor={palette.faint}
              style={styles.input}
            />
            <View style={styles.stationRow}>
              <Radio color={palette.blue} size={19} />
              <View style={styles.stationCopy}>
                <Text style={styles.stationName}>{stationName}</Text>
                <Text style={styles.stationHint}>Selected station</Text>
              </View>
            </View>
            <Pressable style={styles.coverPicker} onPress={pickBroadcastCover} disabled={busy}>
              <ImagePlus color={palette.blue} size={20} />
              <View style={styles.stationCopy}>
                <Text style={styles.coverPickerTitle}>
                  {broadcastCover || broadcastCoverUploaded ? 'Broadcast Cover ready' : 'Add Broadcast Cover'}
                </Text>
                <Text style={styles.stationHint}>Required before going live</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {live ? (
          <View style={styles.liveStats}>
            <View style={styles.statTile}>
              <Users color={palette.blue} size={20} />
              <Text style={styles.statValue}>{listenerCount}</Text>
              <Text style={styles.statLabel}>Listeners</Text>
            </View>
            <View style={styles.statTile}>
              <CheckCircle2 color={palette.green} size={20} />
              <Text style={styles.statValue}>LiveKit</Text>
              <Text style={styles.statLabel}>Program audio</Text>
            </View>
          </View>
        ) : null}

        {state === 'ended' ? (
          <View style={styles.endedCard}>
            <CheckCircle2 color={palette.green} size={25} />
            <Text style={styles.endedTitle}>Broadcast ended</Text>
            <Text style={styles.endedText}>Replay finalization can continue in the background on the server.</Text>
          </View>
        ) : null}

        {state === 'error' ? (
          <View style={styles.errorCard}>
            <AlertTriangle color={palette.red} size={23} />
            <Text style={styles.errorText}>
              {toast || 'Could not start mobile live. Check the Broadcast Cover, microphone permission, network and creator access, then try again.'}
            </Text>
          </View>
        ) : null}

        <ListenerToast message={state === 'error' ? '' : toast} tone="info" />

        <View style={styles.controls}>
          {broadcasting ? (
            <>
              <Pressable style={styles.chatButton} onPress={() => setChatOpen(true)} accessibilityLabel="Open live chat">
                <MessageCircle color={palette.blue} size={21} />
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={toggleMute} disabled={busy}>
                {muted ? <Mic color={palette.ink} size={20} /> : <MicOff color={palette.ink} size={20} />}
                <Text style={styles.secondaryButtonText}>{muted ? 'Unmute' : 'Mute'}</Text>
              </Pressable>
              <Pressable style={styles.endButton} onPress={confirmEnd} disabled={busy}>
                {state === 'ending' ? <ActivityIndicator color="#FFFFFF" /> : <Square color="#FFFFFF" size={18} fill="#FFFFFF" />}
                <Text style={styles.endButtonText}>End</Text>
              </Pressable>
            </>
          ) : state === 'ended' ? (
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace(broadcastId ? {
                pathname: '/creator-replay' as any,
                params: { broadcastId, title },
              } : '/creator')}
            >
              <Text style={styles.primaryButtonText}>{broadcastId ? 'View replay status' : 'Back to Creator Studio'}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.primaryButton} onPress={startLive} disabled={busy}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Mic color="#FFFFFF" size={21} />}
              <Text style={styles.primaryButtonText}>
                {busy ? 'Preparing live...' : 'Go live'}
              </Text>
            </Pressable>
          )}
        </View>
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

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18 },
  liveCard: { minHeight: 300, borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', padding: 20 },
  statusPill: { position: 'absolute', top: 14, left: 14, minHeight: 30, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.faint },
  statusDotLive: { backgroundColor: palette.red },
  statusText: { color: palette.ink, fontSize: 10.5, fontWeight: '900' },
  micCircle: { width: 124, height: 124, borderRadius: 62, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: palette.ink, fontSize: 24, lineHeight: 29, fontWeight: '900', textAlign: 'center', marginTop: 18 },
  heroSubtitle: { color: palette.muted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 7, maxWidth: 300 },
  formCard: { marginTop: 14, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 14 },
  label: { color: palette.muted, fontSize: 11.5, fontWeight: '900', marginBottom: 8 },
  input: { minHeight: 50, borderRadius: 8, backgroundColor: palette.surfaceMuted, color: palette.ink, paddingHorizontal: 13, fontSize: 14, fontWeight: '800' },
  stationRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stationCopy: { flex: 1 },
  stationName: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  stationHint: { color: palette.muted, fontSize: 11, marginTop: 2 },
  coverPicker: { marginTop: 13, minHeight: 52, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  coverPickerTitle: { color: palette.ink, fontSize: 12.5, fontWeight: '900' },
  liveStats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statTile: { flex: 1, minHeight: 94, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 13, justifyContent: 'center' },
  statValue: { color: palette.ink, fontSize: 20, fontWeight: '900', marginTop: 8 },
  statLabel: { color: palette.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  endedCard: { marginTop: 14, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 16, alignItems: 'center' },
  endedTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', marginTop: 8 },
  endedText: { color: palette.muted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4 },
  errorCard: { marginTop: 14, borderRadius: 8, backgroundColor: `${palette.red}12`, borderWidth: 1, borderColor: `${palette.red}45`, padding: 13, flexDirection: 'row', gap: 10 },
  errorText: { flex: 1, color: palette.ink, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  controls: { marginTop: 'auto', paddingTop: 18, flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, minHeight: 54, borderRadius: 27, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: 54, borderRadius: 27, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  secondaryButtonText: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  chatButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  endButton: { flex: 1, minHeight: 54, borderRadius: 27, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  endButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
});
