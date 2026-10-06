import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronLeft, Radio, Save } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerEmptyState, ListenerSkeletonRows, ListenerToast } from '@/src/components/ListenerV2';
import { EchooStation, getMyStations, updateCreatorStation } from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function CreatorStationScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [station, setStation] = useState<EchooStation | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Other');
  const [isPublic, setIsPublic] = useState(true);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getMyStations({ force: true });
      const next = rows[0] || null;
      setStation(next);
      setName(next?.name || '');
      setDescription(next?.description || '');
      setCategory(next?.category || 'Other');
      setIsPublic(Boolean((next as any)?.isPublic ?? true));
    } catch (error: any) {
      setToast(error?.message || 'Could not load station.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!station) return;
    if (!name.trim()) {
      setToast('Station name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCreatorStation(station.id, {
        name: name.trim(),
        description,
        category: category || 'Other',
        isPublic,
      });
      setStation(updated);
      setToast('Station updated.');
    } catch (error: any) {
      setToast(error?.message || 'Could not update station.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <ChevronLeft color={palette.ink} size={25} />
        </Pressable>
        <Text style={styles.topTitle}>Station</Text>
        <View style={styles.iconButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ListenerSkeletonRows count={4} /> : null}
        {!loading && !station ? (
          <ListenerEmptyState title="No station yet" subtitle="Create your channel from Echoo web studio, then manage quick details here." icon={<Radio color={palette.blue} size={24} />} />
        ) : null}
        {!loading && station ? (
          <>
            <View style={styles.hero}>
              <View style={styles.art}>
                {station.coverArt ? <Image source={{ uri: station.coverArt }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Radio color={palette.blue} size={30} />}
              </View>
              <Text style={styles.heroTitle}>{station.name}</Text>
              <Text style={styles.heroText}>{station.category || 'Other'} · {station.followerCount || 0} followers</Text>
            </View>
            <View style={styles.formCard}>
              <Text style={styles.label}>Name</Text>
              <TextInput value={name} onChangeText={setName} placeholderTextColor={palette.faint} style={styles.input} editable={!saving} />
              <Text style={styles.label}>Description</Text>
              <TextInput value={description} onChangeText={setDescription} placeholderTextColor={palette.faint} style={[styles.input, styles.textArea]} multiline editable={!saving} />
              <Text style={styles.label}>Category</Text>
              <TextInput value={category} onChangeText={setCategory} placeholderTextColor={palette.faint} style={styles.input} editable={!saving} />
              <View style={styles.visibilityRow}>
                <View style={styles.visibilityCopy}>
                  <Text style={styles.visibilityTitle}>Public station</Text>
                  <Text style={styles.visibilityText}>Listeners can discover this station.</Text>
                </View>
                <Switch value={isPublic} onValueChange={setIsPublic} disabled={saving} thumbColor={isPublic ? palette.blue : palette.faint} trackColor={{ false: palette.surfaceMuted, true: palette.blueSoft }} />
              </View>
            </View>
            <Pressable style={styles.primaryButton} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Save color="#FFFFFF" size={19} />}
              <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save station'}</Text>
            </Pressable>
          </>
        ) : null}
        <ListenerToast message={toast} tone="info" />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.line },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 48 },
  hero: { borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 18, alignItems: 'center' },
  art: { width: 92, height: 92, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: palette.ink, fontSize: 22, fontWeight: '900', marginTop: 12 },
  heroText: { color: palette.muted, fontSize: 12, marginTop: 4 },
  formCard: { marginTop: 14, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 14 },
  label: { color: palette.muted, fontSize: 11.5, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 8, backgroundColor: palette.surfaceMuted, color: palette.ink, paddingHorizontal: 13, fontSize: 14, fontWeight: '800' },
  textArea: { minHeight: 110, paddingTop: 13, textAlignVertical: 'top' },
  visibilityRow: { marginTop: 16, minHeight: 66, borderRadius: 8, backgroundColor: palette.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  visibilityCopy: { flex: 1 },
  visibilityTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  visibilityText: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
  primaryButton: { marginTop: 16, minHeight: 54, borderRadius: 27, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
