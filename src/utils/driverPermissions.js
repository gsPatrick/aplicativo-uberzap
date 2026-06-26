import { Platform, Alert, InteractionManager, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  ensureNotificationPermissions,
  registerForPushNotificationsAsync,
} from './notifications';
import { requestRideNotificationPermission } from '../services/rideNotification';
import { ensureOverlayPermission } from './androidOverlay';
import { canUseFullScreenIntent, openFullScreenIntentSettings } from './fullScreenIntent';
import { syncPushTokenWithServer } from '../services/pushSync';

const PERMISSIONS_ONBOARDED_KEY = '@UbeZap:permissionsOnboarded';

let flowInProgress = false;
let flowCompleted = false;

/** Já passou pela tela de onboarding de permissões? (mostra só 1x) */
export async function isPermissionsOnboarded() {
  try {
    return (await AsyncStorage.getItem(PERMISSIONS_ONBOARDED_KEY)) === '1';
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Aguarda a navegação montar antes de exibir diálogos nativos. */
function waitForUiReady() {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      delay(450).then(resolve);
    });
  });
}

async function requestBackgroundLocationWithRationale() {
  const { status: existing } = await Location.getBackgroundPermissionsAsync();
  if (existing === 'granted') return true;

  return new Promise((resolve) => {
    Alert.alert(
      'Localização em segundo plano',
      'Para receber corridas com o app fechado ou em outro aplicativo, escolha "Permitir o tempo todo" na próxima tela.',
      [
        { text: 'Depois', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Continuar',
          onPress: async () => {
            try {
              const { status } = await Location.requestBackgroundPermissionsAsync();
              resolve(status === 'granted');
            } catch {
              resolve(false);
            }
          },
        },
      ]
    );
  });
}

/**
 * Solicita permissões do motorista na ordem correta, com a tela já visível.
 * @param {{ force?: boolean, skipOverlay?: boolean }} options
 */
export async function requestDriverPermissionsFlow(options = {}) {
  const { force = false, skipOverlay = false } = options;

  if (flowInProgress) return null;
  if (flowCompleted && !force) return null;

  flowInProgress = true;
  try {
    await waitForUiReady();

    const result = {
      notifications: false,
      notifee: false,
      locationForeground: false,
      locationBackground: false,
      overlay: false,
      pushToken: null,
    };

    result.notifications = await ensureNotificationPermissions();
    result.notifee = await requestRideNotificationPermission();

    if (!result.notifications && !result.notifee) {
      Alert.alert(
        'Notificações',
        'Ative as notificações para receber chamadas de corrida quando o app estiver em segundo plano.'
      );
    }

    result.pushToken = await registerForPushNotificationsAsync();
    await syncPushTokenWithServer().catch(() => {});

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    result.locationForeground = fgStatus === 'granted';

    if (!result.locationForeground) {
      Alert.alert(
        'Localização',
        'A localização é necessária para receber corridas próximas e atualizar sua posição.'
      );
    } else {
      result.locationBackground = await requestBackgroundLocationWithRationale();
    }

    if (!skipOverlay && Platform.OS === 'android') {
      result.overlay = await ensureOverlayPermission({ variant: 'driver', force });
    }

    if (Platform.OS === 'android') {
      result.fullScreen = await canUseFullScreenIntent().catch(() => true);
      if (!result.fullScreen) {
        await new Promise((resolve) => {
          Alert.alert(
            'Chamada em tela cheia',
            'OBRIGATÓRIO: ative "Notificações em tela cheia" para o UbeZap, assim a corrida abre em TELA CHEIA mesmo com o celular bloqueado.',
            [
              { text: 'Depois', style: 'cancel', onPress: () => resolve() },
              {
                text: 'Ativar',
                onPress: async () => {
                  await openFullScreenIntentSettings().catch(() => {});
                  resolve();
                },
              },
            ],
            { cancelable: false }
          );
        });
      }
    }

    if (Platform.OS === 'android') {
      Alert.alert(
        'Bateria',
        'Para não perder corridas em segundo plano, desative a otimização de bateria do UbeZap nas configurações do celular.',
        [
          { text: 'Depois', style: 'cancel' },
          { text: 'Abrir configurações', onPress: () => Linking.openSettings().catch(() => {}) },
        ]
      );
    }

    flowCompleted = true;
    return result;
  } finally {
    flowInProgress = false;
  }
}

/**
 * Verifica se o motorista pode ficar online. CHECAGEM PURA — não re-exibe o
 * fluxo de permissões nem o aviso de bateria (que reaparecia a cada toque em
 * ONLINE). Se faltar permissão essencial, apenas solicita a faltante uma vez.
 */
export async function ensureDriverCanGoOnline() {
  const { status: fg } = await Location.getForegroundPermissionsAsync();
  let locationOk = fg === 'granted';
  if (!locationOk) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    locationOk = status === 'granted';
  }

  let notifOk = await ensureNotificationPermissions();

  // OBRIGATÓRIO (Android 14+): permissão de "notificações em tela cheia".
  // Sem ela, a corrida não abre em tela cheia (estilo ligação) com o celular
  // bloqueado. Bloqueia ficar online até ativar.
  let fullScreenOk = true;
  if (Platform.OS === 'android') {
    try {
      fullScreenOk = await canUseFullScreenIntent();
      if (!fullScreenOk) {
        await new Promise((resolve) => {
          Alert.alert(
            'Ative a chamada em tela cheia',
            'Obrigatório para você não perder corridas: ative "Notificações em tela cheia" para o UbeZap, assim o chamado abre em TELA CHEIA mesmo com o celular bloqueado.',
            [
              { text: 'Agora não', style: 'cancel', onPress: () => resolve() },
              {
                text: 'Ativar',
                onPress: async () => {
                  await openFullScreenIntentSettings().catch(() => {});
                  resolve();
                },
              },
            ],
            { cancelable: false }
          );
        });
        // Re-checa após o usuário voltar das configurações.
        fullScreenOk = await canUseFullScreenIntent().catch(() => false);
      }
    } catch (_) {
      fullScreenOk = true; // em erro, não trava o motorista
    }
  }

  return locationOk && notifOk && fullScreenOk;
}
