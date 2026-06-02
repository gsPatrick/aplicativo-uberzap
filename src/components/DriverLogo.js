import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

/** Proporção da logo recortada (~388x146) */
const LOGO_ASPECT = 2.66;
const DEFAULT_WIDTH = 280;

export default function DriverLogo({ width = DEFAULT_WIDTH, style, accessibilityLabel = 'UbeZap Motorista' }) {
  const height = Math.round(width / LOGO_ASPECT);

  return (
    <View style={[styles.wrap, { width, height }, style]}>
      <Image
        source={require('../../assets/images/logomotorista.jpeg')}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 12,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
