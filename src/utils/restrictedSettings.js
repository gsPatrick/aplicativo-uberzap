/**
 * Android 13+: apps instalados fora da Play Store (APK sideload) têm permissões
 * "restritas" bloqueadas — overlay, acessibilidade etc. O usuário precisa
 * liberar em ⋮ → "Permitir configurações restritas" antes de ativar a sobreposição.
 *
 * Isso explica o popup "Acesso negado ao app" no Motorola ao tentar sobrepor.
 */
import { Alert, Platform } from 'react-native';
import Constants from 'expo-constants';

function getPackage() {
  return (
    Constants?.expoConfig?.android?.package ||
    Constants?.manifest?.android?.package ||
    'app.br.uberzap.motorista'
  );
}

/** Abre a ficha do app no sistema (de onde se ativa "configurações restritas"). */
export async function openAppDetailsSettings() {
  if (Platform.OS !== 'android') return;
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', {
      data: 'package:' + getPackage(),
    });
  } catch (e) {
    try {
      const { Linking } = require('react-native');
      await Linking.openSettings();
    } catch (_) {}
  }
}

/**
 * Explica o passo extra de APK sideload e abre a ficha do app.
 * @returns {Promise<boolean>} true se o usuário escolheu abrir configurações.
 */
export function promptRestrictedSettingsGuide({ context = 'overlay' } = {}) {
  if (Platform.OS !== 'android') return Promise.resolve(false);

  const title =
    context === 'overlay'
      ? 'Motorola / Samsung: passo extra'
      : 'Permitir configurações restritas';

  const message =
    'APKs instalados fora da Google Play precisam de um passo a mais no Android 13+:\n\n' +
    '1. Toque em "Abrir ficha do app"\n' +
    '2. Toque nos ⋮ (três pontos) no canto superior\n' +
    '3. Ative "Permitir configurações restritas"\n' +
    '4. Volte ao UbeZap e tente de novo\n\n' +
    (context === 'overlay'
      ? 'A sobreposição é OPCIONAL. As corridas chegam por notificação e tela cheia mesmo sem ela.'
      : 'Depois disso, volte e conceda a permissão solicitada.');

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Entendi', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Abrir ficha do app',
        onPress: async () => {
          await openAppDetailsSettings().catch(() => {});
          resolve(true);
        },
      },
    ]);
  });
}
