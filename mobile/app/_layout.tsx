import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ListenerMiniPlayer } from '@/src/components/ListenerV2';
import { PlaybackProvider } from '@/src/playback/PlaybackProvider';
import { EchooThemeProvider } from '@/src/theme/ThemePreference';
import { getEchooColors } from '@/src/theme/echooTheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <EchooThemeProvider>
        <RootLayoutContent />
      </EchooThemeProvider>
    </SafeAreaProvider>
  );
}

function RootLayoutContent() {
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
            <Stack.Screen name="audio-player" />
            <Stack.Screen name="live-room" />
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
