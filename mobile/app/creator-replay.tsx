import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronLeft, Clock3, Radio, Send, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerToast } from '@/src/components/ListenerV2';
import {
  EchooBroadcastProcessing,
  discardCreatorReplay,
  getCreatorBroadcastProcessing,
  publishCreatorReplay,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const statusLabel = (value?: string) => String(value || 'pending').replace(/_/g, ' ');

export default function CreatorReplayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ broadcastId?: string; title?: string }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const broadcastId = String(params.broadcastId || '');

  const [processing, setProcessing] = useState<EchooBroadcastProcessing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!broadcastId) return;
      try {
        const next = await getCreatorBroadcastProcessing(broadcastId);
        if (active) setProcessing(next);
      } catch (error: any) {
        if (active) setToast(error?.message || 'Could not load replay status.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [broadcastId]);

  const broadcast = processing?.broadcast || null;
  const audioStatus = broadcast?.assetStatus?.audio || 'processing';
  const replayReady = audioStatus === 'ready' && Boolean(broadcast?.replayAudio);

  const publish = async () => {
    if (!broadcastId) return;
    setBusy(true);
    try {
      await publishCreatorReplay(broadcastId, 'public');
      setToast('Replay published.');
      const next = await getCreatorBroadcastProcessing(broadcastId);
      setProcessing(next);
    } catch (error: any) {
      setToast(error?.message || 'Replay is not ready to publish yet.');
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    Alert.alert('Discard replay?', 'This asks Echoo not to keep the replay for listeners.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await discardCreatorReplay(broadcastId);
            setToast('Replay discard requested.');
            const next = await getCreatorBroadcastProcessing(broadcastId);
            setProcessing(next);
          } catch (error: any) {
            setToast(error?.message || 'Could not discard replay now.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.replace('/creator')}>
          <ChevronLeft color={palette.ink} size={25} />
        </Pressable>
        <Text style={styles.topTitle}>Replay status</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            {replayReady ? <CheckCircle2 color={palette.green} size={34} /> : <Clock3 color={palette.blue} size={34} />}
          </View>
          <Text style={styles.title}>{String(params.title || broadcast?.title || 'Broadcast replay')}</Text>
          <Text style={styles.subtitle}>
            {replayReady ? 'Replay is ready to publish.' : 'Echoo is finalizing the server replay.'}
          </Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Processing</Text>
          {loading ? <ActivityIndicator color={palette.blue} /> : null}
          <StatusRow label="Audio" value={statusLabel(audioStatus)} palette={palette} />
          <StatusRow label="Transcript" value={statusLabel(broadcast?.assetStatus?.transcript)} palette={palette} />
          {(processing?.jobs || []).slice(0, 5).map((job) => (
            <StatusRow key={job.id} label={statusLabel(job.jobType)} value={statusLabel(job.status)} palette={palette} />
          ))}
        </View>

        <ListenerToast message={toast} tone="info" />

        <View style={styles.controls}>
          <Pressable style={[styles.primaryButton, !replayReady && styles.disabledButton]} onPress={publish} disabled={!replayReady || busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Send color="#FFFFFF" size={19} />}
            <Text style={styles.primaryButtonText}>Publish replay</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={discard} disabled={busy}>
            <Trash2 color={palette.red} size={18} />
            <Text style={styles.secondaryButtonText}>Discard</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusRow({ label, value, palette }: { label: string; value: string; palette: EchooColors }) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.statusRow}>
      <Radio color={palette.blue} size={15} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 48 },
  hero: { borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 22, alignItems: 'center' },
  heroIcon: { width: 76, height: 76, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: palette.ink, fontSize: 23, lineHeight: 28, fontWeight: '900', textAlign: 'center', marginTop: 14 },
  subtitle: { color: palette.muted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  statusCard: { marginTop: 14, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 14 },
  statusTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', marginBottom: 8 },
  statusRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: palette.line },
  statusLabel: { flex: 1, color: palette.ink, fontSize: 12.5, fontWeight: '800', textTransform: 'capitalize' },
  statusValue: { color: palette.muted, fontSize: 11.5, fontWeight: '800', textTransform: 'capitalize' },
  controls: { marginTop: 18, gap: 10 },
  primaryButton: { minHeight: 52, borderRadius: 26, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  secondaryButton: { minHeight: 50, borderRadius: 25, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButtonText: { color: palette.ink, fontSize: 13, fontWeight: '900' },
});
