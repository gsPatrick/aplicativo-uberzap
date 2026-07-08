import { Platform, Linking, NativeModules, Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { promptRestrictedSettingsGuide } from './restrictedSettings';

const { UbezapOverlay } = NativeModules;

const STORAGE_GRANTED = '@UbeZap:overlayGranted';
const STORAGE_DISMISSED_UNTIL = '@UbeZap:overlayDismissedUntil';
const STORAGE_LAST_PROMPT = '@UbeZap:overlayLastPrompt';

/** Intervalo mínimo entre alertas (evita repetir após voltar de outra tela) */
const PROMPT_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h
/** "Agora não" — não perguntar de novo por 7 dias */
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

let appStateListenerAttached = false;

function isOverlayNativeAvailable() {
  return Platform.OS === 'android' && typeof UbezapOverlay?.canDrawOverlays === 'function';
}

/**
 * Verifica permissão de sobreposição (Draw over other apps).
 * Requer build nativo com plugin withAndroidRideAlerts.
 */
export async function canDrawOverlays() {
  if (Platform.OS !== 'android') return true;
  if (!isOverlayNativeAvailable()) {
    // Expo Go / build sem módulo nativo — não bloquear nem ficar perguntando
    return true;
  }
  try {
    return await UbezapOverlay.canDrawOverlays();
  } catch (e) {
    console.warn('[Overlay] Erro ao verificar permissão:', e);
    return false;
  }
}

async function markOverlayGranted() {
  try {
    await AsyncStorage.multiSet([
      [STORAGE_GRANTED, '1'],
      [STORAGE_DISMISSED_UNTIL, ''],
      [STORAGE_LAST_PROMPT, ''],
    ]);
  } catch (_) {}
}

async function shouldSkipOverlayPrompt() {
  try {
    const dismissedUntil = await AsyncStorage.getItem(STORAGE_DISMISSED_UNTIL);
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
      return true;
    }

    const lastPrompt = await AsyncStorage.getItem(STORAGE_LAST_PROMPT);
    if (lastPrompt && Date.now() - Number(lastPrompt) < PROMPT_COOLDOWN_MS) {
      return true;
    }
  } catch (_) {}
  return false;
}

async function recordPromptShown() {
  try {
    await AsyncStorage.setItem(STORAGE_LAST_PROMPT, String(Date.now()));
  } catch (_) {}
}

async function recordDismissed() {
  try {
    await AsyncStorage.setItem(
      STORAGE_DISMISSED_UNTIL,
      String(Date.now() + DISMISS_DURATION_MS)
    );
  } catch (_) {}
}

/**
 * Revalida ao voltar do app (ex.: usuário acabou de conceder nas configurações).
 */
export async function refreshOverlayPermissionState() {
  if (Platform.OS !== 'android' || !isOverlayNativeAvailable()) {
    return true;
  }
  const granted = await canDrawOverlays();
  if (granted) {
    await markOverlayGranted();
  } else {
    try {
      await AsyncStorage.removeItem(STORAGE_GRANTED);
    } catch (_) {}
  }
  return granted;
}

function attachAppStateOverlayRefresh() {
  if (appStateListenerAttached || Platform.OS !== 'android') return;
  appStateListenerAttached = true;
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      refreshOverlayPermissionState().catch(() => {});
    }
  });
}

/**
 * Abre a tela de configuração para conceder permissão de sobreposição.
 */
export async function requestOverlayPermission() {
  if (Platform.OS !== 'android') return true;
  try {
    if (UbezapOverlay?.requestOverlayPermission) {
      await UbezapOverlay.requestOverlayPermission();
      return false;
    }
  } catch (e) {
    console.warn('[Overlay] Erro ao solicitar permissão:', e);
  }
  try {
    await Linking.openSettings();
  } catch (_) {}
  return false;
}

/**
 * Solicita overlay uma vez (com cooldown). Não repete se já concedido.
 * @param {'driver'|'passenger'} variant
 * @param {{ force?: boolean }} options
 */
export async function ensureOverlayPermission({ variant = 'driver', force = false } = {}) {
  attachAppStateOverlayRefresh();

  if (Platform.OS !== 'android') return true;
  if (!isOverlayNativeAvailable()) return true;

  const granted = await canDrawOverlays();
  if (granted) {
    await markOverlayGranted();
    return true;
  }

  if (!force && (await shouldSkipOverlayPrompt())) {
    return false;
  }

  const message =
    variant === 'passenger'
      ? 'Para ser avisado quando o motorista aceitar, chegar ou iniciar a viagem — mesmo com o app em segundo plano — ative a permissão "Exibir sobre outros apps".'
      : 'Para receber chamadas de corrida mesmo usando outros apps, o UbeZap precisa da permissão "Exibir sobre outros apps".';

  await recordPromptShown();

  return new Promise((resolve) => {
    Alert.alert('Permissão de Sobreposição', message, [
      {
        text: 'Agora não',
        style: 'cancel',
        onPress: async () => {
          await recordDismissed();
          resolve(false);
        },
      },
      {
        text: 'Conceder',
        onPress: async () => {
          await requestOverlayPermission();
          const grantedAfter = await canDrawOverlays();
          if (!grantedAfter) {
            await promptRestrictedSettingsGuide({ context: 'overlay' });
          }
          resolve(false);
        },
      },
    ]);
  });
}

/**
 * Acorda a tela (motorista: nova corrida | passageiro: atualização da viagem).
 */
export async function wakeScreenForRideAlert() {
  if (Platform.OS !== 'android') return;
  try {
    if (UbezapOverlay?.wakeScreen) {
      await UbezapOverlay.wakeScreen();
    }
  } catch (e) {
    console.warn('[Overlay] Erro ao acordar tela:', e);
  }
}

/**
 * Traz o app para frente para exibir a tela cheia da corrida (RideRequestScreen).
 * Complementa o fullScreenIntent do Notifee quando a tela está ligada.
 */
export async function launchAppForRideAlert() {
  if (Platform.OS !== 'android') return false;
  try {
    if (UbezapOverlay?.launchAppForRideAlert) {
      return await UbezapOverlay.launchAppForRideAlert();
    }
  } catch (e) {
    console.warn('[Overlay] Erro ao abrir app para corrida:', e);
  }
  return false;
}
