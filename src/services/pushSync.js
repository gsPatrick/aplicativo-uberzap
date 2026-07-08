import { AppState } from 'react-native';
import { CONFIG } from '../config';
import {
  registerForPushNotificationsAsync,
  getStoredPushToken,
} from '../utils/notifications';
import { getSession } from '../utils/session';
import api from '../services/api';
import { getAndSaveFcmToken } from './fcmDirect';

let lastSync = { token: null, at: 0 };
const EXPO_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Passageiro (e legado): Expo Push Token em id_signal. */
export async function syncPushTokenWithServer({ force = false } = {}) {
  try {
    const session = await getSession();
    if (!session) return null;

    let token = await getStoredPushToken();
    if (!token) {
      token = await registerForPushNotificationsAsync();
    }
    if (!token) return null;

    const now = Date.now();
    if (!force && token === lastSync.token && (now - lastSync.at) < EXPO_SYNC_MIN_INTERVAL_MS) {
      return token;
    }

    if (CONFIG.APP_BUILD === 'driver' && session.id) {
      await api.driver.savePushToken(session.id, token);
    } else if (session.telefone && session.senha) {
      await api.passenger.savePushToken(session.telefone, session.senha, token);
    }

    lastSync = { token, at: now };
    return token;
  } catch (e) {
    console.warn('[PushSync] Falha ao sincronizar token Expo:', e);
    return null;
  }
}

/**
 * Motorista: sincroniza SOMENTE o token FCM nativo (fcm_token).
 * Heartbeat a cada 60s enquanto logado — garante token sempre no servidor.
 */
export async function syncDriverFcmToken({ force = false } = {}) {
  try {
    if (CONFIG.APP_BUILD !== 'driver') return null;
    const session = await getSession();
    if (!session?.id) return null;
    const token = await getAndSaveFcmToken(session.id, { force });
    if (token) {
      console.log('[PushSync] FCM ok:', token.substring(0, 24) + '...');
    }
    return token;
  } catch (e) {
    console.warn('[PushSync] Falha ao sincronizar FCM:', e);
    return null;
  }
}

/** @deprecated use syncDriverFcmToken — mantido p/ compatibilidade de imports. */
export async function syncDriverPushTokens({ force = false } = {}) {
  const fcm = await syncDriverFcmToken({ force });
  return { expo: null, fcm };
}

const FCM_HEARTBEAT_MS = 60 * 1000;
let heartbeatTimer = null;
let heartbeatAppStateSub = null;

/** Mantém fcm_token fresco no servidor enquanto o motorista está logado. */
export function startDriverFcmHeartbeat() {
  stopDriverFcmHeartbeat();

  syncDriverFcmToken({ force: true }).catch(() => {});

  heartbeatTimer = setInterval(() => {
    syncDriverFcmToken({ force: true }).catch(() => {});
  }, FCM_HEARTBEAT_MS);

  heartbeatAppStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      syncDriverFcmToken({ force: true }).catch(() => {});
    }
  });

  return stopDriverFcmHeartbeat;
}

export function stopDriverFcmHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatAppStateSub) {
    heartbeatAppStateSub.remove();
    heartbeatAppStateSub = null;
  }
}

/** GPS retornou sem_fcm_token — tenta registrar de novo antes de desistir. */
export async function recoverDriverFcmFromApiError(error) {
  const codigo = error?.response?.data?.codigo || '';
  if (codigo !== 'sem_fcm_token' && codigo !== 'sem_token_push') return null;
  return syncDriverFcmToken({ force: true });
}
