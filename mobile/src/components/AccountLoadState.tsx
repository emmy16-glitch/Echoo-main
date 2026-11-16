import { ArrowLeft, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getEchooColors } from '@/src/theme/echooTheme';

export function AccountLoadState({ title, error, onRetry, onBack }: {
  title: string;
  error: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  const palette = getEchooColors(useColorScheme());
  return <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top', 'bottom', 'left', 'right']}>
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft color={palette.ink} size={24} /></Pressable>
      <Text style={[styles.heading, { color: palette.ink }]}>{title}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <View style={[styles.card, { backgroundColor: palette.surfaceRaised, borderColor: palette.line }]}>
        <View style={[styles.icon, { backgroundColor: palette.blueSoft }]}><WifiOff size={28} color={palette.blue} /></View>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>Couldn’t connect</Text>
        <Text style={[styles.message, { color: palette.muted }]}>We couldn’t load this page. Check your connection and try again. Your account is still signed in.</Text>
        <Pressable accessibilityRole="button" style={[styles.retry, { backgroundColor: palette.blue }]} onPress={onRetry}><Text style={styles.retryText}>Try again</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.secondary} onPress={onBack}><Text style={[styles.secondaryText, { color: palette.blue }]}>Go back</Text></Pressable>
      </View> : <View style={styles.loading}><ActivityIndicator size="large" color={palette.blue} /><Text style={[styles.message, { color: palette.muted }]}>Loading {title.toLowerCase()}…</Text></View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, gap: 8 },
  back: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, fontFamily: 'DMSans_700Bold', fontSize: 23 },
  content: { flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  card: { width: '100%', maxWidth: 420, padding: 24, borderRadius: 22, borderWidth: 1, alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontFamily: 'DMSans_700Bold', fontSize: 21, textAlign: 'center' },
  message: { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 },
  retry: { alignSelf: 'stretch', minHeight: 52, borderRadius: 16, marginTop: 24, paddingHorizontal: 24, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontFamily: 'DMSans_700Bold', fontSize: 15, textAlign: 'center' },
  secondary: { minHeight: 48, alignSelf: 'stretch', padding: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryText: { fontFamily: 'DMSans_500Medium', fontSize: 14, textAlign: 'center' },
  loading: { alignItems: 'center', gap: 12 },
});
