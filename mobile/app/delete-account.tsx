import { useMemo as useThemeMemo } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';
import { useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EchooUser, deleteEchooAccount, getCurrentUser } from '@/src/services/echooApi';
import { friendlyErrorMessage } from '@/src/components/ListenerV2';

export default function DeleteAccountScreen() {
  return <AccountGate title="Delete account"><DeleteAccountContent /></AccountGate>;
}
function DeleteAccountContent() {
  const palette = getEchooColors(useColorScheme());
  const styles = useThemeMemo(() => createThemeStyles(palette), [palette]);

  const router = useRouter();
  const [user, setUser] = useState<EchooUser | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void getCurrentUser().then(setUser).catch(() => undefined); }, []);
  const ready = confirmation === 'DELETE' && Boolean(password) && !busy;
  const removeAccount = async () => {
    if (!ready) return;
    setBusy(true); setError('');
    try {
      await deleteEchooAccount(password);
      Alert.alert('Account deleted', 'Your Echoo account has been deleted and this device has been signed out.', [{ text: 'OK', onPress: () => router.replace('/auth') }]);
    } catch (cause: any) { setError(cause?.code === 'INVALID_PASSWORD' ? 'That password is incorrect.' : friendlyErrorMessage(cause, 'Could not delete your account.')); }
    finally { setBusy(false); }
  };
  const confirm = () => {
    if (!ready) return;
    Alert.alert('Permanently delete account?', 'You cannot undo this action.', [
      { text: 'Keep my account', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => void removeAccount() },
    ]);
  };
  return <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft color={palette.ink} size={24} /></Pressable><Text style={styles.heading}>Delete account</Text></View>
    <View style={styles.warning}><AlertCircle color={palette.red} size={19} /><Text style={styles.warningText}>This deletes your Echoo account, not just a playlist or a download.</Text></View>
    <Text style={styles.title}>Before you go{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</Text>
    <Text style={styles.copy}>You’re deleting the account for {user?.email || 'your email'}{user?.username ? ` / @${user.username}` : ''}.</Text>
    <Text style={styles.subheading}>What you’ll lose</Text>
    <Text style={styles.bullet}>• Access to this account and profile</Text>
    <Text style={styles.bullet}>• Your saved library, following and account preferences</Text>
    <Text style={styles.bullet}>• Your listening history in this account</Text>
    <Text style={styles.copy}>This can’t be undone. Downloaded files on this device can be managed separately.</Text>
    <Text style={styles.label}>Type DELETE to confirm</Text>
    <TextInput style={styles.input} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" placeholderTextColor={palette.muted} />
    <Text style={styles.label}>Current password</Text>
    <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter your current password" placeholderTextColor={palette.muted} />
    {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    <Pressable style={[styles.deleteButton, !ready && styles.disabled]} onPress={confirm} disabled={!ready} accessibilityRole="button">{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.deleteText}>Permanently delete account</Text>}</Pressable>
    <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={busy}><Text style={styles.cancelText}>Cancel · Keep my account</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const createThemeStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background }, content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 55 },
  header: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 35 }, heading: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 23 },
  warning: { minHeight: 65, borderRadius: 10, padding: 14, backgroundColor: palette.dangerSoft, flexDirection: 'row', alignItems: 'center', gap: 10 }, warningText: { flex: 1, color: palette.red, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 18 },
  title: { marginTop: 26, color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 22 }, copy: { marginTop: 15, color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 20 },
  subheading: { marginTop: 22, marginBottom: 8, color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 17 }, bullet: { marginTop: 10, color: palette.ink, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19 },
  label: { color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 13, marginTop: 22, marginBottom: 8 }, input: { minHeight: 52, borderRadius: 9, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surfaceRaised, paddingHorizontal: 16, color: palette.ink, fontFamily: 'DMSans_400Regular', fontSize: 15 },
  error: { marginTop: 12, color: palette.red, fontFamily: 'DMSans_400Regular', fontSize: 13 }, deleteButton: { minHeight: 54, borderRadius: 27, backgroundColor: palette.red, marginTop: 20, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.5 }, deleteText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 15 }, cancelButton: { minHeight: 52, borderRadius: 26, marginTop: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: palette.blue, fontFamily: 'DMSans_700Bold', fontSize: 14 },
});
import { AccountGate } from '@/src/components/AccountGate';
