import { useMemo as useThemeMemo } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';
import { LinearGradient } from 'expo-linear-gradient';
import { Headphones, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function EchooHomeHero({ onSearch }: { onSearch?: () => void }) {
  const palette = getEchooColors(useColorScheme());
  const styles = useThemeMemo(() => createThemeStyles(palette), [palette]);

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Good morning, Listener 👋</Text>
      <Text style={styles.title}>
        Your world of{`\n`}live audio.
      </Text>
      <Text style={styles.subtitle}>
        Join live conversations, discover stations and connect through sound.
      </Text>

      <View style={styles.waveCard}>
        <LinearGradient
          colors={[palette.blue, '#244A86']}
          style={styles.icon}
        >
          <Headphones color="#fff" size={28} />
        </LinearGradient>
        <View style={styles.waveText}>
          <Text style={styles.live}>LIVE ON ECHOO</Text>
          <Text style={styles.show}>Discover what{`'`}s happening now</Text>
        </View>
      </View>

      <Pressable style={styles.search} onPress={onSearch}>
        <Search size={20} color={palette.muted} />
        <Text style={styles.placeholder}>Search shows, stations and hosts</Text>
      </Pressable>
    </View>
  );
}

const createThemeStyles = (palette: EchooColors) => StyleSheet.create({
  container: { marginTop: 18 },
  greeting: { fontSize: 15, color: palette.muted, fontWeight: '600' },
  title: { marginTop: 8, fontSize: 32, lineHeight: 35, fontWeight: '900', color: palette.ink },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 20, color: palette.muted },
  waveCard: { marginTop: 22, height: 92, borderRadius: 24, backgroundColor: palette.blueSoft, flexDirection: 'row', alignItems: 'center', padding: 16 },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  waveText: { marginLeft: 14 },
  live: { color: palette.blue, fontSize: 11, fontWeight: '900' },
  show: { color: palette.ink, marginTop: 5, fontSize: 15, fontWeight: '800' },
  search: { height: 54, marginTop: 16, borderRadius: 16, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  placeholder: { marginLeft: 10, color: palette.faint, fontSize: 14 },
});
