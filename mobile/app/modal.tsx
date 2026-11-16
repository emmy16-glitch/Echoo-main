import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EchooColors, getEchooColors, radius } from '@/src/theme/echooTheme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ModalScreen() {
  const styles = createStyles(getEchooColors(useColorScheme()));
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Echoo</Text>
      <Text style={styles.copy}>Mobile preview modal.</Text>
      <Link href="/" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Back home</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const createStyles = (colors: EchooColors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    backgroundColor: colors.paper,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
  },
  button: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '900',
  },
});
