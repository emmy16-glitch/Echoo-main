import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  Bell,
  Heart,
  Home,
  Library,
  LogIn,
  LogOut,
  Radio,
  Search,
  Settings,
  UserRound,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooBrand } from '@/src/components/EchooBrand';
import {
  clearSession,
  getCurrentUser,
  hasEchooSession,
  type EchooUser,
} from '@/src/services/echooApi';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

type MenuItem = {
  label: string;
  path: string;
  icon: typeof Home;
};

const primaryItems: MenuItem[] = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Live', path: '/live', icon: Radio },
  { label: 'Search', path: '/search', icon: Search },
  { label: 'Library', path: '/library', icon: Library },
];

const accountItems: MenuItem[] = [
  { label: 'Favorites', path: '/favorites', icon: Heart },
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Profile', path: '/profile', icon: UserRound },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export default function MenuScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [user, setUser] = useState<EchooUser | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;

    hasEchooSession()
      .then(async (session) => {
        if (!active) return;
        setSignedIn(session);
        if (!session) return;

        const currentUser = await getCurrentUser().catch(() => null);
        if (active) setUser(currentUser);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const navigate = (path: string) => router.replace(path as never);

  const handleSessionAction = async () => {
    if (!signedIn) {
      navigate('/auth');
      return;
    }

    await clearSession();
    navigate('/');
  };

  const renderItem = ({ label, path, icon: Icon }: MenuItem) => (
    <Pressable
      key={label}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      onPress={() => navigate(path)}
      accessibilityRole="button"
    >
      <Icon color={palette.muted} size={19} strokeWidth={2} />
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.overlay}>
      <Pressable
        style={styles.backdrop}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />

      <SafeAreaView style={styles.drawer} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <EchooBrand markSize={48} textSize={24} textColor={palette.ink} gap={0} />
            <Pressable
              style={styles.closeButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <X color={palette.ink} size={20} />
            </Pressable>
          </View>

          <View style={styles.account}>
            <View style={styles.avatar}>
              {user?.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                />
              ) : (
                <UserRound color={palette.muted} size={20} />
              )}
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.greeting}>{signedIn ? 'Hello,' : 'Welcome'}</Text>
              <Text style={styles.accountName} numberOfLines={1}>
                {user?.displayName || user?.username || 'Echoo listener'}
              </Text>
            </View>
          </View>

          <View style={styles.menuGroup}>{primaryItems.map(renderItem)}</View>
          <View style={styles.divider} />
          <View style={styles.menuGroup}>{accountItems.map(renderItem)}</View>

          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={handleSessionAction}
              accessibilityRole="button"
            >
              {signedIn ? (
                <LogOut color={palette.muted} size={19} strokeWidth={2} />
              ) : (
                <LogIn color={palette.muted} size={19} strokeWidth={2} />
              )}
              <Text style={styles.menuLabel}>{signedIn ? 'Sign out' : 'Sign in'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'transparent' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.56)' },
  drawer: {
    width: '74%',
    maxWidth: 312,
    height: '100%',
    backgroundColor: palette.background,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: palette.line,
    shadowColor: '#000000',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 18,
  },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  account: { minHeight: 54, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.surfaceMuted,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountCopy: { flex: 1, minWidth: 0, paddingLeft: 10 },
  greeting: { color: palette.muted, fontSize: 10.5, fontWeight: '600' },
  accountName: { color: palette.ink, fontSize: 13.5, fontWeight: '800', marginTop: 1 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  menuGroup: { width: '100%' },
  menuRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  menuRowPressed: { opacity: 0.52 },
  menuLabel: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '600' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
    marginVertical: 12,
    marginHorizontal: 6,
  },
  footer: { marginTop: 'auto', paddingTop: 28 },
});
