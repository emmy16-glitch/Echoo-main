import { useRouter, useSegments } from 'expo-router';
import { CircleUserRound, Home, Library, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getListenerTabBarMetrics } from '@/src/navigation/listenerLayout';

const DETAIL_ROUTES = new Set(['station', 'collection', 'popular-channels', 'made-for-you', 'recently-played', 'library-section']);

export function ListenerDetailTabBar() {
  const segments = useSegments();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const root = String(segments[0] || '');
  if (!DETAIL_ROUTES.has(root)) return null;
  const metrics = getListenerTabBarMetrics(insets.bottom);
  const items = [
    { label: 'Home', route: '/(tabs)', icon: Home },
    { label: 'Search', route: '/(tabs)/search', icon: Search },
    { label: 'Library', route: '/(tabs)/library', icon: Library },
    { label: 'Profile', route: '/(tabs)/profile', icon: CircleUserRound },
  ] as const;

  return <View style={[styles.bar, { height: metrics.height, paddingBottom: metrics.bottomPadding }]}>
    {items.map(({ label, route, icon: Icon }) => <Pressable key={label} style={styles.item} onPress={() => router.replace(route)} accessibilityRole="tab" accessibilityLabel={label}>
      <Icon color="#050505" size={27} strokeWidth={2.25} fill={label === 'Home' ? '#050505' : 'none'} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, flexDirection: 'row', paddingTop: 10, backgroundColor: '#F7F9FC', borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: 12 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { color: '#050505', fontFamily: 'DMSans_500Medium', fontSize: 12 },
});
