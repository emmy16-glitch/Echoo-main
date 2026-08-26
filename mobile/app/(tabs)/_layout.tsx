import { Tabs } from 'expo-router';
import {
  CircleUserRound,
  Home,
  Library,
  Search,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { getListenerTabBarMetrics } from '@/src/navigation/listenerLayout';
import { getEchooColors } from '@/src/theme/echooTheme';

function makeTabIcon(Icon: typeof Home) {
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Icon color={color} size={size} strokeWidth={2.25} />;
  }

  return TabIcon;
}

export default function TabLayout() {
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const insets = useSafeAreaInsets();
  const tabMetrics = getListenerTabBarMetrics(insets.bottom);

  const tabStyle = useMemo(
    () => ({
      height: tabMetrics.height,
      paddingTop: 7,
      paddingBottom: tabMetrics.bottomPadding,
      borderTopWidth: 1,
      borderTopColor: palette.lineStrong,
      backgroundColor: palette.tab,
    }),
    [palette, tabMetrics.bottomPadding, tabMetrics.height]
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.blue,
        tabBarInactiveTintColor: palette.tabInactive,
        tabBarStyle: tabStyle,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: makeTabIcon(Home) }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: makeTabIcon(Search) }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: makeTabIcon(Library) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: makeTabIcon(CircleUserRound) }} />
      <Tabs.Screen name="creator" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="favorites" options={{ href: null }} />
      <Tabs.Screen name="live" options={{ href: null }} />
    </Tabs>
  );
}
