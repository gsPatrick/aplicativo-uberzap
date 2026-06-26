const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Android 14+: um foreground service de áudio precisa declarar o tipo
 * `mediaPlayback` no manifesto. O Notifee declara o ForegroundService no AAR
 * core SEM tipo, então aqui fazemos um merge adicionando o foregroundServiceType.
 *
 * Deve rodar como um dos ÚLTIMOS plugins de manifest (depois do merge do Notifee).
 */
const SERVICE_NAME = 'app.notifee.core.ForegroundService';

module.exports = function withNotifeeMediaForegroundService(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest.$) manifest.$ = {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }
    const app = manifest.application && manifest.application[0];
    if (!app) return cfg;
    if (!Array.isArray(app.service)) app.service = [];

    let svc = app.service.find(
      (s) => s.$ && s.$['android:name'] === SERVICE_NAME
    );
    if (!svc) {
      svc = { $: { 'android:name': SERVICE_NAME } };
      app.service.push(svc);
    }
    // merge: adiciona o tipo ao service que o Notifee declara no AAR.
    svc.$['android:foregroundServiceType'] = 'mediaPlayback';
    svc.$['tools:node'] = 'merge';
    return cfg;
  });
};
