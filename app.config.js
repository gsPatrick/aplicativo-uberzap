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
  // Mesma versão para motorista e passageiro (pedido do cliente).
  const versionName = '3.0004';
  const versionCode = 30004;

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
        // @react-native-firebase exige frameworks estáticos no iOS.
        useFrameworks: 'static',
      },
    },
  ];

  const basePlugins = config.plugins || [];
  const rest = basePlugins.filter((p) => {
    if (p === 'expo-build-properties' || p === 'expo-font') return false;
    if (Array.isArray(p) && (p[0] === 'expo-build-properties' || p[0] === 'expo-font')) return false;
    return true;
  });

  // Embute a fonte de ícones (MaterialIcons) no binário nativo. Sem isto, no
  // SDK 53 (RN 0.79/React 19) o auto-load assíncrono do @expo/vector-icons
  // corre com o primeiro paint no Android e os glifos ficam invisíveis
  // (no iOS o fallback re-renderiza, por isso só quebra no Android).
  //
  // IMPORTANTE: usar a forma simples (lista de caminhos de .ttf), NÃO a forma
  // estruturada com `fontFamily`/`fontDefinitions`. A simples copia o arquivo
  // para `android/app/src/main/assets/fonts/MaterialIcons.ttf`, e o Android
  // resolve `fontFamily: 'MaterialIcons'` (o nome que o <MaterialIcons> do
  // @expo/vector-icons usa) pelo NOME DO ARQUIVO. A forma estruturada registrava
  // a fonte sob o nome `material`, que não bate com `MaterialIcons` → glifos
  // invisíveis no APK.
  const fontPlugin = [
    'expo-font',
    {
      fonts: ['./assets/fonts/MaterialIcons.ttf'],
    },
  ];

  const plugins = [
    // PRIMEIRO no array = mod de manifest roda por ÚLTIMO (a ordem de execução
    // dos mods é inversa à do array). Resolve o conflito de meta-data FCM entre
    // expo-notifications e @react-native-firebase/messaging (tools:replace).
    './plugins/withFirebaseManifestFix.js',
    // Tipo mediaPlayback no foreground service do Notifee (Android 14+).
    './plugins/withNotifeeMediaForegroundService.js',
    buildProps,
    fontPlugin,
    '@react-native-firebase/app',
    '@react-native-firebase/messaging',
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
        // Permite que Linking.canOpenURL detecte Waze e Google Maps (navegação).
        LSApplicationQueriesSchemes: [
          ...((config.ios?.infoPlist || {}).LSApplicationQueriesSchemes || []),
          'waze',
          'comgooglemaps',
        ],
      },
    },
    android: {
      ...config.android,
      package: androidPackage,
      versionCode,
      googleServicesFile,
      // SDK 53 liga edge-to-edge por padrão, o que quebra o adjustResize do
      // teclado (campos ficam escondidos no chat/login). Desligamos para manter
      // o comportamento do SDK 52 e o teclado empurrar a tela corretamente.
      edgeToEdgeEnabled: false,
      softwareKeyboardLayoutMode: 'resize',
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
