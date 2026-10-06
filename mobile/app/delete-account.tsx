import { useRouter } from 'expo-router';
import { AlertTriangle, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListenerBackHeader } from '@/src/components/ListenerV2';
import { deleteEchooAccount } from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const removeAccount = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await deleteEchooAccount(password);
      Alert.alert(
        'Account deleted',
        'Your Echoo account has been permanently deleted and this device has been signed out.',
        [{ text: 'OK', onPress: () => router.replace('/auth') }],
      );
    } catch (deleteError: any) {
      setError(
        deleteError?.code === 'INVALID_PASSWORD'
          ? 'That password is incorrect.'
          : deleteError?.message || 'Echoo could not delete this account. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!password || busy) return;
    Alert.alert(
      'Delete Echoo account?',
      'This is permanent. You will not be able to sign back in with this account after deletion.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => { void removeAccount(); } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ListenerBackHeader title="Delete account" />

        <View style={styles.iconWrap}>
          <AlertTriangle color={palette.red} size={24} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Delete your Echoo account</Text>
        <Text style={styles.body}>
          Account deletion is permanent. Save anything you need before continuing.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What happens</Text>
          <Text style={styles.item}>• Your active Echoo account and profile record are removed.</Text>
          <Text style={styles.item}>• This device is signed out after deletion succeeds.</Text>
          <Text style={styles.item}>
            • Some records may be retained where required for security, legal obligations, backups or content integrity.
          </Text>
        </View>

        <Text style={styles.label}>Current password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          editable={!busy}
          placeholder="Enter your password"
          placeholderTextColor={palette.faint}
        />

        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

        <Pressable
          style={[styles.deleteButton, (!password || busy) && styles.deleteButtonDisabled]}
          onPress={confirmDelete}
          disabled={!password || busy}
          accessibilityRole="button"
        >
          {busy
            ? <ActivityIndicator color="#FFFFFF" />
            : <Trash2 color="#FFFFFF" size={18} strokeWidth={2.2} />}
          <Text style={styles.deleteText}>{busy ? 'Deleting account…' : 'Permanently delete account'}</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} disabled={busy} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14, marginTop: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,74,94,0.10)',
  },
  title: { color: palette.ink, fontSize: 26, lineHeight: 32, fontWeight: '900', marginTop: 18 },
  body: { color: palette.muted, fontSize: 13.5, lineHeight: 20, marginTop: 8 },
  card: {
    marginTop: 22, padding: 16, borderRadius: 18, borderWidth: 1,
    borderColor: palette.line, backgroundColor: palette.surface, gap: 9,
  },
  cardTitle: { color: palette.ink, fontSize: 14, fontWeight: '900', marginBottom: 2 },
  item: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  label: { color: palette.ink2, fontSize: 12, fontWeight: '800', marginTop: 24, marginBottom: 8 },
  input: {
    minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.lineStrong,
    backgroundColor: palette.surfaceRaised, color: palette.ink, fontSize: 14, paddingHorizontal: 14,
  },
  error: { color: palette.red, fontSize: 12, lineHeight: 18, marginTop: 9, fontWeight: '700' },
  deleteButton: {
    minHeight: 50, marginTop: 20, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: palette.red, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  deleteButtonDisabled: { opacity: 0.5 },
  deleteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  cancelButton: { minHeight: 46, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
});
