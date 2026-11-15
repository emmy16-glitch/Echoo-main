import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EchooUser, getCurrentUser, updateListenerProfile, uploadListenerAvatar } from '@/src/services/echooApi';
import { friendlyErrorMessage } from '@/src/components/ListenerV2';

const BLUE = '#2B5FC0';
export default function EditProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<EchooUser | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; name?: string; mimeType?: string } | null>(null);
  useEffect(() => { void getCurrentUser().then((current) => { setUser(current); setName(current.displayName || ''); }).catch((cause) => setError(friendlyErrorMessage(cause, 'Could not load your profile.'))); }, []);
  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true); setError('');
    try {
      if (photo) await uploadListenerAvatar(photo);
      await updateListenerProfile(name);
      router.back();
    }
    catch (cause) { setError(friendlyErrorMessage(cause, 'Could not save your profile.')); }
    finally { setSaving(false); }
  };
  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) { setError('Choose a photo smaller than 5 MB.'); return; }
    setPhoto({ uri: asset.uri, name: asset.fileName || 'echoo-avatar.jpg', mimeType: asset.mimeType || 'image/jpeg' });
    setError('');
  };
  return <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft color="#050505" size={24} /></Pressable><Text style={styles.heading}>Profile</Text><Pressable onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable></View>
    <View style={styles.identity}><View style={styles.avatar}>{photo?.uri || user?.avatar ? <Image source={{ uri: photo?.uri || user?.avatar || '' }} style={StyleSheet.absoluteFillObject} contentFit="cover" /> : <Text style={styles.initial}>{(user?.displayName || 'E').charAt(0)}</Text>}</View><Pressable onPress={() => void pickPhoto()} disabled={saving}><Text style={styles.photoAction}>Change profile photo</Text></Pressable></View>
    <Text style={styles.label}>Full name</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#858585" autoCapitalize="words" />
    <Text style={styles.label}>Username</Text><View style={styles.readOnly}><Text style={styles.readOnlyText}>@{user?.username || ''}</Text></View>
    <Text style={styles.note}>Your name and username appear with your comments.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={[styles.save, (!name.trim() || saving) && styles.disabled]} onPress={() => void save()} disabled={!name.trim() || saving}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save profile</Text>}</Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F9FBFF' }, content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 50 },
  header: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 8 }, heading: { flex: 1, color: '#050505', fontFamily: 'DMSans_700Bold', fontSize: 23 }, cancel: { color: BLUE, fontFamily: 'DMSans_500Medium', fontSize: 14 },
  identity: { alignItems: 'center', marginTop: 35, marginBottom: 30 }, avatar: { width: 86, height: 86, borderRadius: 43, overflow: 'hidden', backgroundColor: '#DCE6F6', alignItems: 'center', justifyContent: 'center' }, initial: { color: BLUE, fontFamily: 'DMSans_700Bold', fontSize: 32 }, photoAction: { color: BLUE, fontFamily: 'DMSans_500Medium', fontSize: 14, marginTop: 16 },
  label: { color: '#050505', fontFamily: 'DMSans_500Medium', fontSize: 14, marginBottom: 8, marginTop: 16 }, input: { height: 54, borderRadius: 9, borderWidth: 1, borderColor: '#C7C7C7', backgroundColor: '#FFFFFF', paddingHorizontal: 18, color: '#050505', fontFamily: 'DMSans_400Regular', fontSize: 16 },
  readOnly: { height: 54, borderRadius: 9, borderWidth: 1, borderColor: '#C7C7C7', backgroundColor: '#FFFFFF', paddingHorizontal: 18, justifyContent: 'center' }, readOnlyText: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 16 },
  note: { color: '#858585', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 18 }, error: { color: '#C5334B', fontFamily: 'DMSans_400Regular', fontSize: 13, marginTop: 16 },
  save: { height: 54, borderRadius: 27, marginTop: 45, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.5 }, saveText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 15 },
});
