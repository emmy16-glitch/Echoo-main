import { LinearGradient } from 'expo-linear-gradient';
import { Headphones, Search } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function EchooHomeHero({ onSearch }: { onSearch?: () => void }) {
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
          colors={['#2457E9', '#4B7BFF']}
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
        <Search size={20} color="#7A7F90" />
        <Text style={styles.placeholder}>Search shows, stations and hosts</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 18 },
  greeting: { fontSize: 15, color: '#667085', fontWeight: '600' },
  title: { marginTop: 8, fontSize: 32, lineHeight: 35, fontWeight: '900', color: '#101828' },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 20, color: '#667085' },
  waveCard: { marginTop: 22, height: 92, borderRadius: 24, backgroundColor: '#F1F5FF', flexDirection: 'row', alignItems: 'center', padding: 16 },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  waveText: { marginLeft: 14 },
  live: { color: '#2457E9', fontSize: 11, fontWeight: '900' },
  show: { color: '#101828', marginTop: 5, fontSize: 15, fontWeight: '800' },
  search: { height: 54, marginTop: 16, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E7EC', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  placeholder: { marginLeft: 10, color: '#98A2B3', fontSize: 14 },
});
