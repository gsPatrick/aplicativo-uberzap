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
   * Pacotes EXATAMENTE como publicados na Google Play (não alterar).
   *   - Motorista  -> app.br.uberzap.motorista
   *   - Passageiro -> br.app.uberzap.passageiro
   */
  const androidPackage = isDriver ? 'app.br.uberzap.motorista' : 'br.app.uberzap.passageiro';

  /**
   * versionCode DEVE ser maior que o publicado (motorista 30000, passageiro 10000).
   * versionName é só rótulo de exibição (não afeta a aceitação da atualização).
   */
  const versionName = isDriver ? '3.0.1' : '1.0.1';
  const versionCode = isDriver ? 30001 : 10001;

  /**
   * google-services.json por variante (FCM / push remoto).
   * IMPORTANTE: precisam ser gerados no Firebase para os NOVOS pacotes acima
   * (app.br.uberzap.motorista / br.app.uberzap.passageiro) e salvos nestes caminhos:
   *   - Motorista  -> ./credentials/google-services.driver.json
   *   - Passageiro -> ./credentials/google-services.passenger.json
   * Sem o arquivo do pacote certo, o push NÃO funciona.
   */
  const googleServicesFile = isDriver
    ? './credentials/google-services.driver.json'
    : './credentials/google-services.passenger.json';

  /**
   * Corrige EAS: Compose Compiler exige Kotlin ≥ 1.9.25.
   * targetSdk/compileSdk 35 — os apps publicados já miram API 35 (Android 15) e a
   * Play não aceita rebaixar o targetSdk.
   */
  const buildProps = [
    'expo-build-properties',
    {
      android: {
        kotlinVersion: '1.9.25',
        compileSdkVersion: 35,
        targetSdkVersion: 35,
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
    version: versionName,
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
      package: androidPackage,
      versionCode,
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
