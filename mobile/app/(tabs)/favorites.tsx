import { Heart, Music2, Radio } from 'lucide-react-native';
import { useMemo } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { EchooColors, getEchooColors } from '@/src/theme/echooTheme';

export default function FavoritesScreen() {
  const scheme = useColorScheme();
  const palette = getEchooColors(scheme);
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>YOUR ECHOO</Text>
        <Text style={styles.title}>Favorites</Text>
        <Text style={styles.subtitle}>Keep your favorite stations and audio close.</Text>

        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Heart color="#FFFFFF" fill="#FFFFFF" size={27} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Nothing saved yet</Text>
            <Text style={styles.heroText}>
              Tap the heart on a station or audio item and it will appear here.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Your favorites will include</Text>

        <View style={styles.optionCard}>
          <View style={styles.optionIcon}><Radio color={palette.blue} size={22} /></View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>Favorite stations</Text>
            <Text style={styles.optionText}>Quickly return to the creators and stations you enjoy.</Text>
          </View>
        </View>

        <View style={styles.optionCard}>
          <View style={styles.optionIcon}><Music2 color={palette.blue} size={22} /></View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>Favorite audio</Text>
            <Text style={styles.optionText}>Save published music, podcasts, teachings and recordings.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (palette: EchooColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, paddingTop: 30, paddingBottom: 120 },
  eyebrow: { color: palette.blue, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: palette.ink, fontSize: 32, fontWeight: '900', letterSpacing: -1, marginTop: 6 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  heroCard: { marginTop: 28, backgroundColor: palette.surface, borderRadius: 22, borderWidth: 1, borderColor: palette.line, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1 },
  heroTitle: { color: palette.ink, fontSize: 17, fontWeight: '900' },
  heroText: { color: palette.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '900', marginTop: 28, marginBottom: 10 },
  optionCard: { backgroundColor: palette.surface, borderRadius: 17, borderWidth: 1, borderColor: palette.line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  optionIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: palette.blueSoft, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1 },
  optionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  optionText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
