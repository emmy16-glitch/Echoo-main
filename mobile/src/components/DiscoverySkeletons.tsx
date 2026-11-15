import { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function Pulse({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return <Animated.View style={{ opacity }} accessible accessibilityLabel="Loading content">{children}</Animated.View>;
}

function Block({ width, height, radius = 8 }: { width: number | `${number}%`; height: number; radius?: number }) {
  return <View style={[styles.block, { width, height, borderRadius: radius }]} />;
}

function Cards({ count = 2 }: { count?: number }) {
  return <View style={styles.cards}>{Array.from({ length: count }, (_, index) => <View key={index} style={styles.card}>
    <Block width="100%" height={151} radius={20} />
    <View style={styles.cardLine}><Block width="85%" height={15} /><Block width="58%" height={11} /></View>
  </View>)}</View>;
}

export function HomeSkeleton() {
  return <Pulse>
    <View style={styles.hero}>
      <Block width={95} height={13} />
      <Block width="91%" height={34} />
      <Block width="64%" height={34} />
      <Block width={106} height={39} radius={22} />
    </View>
    <View style={styles.heading}><Block width={173} height={21} /><Block width={48} height={15} /></View>
    <Cards />
    <View style={styles.headingSpaced}><Block width={138} height={21} /><Block width={48} height={15} /></View>
    <Cards />
  </Pulse>;
}

export function BrowseSkeleton() {
  return <Pulse>
    <View style={styles.browseCards}><Cards /></View>
    <View style={styles.headingSpaced}><Block width={190} height={23} /><Block width={48} height={15} /></View>
    <Cards />
  </Pulse>;
}

export function CollectionSkeleton() {
  return <Pulse>
    <View style={styles.collectionHero}>
      <Block width="46%" height={155} radius={20} />
      <View style={styles.collectionCopy}><Block width="90%" height={26} /><Block width="70%" height={14} /><Block width="54%" height={14} /></View>
    </View>
    <View style={styles.description}><Block width="94%" height={13} /><Block width="80%" height={13} /></View>
    <View style={styles.buttons}><Block width="45%" height={45} radius={23} /><Block width="45%" height={45} radius={23} /></View>
    {Array.from({ length: 5 }, (_, index) => <View key={index} style={styles.row}>
      <Block width={68} height={58} radius={5} />
      <View style={styles.rowCopy}><Block width="80%" height={16} /><Block width="54%" height={12} /></View>
    </View>)}
  </Pulse>;
}

export function StationSkeleton() {
  return <Pulse>
    <Block width="100%" height={170} radius={18} />
    <View style={styles.row}><Block width={72} height={72} radius={36} /><View style={styles.rowCopy}><Block width="76%" height={24} /><Block width="54%" height={13} /></View></View>
    <View style={styles.description}><Block width="90%" height={13} /><Block width="69%" height={13} /></View>
    <View style={styles.buttons}><Block width="42%" height={42} radius={21} /><Block width="42%" height={42} radius={21} /></View>
    <View style={styles.headingSpaced}><Block width={150} height={21} /></View>
    <Cards />
  </Pulse>;
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#E3EAF4' },
  hero: { gap: 10, marginTop: 15, marginBottom: 22 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headingSpaced: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 44, marginBottom: 14 },
  cards: { flexDirection: 'row', gap: 16, overflow: 'hidden' },
  card: { width: 151, gap: 11 },
  cardLine: { gap: 7 },
  browseCards: { marginTop: 27 },
  collectionHero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 49 },
  collectionCopy: { flex: 1, gap: 14 },
  description: { gap: 9, marginTop: 20 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, marginBottom: 14 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  rowCopy: { flex: 1, gap: 8 },
});
