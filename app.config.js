/**
 * Variante de build: passageiro ou motorista (APK/IPA distintos).
 * - EAS: perfis em eas.json definem APP_VARIANT.
 * - Local: APP_VARIANT=driver npx expo run:android
 */
module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT || 'passenger';
  const isDriver = variant === 'driver';

  return {
    ...config,
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
