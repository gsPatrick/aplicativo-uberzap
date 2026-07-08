/**
 * Permissão de "notificações em tela cheia" (Android 14+ / USE_FULL_SCREEN_INTENT).
 * Sem ela, o alerta de corrida NÃO abre em tela cheia (estilo ligação) com o
 * celular bloqueado — vira só uma notificação. É obrigatória pro motorista.
 */
import { Platform, Alert } from 'react-native';
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

let promptingFsi = false;

/**
 * Se a permissão de tela cheia NÃO estiver ativa, mostra um alerta obrigatório
 * (não-cancelável) levando o usuário pra ativar. Chamável de qualquer tela.
 * @returns {Promise<boolean>} true se já estava ativa.
 */
export async function promptFullScreenIfNeeded() {
  if (Platform.OS !== 'android') return true;
  if (promptingFsi) return false;
  const ok = await canUseFullScreenIntent().catch(() => true);
  if (ok) return true;
  promptingFsi = true;
  Alert.alert(
    'Ative a chamada em tela cheia',
    'Obrigatório para a corrida abrir em TELA CHEIA (não só o banner no topo).\n\nVá em: Configurações → Apps → UbeZap Motorista → Notificações em tela cheia → ATIVAR.\n\n(Isso é diferente do "modo desenvolvedor".)',
    [
      { text: 'Agora não', style: 'cancel', onPress: () => { promptingFsi = false; } },
      {
        text: 'Ativar',
        onPress: async () => {
          await openFullScreenIntentSettings().catch(() => {});
          promptingFsi = false;
        },
      },
    ],
    { cancelable: false }
  );
  return false;
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
