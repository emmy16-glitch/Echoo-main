import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Bell,
  ChevronRight,
  Download,
  Headphones,
  LogOut,
  MoonStar,
  Shield,
  UserRound,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ListenerAuthCard,
  ListenerPageHeader,
  ListenerSectionHeader,
  ListenerTopBar,
} from '@/src/components/ListenerV2';
import {
  EchooLibraryStats,
  EchooUser,
  getCurrentUser,
  getLibraryStats,
  hasEchooSession,
  logoutEchoo,
} from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemePreference } from '@/src/theme/ThemePreference';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const emptyStats: EchooLibraryStats = {
  savedTracks: 0,
  playlists: 0,
  totalSaved: 0,
  listeningHistory: 0,
};

export default function ProfileScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const { preference } = useThemePreference();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<EchooUser | null>(null);
  const [stats, setStats] = useState<EchooLibraryStats>(emptyStats);
  const [error, setError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    const activeSession = await hasEchooSession();
    setSignedIn(activeSession);

    if (!activeSession) {
      setUser(null);
      setStats(emptyStats);
      setLoading(false);
      return;
    }

    try {
      const [nextUser, nextStats] = await Promise.all([
        getCurrentUser(),
        getLibraryStats().catch(() => emptyStats),
      ]);
      setUser(nextUser);
      setStats(nextStats);
      setSignedIn(true);
    } catch (loadError: any) {
      if (loadError?.code === 'AUTH_REQUIRED' || loadError?.code === 'SESSION_EXPIRED') {
        setSignedIn(false);
        setUser(null);
      } else {
        setError(loadError?.message || 'Could not load your Echoo account.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutEchoo();
    } finally {
      setLoggingOut(false);
      setSignedIn(false);
      setUser(null);
      setStats(emptyStats);
    }
  };

  const settingsRows = [
    { title: 'Account', subtitle: 'Profile, username and account details', icon: UserRound },
    { title: 'Notifications', subtitle: 'Live, creator and release alerts', icon: Bell },
    {
      title: 'Appearance',
      subtitle: preference === 'system'
        ? `System theme: ${scheme === 'dark' ? 'Dark' : 'Light'}`
        : `App theme: ${preference === 'dark' ? 'Dark' : 'Light'}`,
      icon: MoonStar,
    },
    { title: 'Playback & downloads', subtitle: 'Audio quality, offline and player behavior', icon: Download },
    { title: 'Privacy & security', subtitle: 'Session, privacy and account controls', icon: Shield },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ListenerTopBar />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerPageHeader
          title="Profile"
        />

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={palette.blue} />
            <Text style={styles.loadingText}>Loading profile...</Text>
          </View>
        ) : null}

        {!loading && !signedIn ? (
          <>
            <View style={styles.guestHero}>
              <View style={styles.guestAvatar}>
                <Headphones color="#FFFFFF" size={31} />
              </View>
              <Text style={styles.guestTitle}>Listening as a guest</Text>
              <Text style={styles.guestText}>
                Public discovery works without an account. Sign in when you want Echoo to remember you.
              </Text>
            </View>
            <ListenerAuthCard onPress={() => router.push('/auth')} />
          </>
        ) : null}

        {!loading && signedIn && user ? (
          <>
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                {user.avatar ? (
                  <Image source={{ uri: user.avatar }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{(user.displayName || user.username || 'E').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.profileCopy}>
                <Text style={styles.name}>{user.displayName || user.username}</Text>
                <Text style={styles.handle}>@{user.username}</Text>
                {user.bio ? <Text style={styles.bio} numberOfLines={2}>{user.bio}</Text> : null}
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.savedTracks}</Text>
                <Text style={styles.statLabel}>Saved audio</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.playlists}</Text>
                <Text style={styles.statLabel}>Playlists</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.listeningHistory}</Text>
                <Text style={styles.statLabel}>History</Text>
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        ) : null}

        <ListenerSectionHeader title="Settings" />
        <View style={styles.settingsGroup}>
          {settingsRows.map(({ title, subtitle, icon: Icon }) => (
            <Pressable key={title} style={styles.settingRow} onPress={() => router.push('/settings')}>
              <View style={styles.settingIcon}>
                <Icon color={palette.muted} size={19} strokeWidth={2} />
              </View>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>{title}</Text>
                <Text style={styles.settingSubtitle}>{subtitle}</Text>
              </View>
              <ChevronRight color={palette.faint} size={18} />
            </Pressable>
          ))}
        </View>

        {signedIn ? (
          <Pressable style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
            {loggingOut ? <ActivityIndicator color={palette.red} /> : <LogOut color={palette.red} size={20} />}
            <Text style={styles.logoutText}>{loggingOut ? 'Signing out...' : 'Sign out'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 150 },
  loadingState: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: palette.muted, fontSize: 12.5, fontWeight: '700' },
  guestHero: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: 20, alignItems: 'center', marginBottom: 12 },
  guestAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  guestTitle: { color: palette.ink, fontSize: 19, fontWeight: '900', marginTop: 13 },
  guestText: { color: palette.muted, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 5, maxWidth: 315 },
  profileCard: { backgroundColor: palette.surface, borderRadius: 8, borderWidth: 1, borderColor: palette.line, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: palette.blue, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 31, fontWeight: '900' },
  profileCopy: { flex: 1 },
  name: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  handle: { color: palette.blue, fontSize: 12, fontWeight: '800', marginTop: 2 },
  bio: { color: palette.muted, fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statCard: { flex: 1, minHeight: 78, backgroundColor: palette.surface, borderRadius: 8, borderWidth: 1, borderColor: palette.line, padding: 11, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: palette.ink, fontSize: 19, fontWeight: '900' },
  statLabel: { color: palette.muted, fontSize: 10.5, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  errorText: { color: palette.red, fontSize: 11.5, marginTop: 8 },
  settingsGroup: { backgroundColor: palette.surface, borderRadius: 8, borderWidth: 1, borderColor: palette.line, overflow: 'hidden' },
  settingRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: palette.line },
  settingIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  settingCopy: { flex: 1, paddingHorizontal: 11 },
  settingTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  settingSubtitle: { color: palette.muted, fontSize: 10.8, lineHeight: 15, marginTop: 2 },
  infoCard: { marginTop: 14, backgroundColor: palette.surface, borderRadius: 17, borderWidth: 1, borderColor: palette.line, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  infoCopy: { flex: 1 },
  infoTitle: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  infoText: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  logoutButton: { minHeight: 50, marginTop: 18, borderRadius: 8, borderWidth: 1, borderColor: `${palette.red}55`, backgroundColor: `${palette.red}0D`, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { color: palette.red, fontSize: 13.5, fontWeight: '900' },
});
