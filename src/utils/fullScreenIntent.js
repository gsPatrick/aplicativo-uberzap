/**
 * Permissão de "notificações em tela cheia" (Android 14+ / USE_FULL_SCREEN_INTENT).
 * Sem ela, o alerta de corrida NÃO abre em tela cheia (estilo ligação) com o
 * celular bloqueado — vira só uma notificação. É obrigatória pro motorista.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getPackage() {
  return (
    Constants?.expoConfig?.android?.package ||
    Constants?.manifest?.android?.package ||
    'app.br.uberzap.motorista'
  );
}

/** true se pode usar full-screen intent (Android <14 sempre pode). */
export async function canUseFullScreenIntent() {
  if (Platform.OS !== 'android') return true;
  try {
    const notifee = require('@notifee/react-native').default;
    if (typeof notifee.canUseFullScreenIntent === 'function') {
      return await notifee.canUseFullScreenIntent();
    }
    return true;
  } catch (_) {
    return true;
  }
}

/** Abre a tela do sistema pra ativar "notificações em tela cheia" do app. */
export async function openFullScreenIntentSettings() {
  if (Platform.OS !== 'android') return;
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync(
      'android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT',
      { data: 'package:' + getPackage() }
    );
  } catch (e) {
    // Fallback: configurações gerais do app.
    try {
      const { Linking } = require('react-native');
      await Linking.openSettings();
    } catch (_) {}
  }
}
