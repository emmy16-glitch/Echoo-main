import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, Headphones, Mail, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ListenerBackHeader } from '@/src/components/ListenerV2';
import { loginEchoo, registerEchoo } from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function AuthScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your username or email and password.');
      return;
    }
    if (mode === 'register' && !email.trim()) {
      setError('Enter your email address to create an account.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await loginEchoo(identifier, password);
      } else {
        await registerEchoo({
          username: identifier.trim(),
          email: email.trim(),
          password,
          displayName: displayName.trim() || identifier.trim(),
        });
      }
      router.replace('/profile');
    } catch (submitError: any) {
      setError(submitError?.message || 'Could not sign in to Echoo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ListenerBackHeader title="Echoo account" />

          <View style={styles.hero}>
            <LinearGradient colors={['#4B7BFF', '#2457E9']} style={styles.heroIcon}>
              <Headphones color="#FFFFFF" size={34} strokeWidth={2.5} />
            </LinearGradient>
            <Text style={styles.heroTitle}>
              {mode === 'login' ? 'Welcome back' : 'Create your listener account'}
            </Text>
            <Text style={styles.heroText}>
              {mode === 'login'
                ? 'Sign in to sync favorites, stations, listening history and your Echoo library.'
                : 'Your Echoo account keeps your listening experience with you across devices.'}
            </Text>
          </View>

          <View style={styles.modeSwitch}>
            <Pressable
              style={[styles.modeButton, mode === 'login' && styles.modeButtonActive]}
              onPress={() => {
                setMode('login');
                setError('');
              }}
            >
              <Text style={[styles.modeText, mode === 'login' && styles.modeTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, mode === 'register' && styles.modeButtonActive]}
              onPress={() => {
                setMode('register');
                setError('');
              }}
            >
              <Text style={[styles.modeText, mode === 'register' && styles.modeTextActive]}>Create account</Text>
            </Pressable>
          </View>

          <View style={styles.formCard}>
            {mode === 'register' ? (
              <Field
                icon={<UserRound color={palette.muted} size={19} />}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Display name"
                palette={palette}
              />
            ) : null}

            <Field
              icon={<UserRound color={palette.muted} size={19} />}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={mode === 'login' ? 'Username or email' : 'Username'}
              autoCapitalize="none"
              palette={palette}
            />

            {mode === 'register' ? (
              <Field
                icon={<Mail color={palette.muted} size={19} />}
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                keyboardType="email-address"
                autoCapitalize="none"
                palette={palette}
              />
            ) : null}

            <View style={styles.field}>
              <View style={styles.fieldIcon}><Text style={styles.passwordDot}>●</Text></View>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={palette.faint}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={styles.input}
              />
              <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.eyeButton}>
                {showPassword ? (
                  <EyeOff color={palette.muted} size={19} />
                ) : (
                  <Eye color={palette.muted} size={19} />
                )}
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.submitButton} onPress={submit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'login' ? 'Sign in to Echoo' : 'Create my account'}
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.securityText}>
            Echoo stores mobile session credentials in your device's secure credential storage on iOS and Android.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  icon,
  palette,
  ...props
}: {
  icon: React.ReactNode;
  palette: EchooColors;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.field}>
      <View style={styles.fieldIcon}>{icon}</View>
      <TextInput
        {...props}
        placeholderTextColor={palette.faint}
        style={styles.input}
      />
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 44 },
  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 24 },
  heroIcon: { width: 76, height: 76, borderRadius: 25, alignItems: 'center', justifyContent: 'center', shadowColor: '#2F63F6', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  heroTitle: { color: palette.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', marginTop: 17 },
  heroText: { color: palette.muted, fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 7, maxWidth: 330 },
  modeSwitch: { flexDirection: 'row', backgroundColor: palette.surfaceMuted, borderRadius: 15, padding: 4, marginBottom: 14 },
  modeButton: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  modeText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
  modeTextActive: { color: palette.ink },
  formCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 22, padding: 16 },
  field: { height: 54, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceMuted, flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
  fieldIcon: { width: 48, alignItems: 'center', justifyContent: 'center' },
  passwordDot: { color: palette.muted, fontSize: 18 },
  input: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: '600', paddingVertical: 13, paddingRight: 12 },
  eyeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: palette.red, fontSize: 12, lineHeight: 17, marginTop: 1, marginBottom: 11 },
  submitButton: { height: 50, borderRadius: 15, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  securityText: { color: palette.faint, fontSize: 10.5, lineHeight: 16, textAlign: 'center', marginTop: 15, paddingHorizontal: 10 },
});
