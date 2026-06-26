const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Resolve o conflito de merge do AndroidManifest entre expo-notifications e
 * @react-native-firebase/messaging: ambos declaram os meta-data
 * `default_notification_channel_id` e `default_notification_color` com valores
 * diferentes. Adiciona `tools:replace` para o valor do app prevalecer.
 *
 * DEVE ser o ÚLTIMO plugin de manifest (roda depois do expo-notifications).
 */
const TARGETS = {
  'com.google.firebase.messaging.default_notification_channel_id': 'android:value',
  'com.google.firebase.messaging.default_notification_color': 'android:resource',
};

module.exports = function withFirebaseManifestFix(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    if (!manifest.$) manifest.$ = {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    const app = manifest.application && manifest.application[0];
    if (app && Array.isArray(app['meta-data'])) {
      app['meta-data'].forEach((md) => {
        const name = md.$ && md.$['android:name'];
        if (name && TARGETS[name]) {
          md.$['tools:replace'] = TARGETS[name];
        }
      });
    }
    return modConfig;
  });
};
