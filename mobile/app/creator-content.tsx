import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  Edit3,
  Eye,
  EyeOff,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  ListenerEmptyState,
  ListenerSkeletonRows,
  ListenerToast,
} from '@/src/components/ListenerV2';
import {
  EchooAudio,
  deleteCreatorAudio,
  getCreatorContent,
  updateCreatorAudio,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type EditingState = {
  track: EchooAudio;
  title: string;
  description: string;
  genre: string;
  tags: string;
  isPublic: boolean;
};

const formatNumber = (value?: number) => {
  const count = Number(value) || 0;
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
};

export default function CreatorContentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uploadedId?: string }>();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [tracks, setTracks] = useState<EchooAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(params.uploadedId ? 'Upload complete.' : '');
  const [editing, setEditing] = useState<EditingState | null>(null);

  const loadContent = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const rows = await getCreatorContent({ force });
      setTracks(rows);
    } catch (error: any) {
      setToast(error?.message || 'Could not load creator content.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadContent(Boolean(params.uploadedId));
    }, [loadContent, params.uploadedId])
  );

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
        stationId: track.stationId || '',
        stationName: track.stationName || '',
      },
    });
  };

  const beginEdit = (track: EchooAudio) => {
    setEditing({
      track,
      title: track.title,
      description: String((track as any).description || ''),
      genre: track.genre || 'Other',
      tags: Array.isArray((track as any).tags) ? (track as any).tags.join(', ') : '',
      isPublic: Boolean((track as any).isPublic),
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      setToast('Title cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCreatorAudio(editing.track.id, {
        title: editing.title.trim(),
        description: editing.description,
        genre: editing.genre || 'Other',
        tags: editing.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        isPublic: editing.isPublic,
      });
      setTracks((current) => current.map((track) => track.id === updated.id ? { ...track, ...updated } : track));
      setEditing(null);
      setToast('Content updated.');
    } catch (error: any) {
      setToast(error?.message || 'Could not update this audio.');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisibility = async (track: EchooAudio) => {
    const nextPublic = !Boolean((track as any).isPublic);
    try {
      const updated = await updateCreatorAudio(track.id, { isPublic: nextPublic });
      setTracks((current) => current.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      setToast(nextPublic ? 'Audio published.' : 'Audio moved to private.');
    } catch (error: any) {
      setToast(error?.message || 'Could not change visibility.');
    }
  };

  const confirmDelete = (track: EchooAudio) => {
    Alert.alert(
      'Delete audio?',
      'This removes the audio from your creator content and collections.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCreatorAudio(track.id);
              setTracks((current) => current.filter((row) => row.id !== track.id));
              setToast('Audio deleted.');
            } catch (error: any) {
              setToast(error?.message || 'Could not delete this audio.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <ChevronLeft color={palette.ink} size={25} />
        </Pressable>
        <Text style={styles.topTitle}>My content</Text>
        <Pressable style={styles.iconButton} onPress={() => router.push('/creator-upload' as any)}>
          <Plus color={palette.ink} size={22} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadContent(true)}
            tintColor={palette.blue}
            colors={[palette.blue]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Creator audio</Text>
          <Text style={styles.subtitle}>Uploads and replays you can manage from mobile.</Text>
        </View>

        {loading ? <ListenerSkeletonRows count={6} /> : null}

        {!loading && !tracks.length ? (
          <ListenerEmptyState
            title="No content yet"
            subtitle="Upload your first audio or finish a live replay."
            icon={<Upload color={palette.blue} size={24} />}
            action="Upload audio"
            onAction={() => router.push('/creator-upload' as any)}
          />
        ) : null}

        {!loading && tracks.length ? (
          <View style={styles.list}>
            {tracks.map((track) => (
              <View key={track.id} style={styles.row}>
                <Pressable style={styles.rowMain} onPress={() => openAudio(track)}>
                  <View style={styles.art}>
                    {track.coverArt ? (
                      <Image source={{ uri: track.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                    ) : (
                      <Play color={palette.blue} size={21} />
                    )}
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                    <Text style={styles.trackMeta} numberOfLines={1}>
                      {track.genre || 'Other'} · {formatNumber(track.playCount)} plays
                    </Text>
                  </View>
                </Pressable>
                <View style={styles.actions}>
                  <Pressable style={styles.actionButton} onPress={() => toggleVisibility(track)}>
                    {Boolean((track as any).isPublic)
                      ? <Eye color={palette.blue} size={18} />
                      : <EyeOff color={palette.muted} size={18} />}
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => beginEdit(track)}>
                    <Edit3 color={palette.ink} size={17} />
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => confirmDelete(track)}>
                    <Trash2 color={palette.red} size={17} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <ListenerToast message={toast} tone="info" />
      </ScrollView>

      <Modal visible={Boolean(editing)} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit audio</Text>
              <Pressable style={styles.iconButton} onPress={() => setEditing(null)} disabled={saving}>
                <X color={palette.ink} size={21} />
              </Pressable>
            </View>

            {editing ? (
              <>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  value={editing.title}
                  onChangeText={(value) => setEditing((current) => current ? { ...current, title: value } : current)}
                  editable={!saving}
                  placeholderTextColor={palette.faint}
                  style={styles.input}
                />
                <Text style={styles.label}>Description</Text>
                <TextInput
                  value={editing.description}
                  onChangeText={(value) => setEditing((current) => current ? { ...current, description: value } : current)}
                  editable={!saving}
                  placeholderTextColor={palette.faint}
                  style={[styles.input, styles.textArea]}
                  multiline
                />
                <Text style={styles.label}>Category</Text>
                <TextInput
                  value={editing.genre}
                  onChangeText={(value) => setEditing((current) => current ? { ...current, genre: value } : current)}
                  editable={!saving}
                  placeholderTextColor={palette.faint}
                  style={styles.input}
                />
                <Text style={styles.label}>Tags</Text>
                <TextInput
                  value={editing.tags}
                  onChangeText={(value) => setEditing((current) => current ? { ...current, tags: value } : current)}
                  editable={!saving}
                  placeholderTextColor={palette.faint}
                  style={styles.input}
                  autoCapitalize="none"
                />
                <View style={styles.visibilityRow}>
                  <View style={styles.visibilityCopy}>
                    <Text style={styles.visibilityTitle}>Public</Text>
                    <Text style={styles.visibilityText}>Listeners can discover this audio.</Text>
                  </View>
                  <Switch
                    value={editing.isPublic}
                    onValueChange={(value) => setEditing((current) => current ? { ...current, isPublic: value } : current)}
                    disabled={saving}
                    trackColor={{ false: palette.surfaceMuted, true: palette.blueSoft }}
                    thumbColor={editing.isPublic ? palette.blue : palette.faint}
                  />
                </View>
                <Pressable style={styles.saveButton} onPress={saveEdit} disabled={saving}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 48 },
  header: { paddingBottom: 14 },
  title: { color: palette.ink, fontSize: 30, lineHeight: 35, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  list: { gap: 8 },
  row: { minHeight: 78, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 0 },
  art: { width: 58, height: 58, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  trackTitle: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  trackMeta: { color: palette.muted, fontSize: 11.5, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '88%', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: palette.background, padding: 18, borderWidth: 1, borderColor: palette.line },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  label: { color: palette.muted, fontSize: 11.5, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 8, backgroundColor: palette.surfaceMuted, color: palette.ink, paddingHorizontal: 13, fontSize: 14, fontWeight: '800' },
  textArea: { minHeight: 100, paddingTop: 13, textAlignVertical: 'top' },
  visibilityRow: { marginTop: 16, minHeight: 66, borderRadius: 8, backgroundColor: palette.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  visibilityCopy: { flex: 1 },
  visibilityTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  visibilityText: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
  saveButton: { marginTop: 16, minHeight: 52, borderRadius: 26, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
