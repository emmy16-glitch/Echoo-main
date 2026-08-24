import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

type EchooBrandProps = {
  markSize?: number;
  textSize?: number;
  textColor?: string;
  gap?: number;
  showText?: boolean;
  textPull?: number;
  markOffsetY?: number;
};

const logoSource = require('../../assets/images/adaptive-icon.png');

export function EchooBrand({
  markSize = 42,
  textSize = 24,
  textColor = '#FFFFFF',
  gap = 2,
  showText = true,
  textPull = -8,
  markOffsetY = 2,
}: EchooBrandProps) {
  return (
    <View style={[styles.row, { gap }]}>
      <Image
        source={logoSource}
        style={{
          width: markSize,
          height: markSize,
          marginRight: showText ? textPull : 0,
          transform: [{ translateY: markOffsetY }],
        }}
        contentFit="contain"
        accessible
        accessibilityLabel="Echoo"
      />
      {showText ? (
        <Text style={[styles.text, { color: textColor, fontSize: textSize }]}>echoo</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontWeight: '900',
    letterSpacing: 0,
  },
});
