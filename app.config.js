/**
 * Variante de build: passageiro ou motorista (APK/IPA distintos).
 * - EAS: perfis em eas.json definem APP_VARIANT.
 * - Local: APP_VARIANT=driver npx expo run:android
 */
module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || 'passenger';
  const isDriver = variant === 'driver';

  /** Corrige EAS: Compose Compiler do expo-modules-core exige Kotlin ≥ 1.9.25 */
  const buildProps = [
    'expo-build-properties',
    {
      android: {
        kotlinVersion: '1.9.25',
      },
    },
  ];
  const basePlugins = config.plugins || [];
  const rest = basePlugins.filter((p) => {
    if (p === 'expo-build-properties' || p === 'expo-font') return false;
    if (Array.isArray(p) && p[0] === 'expo-build-properties') return false;
    return true;
  });
  const plugins = [buildProps, 'expo-font', ...rest];

  return {
    ...config,
    plugins,
    name: isDriver ? 'UbeZap Motorista' : config.name,
    // Mantém o mesmo slug do projeto Expo (um projeto EAS, dois binários).
    ios: {
      ...config.ios,
      bundleIdentifier: isDriver ? 'com.ubezap.driver' : (config.ios?.bundleIdentifier || 'com.ubezap.app'),
    },
    android: {
      ...config.android,
      package: isDriver ? 'com.ubezap.driver' : (config.android?.package || 'com.ubezap.app'),
    },
    extra: {
      ...(config.extra || {}),
      appVariant: variant,
    },
  };
};
