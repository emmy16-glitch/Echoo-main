import { Tabs } from 'expo-router';
import {
  Compass,
  Home,
  Headphones,
  Library,
  CircleUserRound,
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
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: makeTabIcon(Compass) }} />
      <Tabs.Screen name="live" options={{ title: 'Live', tabBarIcon: makeTabIcon(Headphones) }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: makeTabIcon(Library) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: makeTabIcon(CircleUserRound) }} />
    </Tabs>
  );
}
