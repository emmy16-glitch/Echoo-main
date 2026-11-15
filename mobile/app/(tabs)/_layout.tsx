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
      paddingTop: 10,
      paddingBottom: tabMetrics.bottomPadding,
      borderTopWidth: 0,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: '#F7F9FC',
      elevation: 12,
    }),
    [palette, tabMetrics.bottomPadding, tabMetrics.height]
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#050505',
        tabBarInactiveTintColor: '#050505',
        tabBarStyle: tabStyle,
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'DMSans_500Medium',
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
