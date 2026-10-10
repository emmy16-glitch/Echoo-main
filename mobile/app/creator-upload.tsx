import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  FileAudio,
  ImagePlus,
  Send,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerToast } from '@/src/components/ListenerV2';
import { uploadCreatorAudio } from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

const formatBytes = (value?: number) => {
  const bytes = Number(value) || 0;
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

export default function CreatorUploadScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [audio, setAudio] = useState<PickedFile | null>(null);
  const [cover, setCover] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Other');
  const [tags, setTags] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');

  const pickAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/*', 'video/webm'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setAudio({
      uri: asset.uri,
      name: asset.name || 'echoo-audio.mp3',
      mimeType: asset.mimeType || 'audio/mpeg',
      size: asset.size,
    });
    if (!title.trim()) {
      setTitle((asset.name || 'Untitled Audio').replace(/\.[^.]+$/, ''));
    }
  };

  const pickCover = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setCover({
      uri: asset.uri,
      name: asset.name || 'echoo-cover.jpg',
      mimeType: asset.mimeType || 'image/jpeg',
      size: asset.size,
    });
  };

  const submit = async () => {
    setToast('');
    if (!audio) {
      setToast('Choose an audio file first.');
      return;
    }
    if (!title.trim()) {
      setToast('Add a title before uploading.');
      return;
    }

    setUploading(true);
    try {
      const track = await uploadCreatorAudio({
        audio,
        cover,
        title,
        description,
        genre,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        isPublic,
      });
      router.replace({
        pathname: '/creator-content' as any,
        params: { uploadedId: track.id },
      });
    } catch (error: any) {
      setToast(error?.message || 'Upload failed. Check the file and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} disabled={uploading}>
          <ChevronLeft color={palette.ink} size={25} />
        </Pressable>
        <Text style={styles.topTitle}>Upload audio</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.audioPicker} onPress={pickAudio} disabled={uploading}>
          <View style={styles.pickerIcon}>
            <FileAudio color={palette.blue} size={31} />
          </View>
          <Text style={styles.pickerTitle}>{audio ? audio.name : 'Choose audio file'}</Text>
          <Text style={styles.pickerText}>
            {audio ? `${audio.mimeType || 'audio'} ${formatBytes(audio.size)}` : 'MP3, M4A, WAV, OGG, FLAC or WebM'}
          </Text>
        </Pressable>

        <View style={styles.formCard}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={!uploading}
            placeholder="Audio title"
            placeholderTextColor={palette.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            editable={!uploading}
            placeholder="Short description"
            placeholderTextColor={palette.faint}
            style={[styles.input, styles.textArea]}
            multiline
          />

          <Text style={styles.label}>Category</Text>
          <TextInput
            value={genre}
            onChangeText={setGenre}
            editable={!uploading}
            placeholder="Other"
            placeholderTextColor={palette.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Tags</Text>
          <TextInput
            value={tags}
            onChangeText={setTags}
            editable={!uploading}
            placeholder="faith, worship, teaching"
            placeholderTextColor={palette.faint}
            style={styles.input}
            autoCapitalize="none"
          />

          <Pressable style={styles.coverRow} onPress={pickCover} disabled={uploading}>
            <View style={styles.coverThumb}>
              {cover ? (
                <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <ImagePlus color={palette.blue} size={23} />
              )}
            </View>
            <View style={styles.coverCopy}>
              <Text style={styles.coverTitle}>{cover ? cover.name : 'Cover artwork'}</Text>
              <Text style={styles.coverText}>{cover ? formatBytes(cover.size) : 'Optional JPG, PNG or WebP'}</Text>
            </View>
            {cover ? (
              <Pressable style={styles.clearCover} onPress={() => setCover(null)}>
                <X color={palette.muted} size={18} />
              </Pressable>
            ) : null}
          </Pressable>

          <View style={styles.visibilityRow}>
            <View style={styles.visibilityCopy}>
              <Text style={styles.visibilityTitle}>Publish publicly</Text>
              <Text style={styles.visibilityText}>Turn off to save as draft/private.</Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              disabled={uploading}
              trackColor={{ false: palette.surfaceMuted, true: palette.blueSoft }}
              thumbColor={isPublic ? palette.blue : palette.faint}
            />
          </View>
        </View>

        <ListenerToast message={toast} />

        <Pressable style={styles.primaryButton} onPress={submit} disabled={uploading}>
          {uploading ? <ActivityIndicator color="#FFFFFF" /> : <Send color="#FFFFFF" size={20} />}
          <Text style={styles.primaryButtonText}>{uploading ? 'Uploading...' : 'Upload audio'}</Text>
        </Pressable>
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
  audioPicker: { minHeight: 160, borderRadius: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', padding: 18 },
  pickerIcon: { width: 64, height: 64, borderRadius: 8, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  pickerTitle: { color: palette.ink, fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  pickerText: { color: palette.muted, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4 },
  formCard: { marginTop: 14, borderRadius: 8, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, padding: 14 },
  label: { color: palette.muted, fontSize: 11.5, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 8, backgroundColor: palette.surfaceMuted, color: palette.ink, paddingHorizontal: 13, fontSize: 14, fontWeight: '800' },
  textArea: { minHeight: 106, paddingTop: 13, textAlignVertical: 'top' },
  coverRow: { marginTop: 16, minHeight: 76, borderRadius: 8, borderWidth: 1, borderColor: palette.line, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  coverThumb: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  coverCopy: { flex: 1, minWidth: 0 },
  coverTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  coverText: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
  clearCover: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  visibilityRow: { marginTop: 16, minHeight: 66, borderRadius: 8, backgroundColor: palette.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  visibilityCopy: { flex: 1 },
  visibilityTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  visibilityText: { color: palette.muted, fontSize: 11.5, marginTop: 3 },
  primaryButton: { marginTop: 16, minHeight: 54, borderRadius: 27, backgroundColor: palette.blue, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
