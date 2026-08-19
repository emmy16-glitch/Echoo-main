import { useRouter } from 'expo-router';
import {
  Bell,
  Heart,
  Home,
  Library,
  Radio,
  Search,
  Settings,
  UserRound,
  X,
} from 'lucide-react-native';
import { useMemo } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function MenuScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  const items = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Live', path: '/live', icon: Radio },
    { label: 'Library', path: '/library', icon: Library },
    { label: 'Search', path: '/search', icon: Search },
    { label: 'Favorites', path: '/favorites', icon: Heart },
    { label: 'Notifications', path: '/notifications', icon: Bell },
    { label: 'Profile', path: '/profile', icon: UserRound },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ECHOO LISTENER</Text>
            <Text style={styles.title}>Menu</Text>
          </View>
          <Pressable style={styles.closeButton} onPress={() => router.back()}>
            <X color={palette.ink} size={22} />
          </Pressable>
        </View>

        <View style={styles.brandCard}>
          <View style={styles.brandMark}>
            <View style={[styles.dot, styles.dotOne]} />
            <View style={[styles.dot, styles.dotTwo]} />
            <View style={[styles.dot, styles.dotThree]} />
          </View>
          <View style={styles.brandCopy}>
            <Text style={styles.brandName}>echoo</Text>
            <Text style={styles.brandText}>Live audio, stations, shows and published creator audio.</Text>
          </View>
        </View>

        <View style={styles.menuGroup}>
          {items.map(({ label, path, icon: Icon }, index) => (
            <Pressable
              key={label}
              style={[styles.menuRow, index === items.length - 1 && styles.menuRowLast]}
              onPress={() => router.replace(path as never)}
            >
              <View style={styles.menuIcon}>
                <Icon color={palette.blue} size={21} />
              </View>
              <Text style={styles.menuLabel}>{label}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footerText}>Creator tools are intentionally outside the Listener V2 navigation.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: palette.blue, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: palette.ink, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, marginTop: 2 },
  closeButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  brandCard: { marginTop: 12, backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.line, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  brandMark: { width: 48, height: 48 },
  dot: { position: 'absolute', width: 24, height: 24, borderRadius: 13 },
  dotOne: { left: 0, top: 12, backgroundColor: '#2F63F6' },
  dotTwo: { right: 0, top: 4, backgroundColor: '#4B7BFF' },
  dotThree: { right: 5, bottom: 0, backgroundColor: '#7E9DFF', opacity: 0.78 },
  brandCopy: { flex: 1 },
  brandName: { color: palette.ink, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  brandText: { color: palette.muted, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  menuGroup: { marginTop: 18, backgroundColor: palette.surface, borderRadius: 20, borderWidth: 1, borderColor: palette.line, overflow: 'hidden' },
  menuRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: palette.line },
  menuRowLast: { borderBottomWidth: 0 },
  menuIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: '900', paddingHorizontal: 11 },
  chevron: { color: palette.faint, fontSize: 27, lineHeight: 30 },
  footerText: { color: palette.faint, fontSize: 10.5, lineHeight: 16, textAlign: 'center', marginTop: 16, paddingHorizontal: 24 },
});
