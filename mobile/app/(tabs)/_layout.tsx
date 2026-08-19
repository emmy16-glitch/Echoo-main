import { Tabs } from 'expo-router';
import {
  CircleUserRound,
  Home,
  Library,
  Radio,
  UserRound,
} from 'lucide-react-native';
import { colors } from '@/src/theme/echooTheme';

function makeTabIcon(Icon: typeof Home) {
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Icon color={color} size={size} strokeWidth={2.4} />;
  }

  return TabIcon;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          height: 82,
          paddingTop: 8,
          paddingBottom: 16,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          backgroundColor: '#ffffff',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: makeTabIcon(Home) }} />
      <Tabs.Screen name="live" options={{ title: 'Live', tabBarIcon: makeTabIcon(Radio) }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: makeTabIcon(Library) }} />
      <Tabs.Screen name="creator" options={{ title: 'Creator', tabBarIcon: makeTabIcon(UserRound) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: makeTabIcon(CircleUserRound) }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
