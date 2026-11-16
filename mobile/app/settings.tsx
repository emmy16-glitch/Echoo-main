import { useMemo as useThemeMemo } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, Eye, EyeOff, LogOut } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { friendlyErrorMessage } from '@/src/components/ListenerV2';
import { AccountLoadState } from '@/src/components/AccountLoadState';
import { EchooUser, getCurrentUser, getListenerSettings, hasEchooSession, logoutEchoo, requestListenerPasswordReset, updateListenerNotifications, updateListenerPassword } from '@/src/services/echooApi';
import { getLocalDownloads } from '@/src/services/localDownloads';
import { useThemePreference } from '@/src/theme/ThemePreference';

type Section = 'all' | 'account' | 'notifications' | 'playback' | 'appearance';
export default function SettingsScreen() {
  const palette = getEchooColors(useColorScheme());
  const styles = useThemeMemo(() => createThemeStyles(palette), [palette]);

  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section: Section = ['account', 'notifications', 'playback', 'appearance'].includes(String(params.section)) ? params.section as Section : 'all';
  const title = ({ all: 'Settings', account: 'Account & Security', notifications: 'Notifications', playback: 'Playback & downloads', appearance: 'Appearance' } as const)[section];
  const [user, setUser] = useState<EchooUser | null>(null);
  const [notifications, setNotifications] = useState({ email: true, push: true, newFollowers: true, newReleases: true, liveBroadcasts: true });
  const [downloadCount, setDownloadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [accountLoadError, setAccountLoadError] = useState(false);
  const [accountRetry, setAccountRetry] = useState(0);
  const { preference, setPreference } = useThemePreference();

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      setAuthReady(false);
      setAccountLoadError(false);
      const session = await hasEchooSession();
      if (!active) return;
      if (!session) {
        router.replace('/auth');
        return;
      }
      // Device preferences and the menu do not need a network round trip.
      if (section === 'all' || section === 'appearance' || section === 'playback') {
        setAuthReady(true);
        void getCurrentUser().then((current) => { if (active) setUser(current); }).catch(() => undefined);
        if (section === 'playback') {
          void getLocalDownloads().then((downloads) => { if (active) setDownloadCount(downloads.length); })
            .catch((cause) => { if (active) setError(friendlyErrorMessage(cause, 'Could not read downloads on this device.')); });
        }
        return;
      }
      let current: EchooUser;
      let settings: Awaited<ReturnType<typeof getListenerSettings>> | null;
      try {
        [current, settings] = await Promise.all([getCurrentUser(), section === 'notifications' ? getListenerSettings() : Promise.resolve(null)]);
      } catch {
        const stillSignedIn = await hasEchooSession();
        if (!active) return;
        if (!stillSignedIn) router.replace('/auth');
        else setAccountLoadError(true);
        return;
      }
      if (!active) return;
      if (!current) {
        router.replace('/auth');
        return;
      }
      setUser(current);
      if (settings) setNotifications(settings.notifications);
      setAuthReady(true);
    })();
    return () => { active = false; };
  }, [router, section, accountRetry]));

  const row = (label: string, subtitle: string, onPress: () => void, danger = false) => <Pressable key={label} style={styles.row} onPress={onPress} accessibilityRole="button"><View style={styles.rowCopy}><Text style={[styles.rowText, danger && styles.danger]}>{label}</Text><Text style={styles.rowSub}>{subtitle}</Text></View><ChevronRight color={danger ? palette.red : palette.muted} size={21} /></Pressable>;
  const toggle = (key: keyof typeof notifications, label: string, subtitle: string) => <View key={key} style={styles.row}><View style={styles.rowCopy}><Text style={styles.rowText}>{label}</Text><Text style={styles.rowSub}>{subtitle}</Text></View><Switch value={notifications[key]} disabled={busy || !user} onValueChange={(value) => { const previous = notifications; setNotifications({ ...notifications, [key]: value }); setBusy(true); void updateListenerNotifications({ [key]: value }).catch((cause) => { setNotifications(previous); setError(friendlyErrorMessage(cause, 'Could not update notifications.')); }).finally(() => setBusy(false)); }} trackColor={{ false: palette.lineStrong, true: palette.blue }} thumbColor="#FFFFFF" /></View>;
  const changePassword = async () => {
    if (!currentPassword || newPassword.length < 6 || newPassword !== confirmPassword) { setError('Enter your current password and matching new passwords of at least 6 characters.'); return; }
    setBusy(true); setError('');
    try { await updateListenerPassword(currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); Alert.alert('Password updated', 'Your password has been changed.'); }
    catch (cause: any) { setError(cause?.code === 'INVALID_PASSWORD' ? 'That password is incorrect.' : friendlyErrorMessage(cause, 'Could not update your password.')); }
    finally { setBusy(false); }
  };
  const resetPassword = async () => {
    if (!user?.email || busy) return;
    setBusy(true); setError('');
    try { await requestListenerPasswordReset(user.email); Alert.alert('Check your email', 'A password reset link has been sent to your email address.'); }
    catch (cause) { setError(friendlyErrorMessage(cause, 'Could not send a password reset link.')); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true);
    try { await logoutEchoo(); setSignOutOpen(false); router.replace('/(tabs)/profile'); }
    catch { Alert.alert('Could not sign out', 'Check your connection and try again. You are still signed in.'); }
    finally { setBusy(false); }
  };

  if (!authReady) {
    return <AccountLoadState title={title} error={accountLoadError} onRetry={() => setAccountRetry((value) => value + 1)} onBack={() => router.back()} />;
  }

  return <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityLabel="Go back"><ArrowLeft color={palette.ink} size={24} /></Pressable><Text style={styles.heading}>{title}</Text>{section !== 'notifications' && section !== 'playback' ? <Pressable onPress={() => router.back()}><Text style={styles.cancel}>Cancel</Text></Pressable> : null}</View>
    {section === 'all' ? <>
      <Text style={styles.groupTitle}>Account</Text>
      {row('Account & security', 'Email, password and account deletion', () => router.push('/settings?section=account'))}
      {row('Notifications', 'Live alerts and releases', () => router.push('/settings?section=notifications'))}
      {row('Playback & downloads', 'Offline audio and storage', () => router.push('/settings?section=playback'))}
      <Text style={styles.groupTitle}>Preferences & help</Text>
      {row('Appearance', 'Choose the app theme', () => router.push('/settings?section=appearance'))}
      {row('Privacy policy', 'Read our privacy information', () => { void Linking.openURL('https://echoo.digi02.org/privacy-policy'); })}
      <Pressable style={styles.signOut} onPress={() => setSignOutOpen(true)}><Text style={styles.danger}>Sign out</Text><LogOut color={palette.red} size={22} /></Pressable>
    </> : null}
    {section === 'account' ? <>
      <Text style={styles.groupTitle}>Email address</Text>{row(user?.email || 'Email address', 'Change email address', () => router.push('/change-email'))}
      <Text style={styles.groupTitle}>Change password</Text>
      <Text style={styles.label}>Current password</Text><View style={styles.passwordField}><TextInput style={styles.passwordInput} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry={!showPassword} placeholder="Current password" placeholderTextColor={palette.muted} /><Pressable onPress={() => setShowPassword(!showPassword)} accessibilityLabel={showPassword ? 'Hide passwords' : 'Show passwords'}>{showPassword ? <EyeOff color={palette.muted} size={20} /> : <Eye color={palette.muted} size={20} />}</Pressable></View>
      <Text style={styles.label}>New password</Text><TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!showPassword} placeholder="Enter a new password" placeholderTextColor={palette.muted} />
      <Text style={styles.label}>Confirm new password</Text><TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} placeholder="Enter it again" placeholderTextColor={palette.muted} />
      <Text style={styles.note}>Use at least 6 characters.</Text><Pressable style={styles.primary} onPress={() => void changePassword()} disabled={busy || !user}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Update password</Text>}</Pressable>
      {row('Forgot your current password?', 'Send a reset link to your email', () => void resetPassword())}
      {row('Delete account', 'Review what happens before deleting', () => router.push('/delete-account'), true)}
    </> : null}
    {section === 'notifications' ? <><Text style={styles.note}>Choose which Echoo updates you receive.</Text><Text style={styles.groupTitle}>From channels you follow</Text>
      {toggle('push', 'Push notifications', 'Allow account notifications on this device')}
      {toggle('liveBroadcasts', 'Live broadcasts', 'When a channel you follow goes live')}
      {toggle('newReleases', 'New releases', 'New audio and collections')}
      {toggle('newFollowers', 'New followers', 'When someone follows your channel')}
      <Text style={styles.groupTitle}>Email updates</Text>{toggle('email', 'Email notifications', `Updates sent to ${user?.email || 'your email'}`)}
      {row('Device notification permission', 'Change permission in your phone settings', () => { void Linking.openSettings(); })}
    </> : null}
    {section === 'playback' ? <><Text style={styles.note}>Manage offline audio stored on this device.</Text><Text style={styles.groupTitle}>Downloads</Text><Text style={styles.rowText}>{downloadCount} {downloadCount === 1 ? 'download' : 'downloads'} on this device</Text>{row('Manage downloads', 'View, retry or remove downloaded audio', () => router.push({ pathname: '/library-section', params: { section: 'downloads' } }))}</> : null}
    {section === 'appearance' ? <><Text style={styles.groupTitle}>App theme</Text>{(['system', 'light', 'dark'] as const).map((option) => <Pressable key={option} style={styles.row} onPress={() => setPreference(option)}><Text style={styles.rowText}>{option.charAt(0).toUpperCase() + option.slice(1)}</Text><Text style={styles.cancel}>{preference === option ? 'Selected' : ''}</Text></Pressable>)}</> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView>
  <Modal visible={signOutOpen} transparent animationType="slide" onRequestClose={() => setSignOutOpen(false)}><View style={styles.modalBackdrop}><View style={styles.sheet}><View style={styles.handle} /><Text style={styles.sheetTitle}>Sign out of Echoo?</Text><Text style={styles.note}>You’ll need to sign in again to access your saved library and playlists.</Text><Pressable style={styles.primary} onPress={() => void signOut()} disabled={busy}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Sign out</Text>}</Pressable><Pressable style={styles.stay} onPress={() => setSignOutOpen(false)}><Text style={styles.cancel}>Stay signed in</Text></Pressable></View></View></Modal>
  </SafeAreaView>;
}

const createThemeStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background }, content: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 70 },
  authLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { height: 42, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 38 }, heading: { flex: 1, color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 23 }, cancel: { color: palette.blue, fontFamily: 'DMSans_500Medium', fontSize: 14 },
  groupTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 17, marginTop: 24, marginBottom: 12 },
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10 }, rowCopy: { flex: 1 }, rowText: { color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 15 }, rowSub: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 12, marginTop: 4 }, danger: { color: palette.red, fontFamily: 'DMSans_500Medium', fontSize: 15 }, signOut: { minHeight: 60, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: palette.ink, fontFamily: 'DMSans_500Medium', fontSize: 13, marginTop: 16, marginBottom: 8 }, input: { height: 54, borderRadius: 9, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surfaceRaised, paddingHorizontal: 16, color: palette.ink, fontFamily: 'DMSans_400Regular', fontSize: 15 }, passwordField: { height: 54, borderRadius: 9, borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: palette.surfaceRaised, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, passwordInput: { flex: 1, color: palette.ink, fontFamily: 'DMSans_400Regular', fontSize: 15 },
  note: { color: palette.muted, fontFamily: 'DMSans_400Regular', fontSize: 13, lineHeight: 19, marginTop: 10 }, primary: { height: 54, borderRadius: 27, backgroundColor: palette.blue, marginTop: 24, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 15 }, error: { marginTop: 18, color: palette.red, fontFamily: 'DMSans_400Regular', fontSize: 13 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' }, sheet: { backgroundColor: palette.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 45 }, handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.lineStrong, marginBottom: 22 }, sheetTitle: { color: palette.ink, fontFamily: 'DMSans_700Bold', fontSize: 21 }, stay: { height: 50, alignItems: 'center', justifyContent: 'center' },
});
