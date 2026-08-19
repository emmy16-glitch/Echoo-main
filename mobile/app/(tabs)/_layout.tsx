import { Tabs } from 'expo-router';
import {
  CircleUserRound,
  Heart,
  Home,
  Library,
  Search,
} from 'lucide-react-native';
import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
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

  const tabStyle = useMemo(
    () => ({
      height: 84,
      paddingTop: 8,
      paddingBottom: 16,
      borderTopWidth: 1,
      borderTopColor: palette.line,
      backgroundColor: palette.tab,
    }),
    [palette]
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.blue,
        tabBarInactiveTintColor: palette.tabInactive,
        tabBarStyle: tabStyle,
        tabBarLabelStyle: {
          fontSize: 10.5,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: makeTabIcon(Home) }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: makeTabIcon(Library) }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: makeTabIcon(Search) }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favorites', tabBarIcon: makeTabIcon(Heart) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: makeTabIcon(CircleUserRound) }} />

      {/* Listener V2 keeps these routes available without exposing them as primary tabs. */}
      <Tabs.Screen name="live" options={{ href: null }} />
      <Tabs.Screen name="creator" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
