import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/src/theme/echooTheme';

export default function ModalScreen() {
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

const styles = StyleSheet.create({
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
