import { LinearGradient } from 'expo-linear-gradient';
import { Text, View, StyleSheet } from 'react-native';

export function EchooBrand() {
  return (
    <View style={styles.row}>
      <View style={styles.mark}>
        <LinearGradient
          colors={["#2563EB", "#1D4ED8"]}
          style={[styles.shape, styles.primary]}
        />
        <LinearGradient
          colors={["#D7E3FF", "#9CB4E8"]}
          style={[styles.shape, styles.secondary]}
        />
      </View>
      <Text style={styles.text}>echoo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mark: {
    width: 34,
    height: 34,
    marginRight: 8,
  },
  shape: {
    position: 'absolute',
    width: 18,
    height: 28,
    borderRadius: 20,
    transform: [{ rotate: '42deg' }],
  },
  primary: {
    left: 4,
    top: 0,
  },
  secondary: {
    right: 3,
    bottom: 0,
  },
  text: {
    color: '#10204A',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -1,
  },
});
