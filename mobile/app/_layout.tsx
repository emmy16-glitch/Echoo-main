import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerMiniPlayer } from '@/src/components/ListenerV2';
import { PlaybackProvider } from '@/src/playback/PlaybackProvider';
import { registerEchooPushNotifications } from '@/src/services/pushNotifications';
import { EchooThemeProvider } from '@/src/theme/ThemePreference';
import { getEchooColors } from '@/src/theme/echooTheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <EchooThemeProvider>
          <RootLayoutContent />
        </EchooThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutContent() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = getEchooColors(colorScheme);

  const navigationTheme = useMemo(() => {
    const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: palette.blue,
        background: palette.background,
        card: palette.surface,
        text: palette.ink,
        border: palette.line,
        notification: palette.red,
      },
    };
  }, [colorScheme, palette]);

  useEffect(() => {
    void registerEchooPushNotifications().catch(() => undefined);
    const openLiveNotification = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data = response.notification.request.content.data as { broadcastId?: string; title?: string; stationName?: string; coverArt?: string };
      if (!data?.broadcastId) return;
      router.navigate({
        pathname: '/live-room',
        params: {
          broadcastId: String(data.broadcastId),
          title: String(data.title || 'Live broadcast'),
          stationName: String(data.stationName || 'Echoo Station'),
          ...(data.coverArt ? { coverArt: String(data.coverArt) } : {}),
        },
      });
    };
    void Notifications.getLastNotificationResponseAsync().then(openLiveNotification).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(openLiveNotification);
    return () => subscription.remove();
  }, [router]);

  return (
    <PlaybackProvider>
      <ThemeProvider value={navigationTheme}>
        <View style={styles.root}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.background },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="menu"
              options={{
                presentation: 'transparentModal',
                animation: 'slide_from_left',
                contentStyle: { backgroundColor: 'transparent' },
                gestureEnabled: true,
                gestureDirection: 'horizontal',
              }}
            />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="station" />
            <Stack.Screen name="collection" />
            <Stack.Screen name="audio-player" />
            <Stack.Screen name="live-room" />
            <Stack.Screen name="creator-live" options={{ gestureEnabled: false }} />
            <Stack.Screen name="creator-upload" />
            <Stack.Screen name="creator-content" />
            <Stack.Screen name="creator-schedule" />
            <Stack.Screen name="creator-replay" />
            <Stack.Screen name="creator-station" />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <ListenerMiniPlayer />
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </View>
      </ThemeProvider>
    </PlaybackProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
