import { AppState, Alert } from 'react-native';
import { CONFIG } from '../config';
import {
  registerForPushNotificationsAsync,
  getStoredPushToken,
  ensureNotificationPermissions,
  getNotificationPermissionState,
  openAppNotificationSettings,
} from '../utils/notifications';
import { getSession } from '../utils/session';
import api from '../services/api';
import { getAndSaveFcmToken, beginFcmDiagnosticSession, recordFcmAttemptForPushSync, rebuildFcmDiagnosticReport } from './fcmDirect';

let lastSync = { token: null, at: 0 };
const EXPO_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * Obrigatório antes de ficar online: obtém token FCM do aparelho e grava no servidor.
 * Repete tentativas e abre configurações se notificação estiver bloqueada.
 */
export async function ensureDriverFcmTokenForOnline({ maxAttempts = 5 } = {}) {
  if (CONFIG.APP_BUILD !== 'driver') return null;

  beginFcmDiagnosticSession();

  const session = await getSession();
  if (!session?.id) {
    recordFcmAttemptForPushSync('sessao', 'Sessao invalida — faca login novamente');
    const err = new Error('Sessão inválida. Faça login novamente.');
    err.fcmDiagnosticReport = await rebuildFcmDiagnosticReport();
    throw err;
  }

  let notifOk = await ensureNotificationPermissions();
  if (!notifOk) {
    const perm = await getNotificationPermissionState().catch(() => ({}));
    recordFcmAttemptForPushSync(
      'permissao',
      `negada | denied=${!!perm.denied} | canAskAgain=${perm.canAskAgain !== false}`
    );
    if (perm.denied && perm.canAskAgain === false) {
      await new Promise((resolve) => {
        Alert.alert(
          'Notificações obrigatórias',
          'Para ficar online e receber corridas, ative as notificações do UbeZap nas configurações do celular.',
          [
            { text: 'Cancelar', style: 'cancel', onPress: resolve },
            {
              text: 'Abrir configurações',
              onPress: async () => {
                await openAppNotificationSettings().catch(() => {});
                resolve();
              },
            },
          ]
        );
      });
      notifOk = await ensureNotificationPermissions();
    } else {
      notifOk = await ensureNotificationPermissions();
    }
  }

  if (!notifOk) {
    recordFcmAttemptForPushSync('permissao', 'usuario nao concedeu notificacoes');
    const err = new Error('Permita notificações para ficar online e receber corridas.');
    err.fcmDiagnosticReport = await rebuildFcmDiagnosticReport(session.id);
    throw err;
  }

  recordFcmAttemptForPushSync('permissao', 'ok');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    recordFcmAttemptForPushSync('ciclo_online', `tentativa ${attempt}/${maxAttempts}`);
    const token = await getAndSaveFcmToken(session.id, { force: true });
    if (token) return token;
    await delay(600 * attempt);
  }

  const err = new Error(
    'Não foi possível registrar o token de push. Verifique notificações e tente ficar online de novo.'
  );
  err.fcmDiagnosticReport = await rebuildFcmDiagnosticReport(session.id);
  throw err;
}

export async function registerDriverOnlineOnServer(
  sessionId,
  latitude,
  longitude,
  { maxAttempts = 4 } = {}
) {
  await ensureDriverFcmTokenForOnline();

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await api.driver.updateLocation(sessionId, 1, latitude, longitude);
      const body = res?.data;
      if (body?.status === 'ok' || body === 'ok') {
        return res;
      }
      const codigo = body?.codigo || '';
      recordFcmAttemptForPushSync(
        'servidor_online',
        `tentativa ${attempt}/${maxAttempts} | codigo=${codigo || 'sem_codigo'} | body=${JSON.stringify(body).slice(0, 500)}`
      );
      if (codigo === 'sem_fcm_token' || codigo === 'sem_token_push') {
        await getAndSaveFcmToken(sessionId, { force: true });
        await delay(400 * attempt);
        continue;
      }
      lastError = new Error(body?.mensagem || 'Não foi possível ficar online.');
      lastError.response = { data: body, status: res?.status };
    } catch (e) {
      lastError = e;
      const codigo = e?.response?.data?.codigo || '';
      recordFcmAttemptForPushSync(
        'servidor_online',
        `tentativa ${attempt}/${maxAttempts} | erro=${codigo || e?.message || 'desconhecido'}`
      );
      if (e?.response?.status === 403 || codigo === 'sem_fcm_token' || codigo === 'sem_token_push') {
        await getAndSaveFcmToken(sessionId, { force: true });
        await delay(400 * attempt);
        continue;
      }
      e.fcmDiagnosticReport = await rebuildFcmDiagnosticReport(sessionId);
      throw e;
    }
  }

  const err = lastError || new Error('Não foi possível ficar online. Tente novamente.');
  err.fcmDiagnosticReport = await rebuildFcmDiagnosticReport(sessionId);
  throw err;
}
