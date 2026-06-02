/**
 * Variante de build: passageiro ou motorista (APK/IPA distintos).
 * - EAS: perfis em eas.json definem APP_VARIANT.
 * - Local: APP_VARIANT=driver npx expo run:android
 */
module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || 'passenger';
  const isDriver = variant === 'driver';

  const displayName = isDriver ? 'UbeZap Motorista' : 'UbeZap Passageiro';
  const splashBg = isDriver ? '#1f2120' : '#ffffff';
  const iconStore = isDriver
    ? './assets/images/icon-driver-store.png'
    : './assets/images/icon-passenger-store.png';
  const adaptiveForeground = isDriver
    ? './assets/images/adaptive-icon-driver.png'
    : './assets/images/adaptive-icon-passenger.png';
  const splashImage = isDriver
    ? './assets/images/splash-driver.png'
    : './assets/images/splash-passenger.png';

  /**
   * google-services.json por variante (FCM / push remoto).
   * Baixe do Firebase Console para CADA app Android e salve nestes caminhos:
   *   - Passageiro (com.ubezap.app)    -> ./credentials/google-services.passenger.json
   *   - Motorista  (com.ubezap.driver) -> ./credentials/google-services.driver.json
   * Sem este arquivo o app NÃO registra token de push e nada chega em 2º plano.
   */
  const googleServicesFile = isDriver
    ? './credentials/google-services.driver.json'
    : './credentials/google-services.passenger.json';

  /** Corrige EAS: Compose Compiler do expo-modules-core exige Kotlin ≥ 1.9.25 */
  const buildProps = [
    'expo-build-properties',
    {
      android: {
        kotlinVersion: '1.9.25',
        newArchEnabled: false,
      },
      ios: {
        newArchEnabled: false,
      },
    },
  ];

  const basePlugins = config.plugins || [];
  const rest = basePlugins.filter((p) => {
    if (p === 'expo-build-properties' || p === 'expo-font') return false;
    if (Array.isArray(p) && p[0] === 'expo-build-properties') return false;
    return true;
  });

  const plugins = [
    buildProps,
    'expo-font',
    './plugins/withAndroidRideAlerts.js',
    ...rest,
  ];

  return {
    ...config,
    newArchEnabled: false,
    plugins,
    name: displayName,
    slug: 'ubezap-mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: iconStore,
    userInterfaceStyle: 'light',
    splash: {
      image: splashImage,
      resizeMode: 'contain',
      backgroundColor: splashBg,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: isDriver ? 'com.ubezap.driver' : (config.ios?.bundleIdentifier || 'com.ubezap.app'),
      infoPlist: {
        ...(config.ios?.infoPlist || {}),
        CFBundleDisplayName: displayName,
      },
    },
    android: {
      ...config.android,
      package: isDriver ? 'com.ubezap.driver' : (config.android?.package || 'com.ubezap.app'),
      googleServicesFile,
      adaptiveIcon: {
        foregroundImage: adaptiveForeground,
        backgroundColor: isDriver ? '#1f2120' : '#FFFFFF',
      },
    },
    extra: {
      ...(config.extra || {}),
      appVariant: variant,
    },
  };
};
