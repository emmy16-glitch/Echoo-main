import { useMemo as useThemeMemo } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { friendlyErrorMessage } from '@/src/components/ListenerV2';
import { getCurrentUser, updateListenerEmail } from '@/src/services/echooApi';

export default function ChangeEmailScreen() {
  return <AccountGate title="Email address"><ChangeEmailContent /></AccountGate>;
}
function ChangeEmailContent() {
  const palette = getEchooColors(useColorScheme());
  const styles = useThemeMemo(() => createThemeStyles(palette), [palette]);

  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void getCurrentUser().then((user) => setEmail(user.email || '')).catch(() => undefined); }, []);
  const save = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true); setError('');
    try { await updateListenerEmail(email, password); router.back(); }
    catch (cause: any) { setError(cause?.code === 'INVALID_PASSWORD' ? 'That password is incorrect.' : friendlyErrorMessage(cause, 'Could not change your email.')); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft color={palette.ink} size={24} /></Pressable><Text style={styles.heading}>Email address</Text></View>
    <Text style={styles.label}>New email address</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" placeholderTextColor={palette.muted} />
    <Text style={styles.label}>Current password</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Enter your password" placeholderTextColor={palette.muted} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Pressable style={[styles.button, (!email.trim() || !password || busy) && styles.disabled]} onPress={() => void save()} disabled={!email.trim() || !password || busy}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Save email address</Text>}</Pressable>
  </ScrollView></SafeAreaView>;
}
const createThemeStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background }, content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 55 }, header: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 35 }, heading: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 23 },
  label: { color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 14, marginTop: 18, marginBottom: 8 }, input: { height: 54, borderRadius: 9, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surfaceRaised, paddingHorizontal: 16, color: palette.ink, fontFamily: 'DMSans_400Regular', fontSize: 15 }, error: { marginTop: 15, color: palette.red, fontFamily: 'DMSans_400Regular', fontSize: 13 }, button: { height: 54, borderRadius: 27, backgroundColor: palette.blue, marginTop: 30, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.5 }, buttonText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 15 },
});
import { AccountGate } from '@/src/components/AccountGate';
