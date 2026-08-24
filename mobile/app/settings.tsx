import { useRouter } from 'expo-router';
import {
  Bell,
  ChevronRight,
  Download,
  Headphones,
  Languages,
  MoonStar,
  Shield,
  UserRound,
  Volume2,
} from 'lucide-react-native';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ListenerAuthCard,
  ListenerBackHeader,
  ListenerPageHeader,
  ListenerSectionHeader,
} from '@/src/components/ListenerV2';
import { EchooUser, getCurrentUser, hasEchooSession } from '@/src/services/echooApi';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemePreference, useThemePreference } from '@/src/theme/ThemePreference';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

const themeOptions: { label: string; value: ThemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const { preference, setPreference } = useThemePreference();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState<EchooUser | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([hasEchooSession(), getCurrentUser().catch(() => null)]).then(([session, currentUser]) => {
      if (!active) return;
      setSignedIn(session && Boolean(currentUser));
      setUser(currentUser);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ListenerBackHeader title="Settings" />
        <ListenerPageHeader
          eyebrow="LISTENER SETTINGS"
          title="Make Echoo feel right"
          subtitle="Playback, appearance, notifications and account-level controls for your listener experience."
        />

        {!signedIn ? (
          <ListenerAuthCard
            title="Sign in for synced settings"
            subtitle="Device appearance works for everyone. Account preferences can sync after you sign in."
            onPress={() => router.push('/auth')}
          />
        ) : null}

        {signedIn && user ? (
          <View style={styles.accountStrip}>
            <View style={styles.accountIcon}>
              <UserRound color={palette.muted} size={20} strokeWidth={2} />
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountName}>{user.displayName}</Text>
              <Text style={styles.accountMeta}>@{user.username} · {user.email || 'Echoo account'}</Text>
            </View>
          </View>
        ) : null}

        <ListenerSectionHeader title="Experience" />
        <View style={styles.group}>
          <SettingRow
            icon={<MoonStar color={palette.muted} size={19} strokeWidth={2} />}
            title="Appearance"
            subtitle="Choose Echoo's app theme"
            value={
              preference === 'system'
                ? `System ${scheme === 'dark' ? 'Dark' : 'Light'}`
                : preference === 'dark' ? 'Dark' : 'Light'
            }
            palette={palette}
          />
          <View style={styles.themePicker}>
            {themeOptions.map((option) => {
              const active = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.themeOption, active && styles.themeOptionActive]}
                  onPress={() => setPreference(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.themeOptionText, active && styles.themeOptionTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <SettingRow
            icon={<Volume2 color={palette.muted} size={19} strokeWidth={2} />}
            title="Playback"
            subtitle="Normal speed · device volume"
            value="Default"
            palette={palette}
          />
          <SettingRow
            icon={<Download color={palette.muted} size={19} strokeWidth={2} />}
            title="Downloads"
            subtitle="Offline media remains on this device"
            value="Device"
            palette={palette}
          />
          <SettingRow
            icon={<Languages color={palette.muted} size={19} strokeWidth={2} />}
            title="Language"
            subtitle="Interface language"
            value="English"
            palette={palette}
            last
          />
        </View>

        <ListenerSectionHeader title="Notifications & privacy" />
        <View style={styles.group}>
          <SettingRow
            icon={<Bell color={palette.muted} size={19} strokeWidth={2} />}
            title="Notifications"
            subtitle="Manage Echoo's device notification permission"
            value="Device"
            palette={palette}
            onPress={() => Linking.openSettings()}
          />
          <SettingRow
            icon={<Shield color={palette.muted} size={19} strokeWidth={2} />}
            title="Privacy & security"
            subtitle="Secure mobile session storage and account controls"
            value={signedIn ? 'Protected' : 'Guest'}
            palette={palette}
            last
          />
        </View>

        <View style={styles.securityCard}>
          <Headphones color={palette.muted} size={20} strokeWidth={2} />
          <View style={styles.securityCopy}>
            <Text style={styles.securityTitle}>Mobile session security</Text>
            <Text style={styles.securityText}>
              On iOS and Android, Echoo stores account tokens with Expo SecureStore rather than ordinary local app storage.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  palette,
  onPress,
  last = false,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  value: string;
  palette: EchooColors;
  onPress?: () => void;
  last?: boolean;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress} disabled={!onPress}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
      {onPress ? <ChevronRight color={palette.faint} size={17} /> : null}
    </Pressable>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 50 },
  accountStrip: { minHeight: 72, backgroundColor: palette.surface, borderRadius: 17, borderWidth: 1, borderColor: palette.line, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  accountIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1 },
  accountName: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  accountMeta: { color: palette.muted, fontSize: 11, marginTop: 3 },
  group: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: palette.line },
  rowLast: { borderBottomWidth: 0 },
  rowIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, paddingHorizontal: 10 },
  rowTitle: { color: palette.ink, fontSize: 13.5, fontWeight: '900' },
  rowSubtitle: { color: palette.muted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  rowValue: { color: palette.blue, fontSize: 11, fontWeight: '800', marginRight: 3 },
  themePicker: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  themeOption: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionActive: {
    borderColor: palette.blue,
    backgroundColor: palette.blue,
  },
  themeOptionText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  themeOptionTextActive: { color: '#FFFFFF' },
  securityCard: { marginTop: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  securityCopy: { flex: 1 },
  securityTitle: { color: palette.ink, fontSize: 13, fontWeight: '900' },
  securityText: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
});
