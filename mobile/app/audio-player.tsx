import { Audio, AVPlaybackStatus } from 'expo-av';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Heart,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Share2,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ListenerBackHeader } from '@/src/components/ListenerV2';
import {
  getSavedAudio,
  hasEchooSession,
  saveAudio,
  unsaveAudio,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function AudioPlayerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    audioId?: string;
    title?: string;
    subtitle?: string;
    coverArt?: string;
    fileUrl?: string;
    genre?: string;
  }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const audioId = String(params.audioId || '');
  const title = String(params.title || 'Echoo Audio');
  const subtitle = String(params.subtitle || params.genre || 'Echoo Creator');
  const coverArt = params.coverArt ? String(params.coverArt) : '';
  const fileUrl = params.fileUrl ? String(params.fileUrl) : '';

  const soundRef = useRef<Audio.Sound | null>(null);
  const [loading, setLoading] = useState(Boolean(fileUrl));
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    const prepare = async () => {
      const session = await hasEchooSession();
      if (!active) return;
      setSignedIn(session);
      if (session && audioId) {
        getSavedAudio()
          .then((tracks) => {
            if (active) setSaved(tracks.some((track) => track.id === audioId));
          })
          .catch(() => undefined);
      }

      if (!fileUrl) {
        setLoading(false);
        setError('This audio item does not have a playable media URL.');
        return;
      }

      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: fileUrl },
          { shouldPlay: true, progressUpdateIntervalMillis: 500 },
          (status) => handleStatus(status)
        );
        if (!active) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        setPlaying(true);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || 'Could not play this audio.');
      } finally {
        if (active) setLoading(false);
      }
    };

    const handleStatus = (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setPlaying(status.isPlaying);
      setPosition(status.positionMillis || 0);
      setDuration(status.durationMillis || 0);
      if (status.didJustFinish) setPlaying(false);
    };

    prepare();

    return () => {
      active = false;
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) sound.unloadAsync().catch(() => undefined);
    };
  }, [audioId, fileUrl]);

  const togglePlayback = async () => {
    const sound = soundRef.current;
    if (!sound) return;
    if (playing) await sound.pauseAsync();
    else await sound.playAsync();
  };

  const seekBy = async (deltaMs: number) => {
    const sound = soundRef.current;
    if (!sound) return;
    const next = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, position + deltaMs));
    await sound.setPositionAsync(next);
  };

  const toggleSaved = async () => {
    if (!audioId) return;
    if (!signedIn) {
      router.push('/auth');
      return;
    }
    setSaving(true);
    try {
      if (saved) {
        await unsaveAudio(audioId);
        setSaved(false);
      } else {
        await saveAudio(audioId);
        setSaved(true);
      }
    } catch (saveError: any) {
      setError(saveError?.message || 'Could not update your library.');
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    await Share.share({
      message: `${title} — ${subtitle} on Echoo`,
    });
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <ListenerBackHeader title="Now playing" />

        <View style={styles.artwork}>
          {coverArt ? (
            <Image source={{ uri: coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          ) : (
            <LinearGradient colors={['#2F63F6', '#071126']} style={StyleSheet.absoluteFillObject} />
          )}
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(3,8,22,0.2)']} style={StyleSheet.absoluteFillObject} />
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <Pressable style={[styles.iconButton, saved && styles.iconButtonActive]} onPress={toggleSaved} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={palette.blue} />
            ) : (
              <Heart color={saved ? '#FFFFFF' : palette.blue} fill={saved ? '#FFFFFF' : 'transparent'} size={21} />
            )}
          </Pressable>
          <Pressable style={styles.iconButton} onPress={share}>
            <Share2 color={palette.blue} size={20} />
          </Pressable>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progress * 100))}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>

        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.statusText}>Loading audio...</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.controls}>
          <Pressable style={styles.seekButton} onPress={() => seekBy(-15000)} disabled={!soundRef.current}>
            <RotateCcw color={palette.ink} size={25} />
            <Text style={styles.seekText}>15</Text>
          </Pressable>
          <Pressable style={styles.playButton} onPress={togglePlayback} disabled={!soundRef.current}>
            {playing ? (
              <Pause color="#FFFFFF" fill="#FFFFFF" size={31} />
            ) : (
              <Play color="#FFFFFF" fill="#FFFFFF" size={31} />
            )}
          </Pressable>
          <Pressable style={styles.seekButton} onPress={() => seekBy(15000)} disabled={!soundRef.current}>
            <RotateCw color={palette.ink} size={25} />
            <Text style={styles.seekText}>15</Text>
          </Pressable>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Published audio</Text>
          <Text style={styles.infoText}>
            Echoo streams the creator's published media URL directly. Saving this item adds it to your account library when you are signed in.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0:00';
  const seconds = Math.floor(value / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  artwork: { width: '100%', aspectRatio: 1, maxHeight: 380, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: palette.lineStrong, marginTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 20 },
  titleCopy: { flex: 1 },
  title: { color: palette.ink, fontSize: 25, lineHeight: 29, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { color: palette.muted, fontSize: 12.5, marginTop: 5 },
  iconButton: { width: 43, height: 43, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  iconButtonActive: { backgroundColor: palette.blue, borderColor: palette.blue },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: palette.lineStrong, overflow: 'hidden', marginTop: 24 },
  progressFill: { height: '100%', backgroundColor: palette.blue, borderRadius: 3 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  timeText: { color: palette.muted, fontSize: 10.5, fontWeight: '700' },
  statusRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  statusText: { color: palette.muted, fontSize: 11.5, fontWeight: '700' },
  errorText: { color: palette.red, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30, marginTop: 18 },
  seekButton: { width: 52, height: 52, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  seekText: { position: 'absolute', color: palette.ink, fontSize: 8, fontWeight: '900', marginTop: 1 },
  playButton: { width: 70, height: 70, borderRadius: 35, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', shadowColor: '#2F63F6', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  infoCard: { marginTop: 'auto', borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, padding: 14 },
  infoTitle: { color: palette.ink, fontSize: 12.5, fontWeight: '900' },
  infoText: { color: palette.muted, fontSize: 10.8, lineHeight: 16, marginTop: 3 },
});
