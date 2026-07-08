/**
 * FCM DIRETO (@react-native-firebase/messaging) para o alerta de corrida do
 * MOTORISTA — o único caminho que entrega com o app MORTO no Android.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cancelRideRequestNotification,
} from './rideNotification';
import { startRideAlertSound, stopRideAlertSound } from '../utils/rideAlertSound';
import { presentRideRequest } from './rideRequestController';
import driverRideMonitor from './driverRideMonitor';

const IS_EXPO_GO = Constants?.appOwnership === 'expo';
const FCM_SYNCED_KEY = '@UbeZap:lastFcmTokenSynced';
const FCM_MIN_RESEND_MS = 15 * 1000;
let lastServerSave = { token: null, at: 0 };
let lastFcmDiagnosticReport = null;
let fcmDiagnosticAttempts = [];

function resetFcmDiagnosticAttempts() {
  fcmDiagnosticAttempts = [];
}

function recordFcmAttempt(step, detail) {
  fcmDiagnosticAttempts.push({
    step,
    detail: String(detail || '(vazio)'),
    at: new Date().toISOString(),
  });
}

function describeFcmError(e) {
  if (!e) return '(sem detalhe)';
  const parts = [];
  if (e?.code) parts.push(`code=${e.code}`);
  if (e?.nativeErrorCode) parts.push(`nativeCode=${e.nativeErrorCode}`);
  if (e?.message) parts.push(`msg=${e.message}`);
  if (e?.nativeErrorMessage) parts.push(`nativeMsg=${e.nativeErrorMessage}`);
  if (e?.userInfo) {
    try {
      parts.push(`userInfo=${JSON.stringify(e.userInfo)}`);
    } catch (_) {
      parts.push('userInfo=(nao serializavel)');
    }
  }
  if (e?.response) {
    parts.push(`http=${e.response.status ?? '?'}`);
    try {
      const data = e.response.data;
      const body = typeof data === 'string' ? data : JSON.stringify(data);
      parts.push(`body=${body.slice(0, 500)}`);
    } catch (_) {
      parts.push('body=(nao serializavel)');
    }
  }
  if (e?.stack) {
    parts.push(`stack=${String(e.stack).replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  if (!parts.length) parts.push(String(e));
  return parts.join(' | ');
}

export function getLastFcmDiagnosticReport() {
  return lastFcmDiagnosticReport;
}

export function beginFcmDiagnosticSession() {
  resetFcmDiagnosticAttempts();
  lastFcmDiagnosticReport = null;
}

export function recordFcmAttemptForPushSync(step, detail) {
  recordFcmAttempt(step, detail);
}

export async function rebuildFcmDiagnosticReport(sessionId = null) {
  const base = await buildFcmDiagnosticBase(sessionId).catch((e) => ({
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
    package: '?',
    version: '?',
    versionCode: '?',
    motoristaId: sessionId ? String(sessionId) : '?',
    messagingAvailable: false,
    messagingLoadError: describeFcmError(e),
    notificationsGranted: false,
    notificationsDenied: false,
    canAskNotifAgain: true,
    firebaseProjectId: '?',
    firebaseAppId: '?',
    firebaseSenderId: '?',
    firebaseApiKeyPrefix: '?',
    expoGo: IS_EXPO_GO,
    executionEnvironment: '?',
    easProjectId: '?',
    googleServicesFile: '?',
    androidApi: '?',
    androidRelease: '?',
    deviceBrand: '?',
    deviceModel: '?',
    deviceManufacturer: '?',
  }));
  return finalizeFcmDiagnosticReport(base);
}

function readFirebaseAppInfo() {
  try {
    const firebase = require('@react-native-firebase/app').default;
    const app = typeof firebase?.app === 'function' ? firebase.app() : null;
    const opts = app?.options || {};
    return {
      firebaseProjectId: opts.projectId || '?',
      firebaseAppId: opts.appId || '?',
      firebaseSenderId: opts.messagingSenderId || '?',
      firebaseApiKeyPrefix: opts.apiKey ? `${String(opts.apiKey).slice(0, 12)}...` : '?',
    };
  } catch (e) {
    return {
      firebaseProjectId: '?',
      firebaseAppId: '?',
      firebaseSenderId: '?',
      firebaseApiKeyPrefix: '?',
      firebaseAppError: describeFcmError(e),
    };
  }
}

async function readMessagingRuntimeInfo(messagingFactory) {
  const info = {};
  if (!messagingFactory) return info;
  try {
    const messaging = messagingFactory();
    if (typeof messaging.hasPermission === 'function') {
      const perm = await messaging.hasPermission().catch((e) => ({ error: describeFcmError(e) }));
      info.messagingPermission = typeof perm === 'object' && perm?.error ? perm.error : String(perm);
    }
    if (typeof messaging.isDeviceRegisteredForRemoteMessages === 'function') {
      info.deviceRegisteredForRemote = await messaging
        .isDeviceRegisteredForRemoteMessages()
        .catch((e) => `erro: ${describeFcmError(e)}`);
    }
    if (typeof messaging.isAutoInitEnabled === 'function') {
      info.autoInitEnabled = messaging.isAutoInitEnabled();
    }
  } catch (e) {
    info.messagingRuntimeError = describeFcmError(e);
  }
  return info;
}

async function buildFcmDiagnosticBase(sessionId = null) {
  const { getNotificationPermissionState } = require('../utils/notifications');
  const perm = await getNotificationPermissionState().catch((e) => ({ error: describeFcmError(e) }));
  const messaging = getMessaging();
  let messagingAvailable = false;
  let messagingLoadError = null;

  if (messaging) {
    messagingAvailable = true;
  } else {
    try {
      require('@react-native-firebase/messaging');
      messagingLoadError = 'modulo carregou mas getMessaging retornou null';
    } catch (e) {
      messagingLoadError = describeFcmError(e);
    }
  }

  const android = Platform.OS === 'android' ? Platform.constants || {} : {};
  const firebase = readFirebaseAppInfo();
  const messagingRuntime = await readMessagingRuntimeInfo(messaging);

  return {
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
    androidApi: android.Version ?? '?',
    androidRelease: android.Release ?? '?',
    deviceBrand: android.Brand ?? '?',
    deviceModel: android.Model ?? '?',
    deviceManufacturer: android.Manufacturer ?? '?',
    package: Constants?.expoConfig?.android?.package || Constants?.manifest?.android?.package || '?',
    version: Constants?.expoConfig?.version || Constants?.nativeAppVersion || '?',
    versionCode: Constants?.expoConfig?.android?.versionCode ?? Constants?.nativeBuildVersion ?? '?',
    executionEnvironment: Constants.executionEnvironment || '?',
    expoGo: IS_EXPO_GO,
    easProjectId: Constants?.expoConfig?.extra?.eas?.projectId || '?',
    googleServicesFile: Constants?.expoConfig?.android?.googleServicesFile || '?',
    motoristaId: sessionId ? String(sessionId) : '?',
    messagingAvailable,
    messagingLoadError,
    notificationsGranted: !!perm.granted,
    notificationsDenied: !!perm.denied,
    canAskNotifAgain: perm.canAskAgain !== false,
    notificationPermRaw: perm.error ? perm.error : undefined,
    ...firebase,
    ...messagingRuntime,
  };
}

function formatFcmDiagnosticReport(base, attempts = []) {
  const lines = [
    '=== UbeZap FCM Diagnostico ===',
    `data: ${base.timestamp}`,
    `plataforma: ${base.platform} API ${base.androidApi} (${base.androidRelease})`,
    `aparelho: ${base.deviceBrand} ${base.deviceModel} (${base.deviceManufacturer})`,
    `pacote: ${base.package}`,
    `versao: ${base.version} (build ${base.versionCode})`,
    `ambiente: ${base.executionEnvironment} | expo_go: ${base.expoGo}`,
    `eas_project: ${base.easProjectId}`,
    `google_services: ${base.googleServicesFile}`,
    `motorista_id: ${base.motoristaId}`,
    `firebase_project: ${base.firebaseProjectId}`,
    `firebase_app_id: ${base.firebaseAppId}`,
    `firebase_sender: ${base.firebaseSenderId}`,
    `firebase_api_key: ${base.firebaseApiKeyPrefix}`,
  ];
  if (base.firebaseAppError) lines.push(`firebase_app_erro: ${base.firebaseAppError}`);
  lines.push(`firebase_messaging: ${base.messagingAvailable ? 'ok' : 'FALHOU'}`);
  if (base.messagingLoadError) lines.push(`erro_modulo: ${base.messagingLoadError}`);
  if (base.messagingPermission != null) lines.push(`messaging_permission: ${base.messagingPermission}`);
  if (base.deviceRegisteredForRemote != null) {
    lines.push(`device_registered_remote: ${base.deviceRegisteredForRemote}`);
  }
  if (base.autoInitEnabled != null) lines.push(`fcm_auto_init: ${base.autoInitEnabled}`);
  if (base.messagingRuntimeError) lines.push(`messaging_runtime_erro: ${base.messagingRuntimeError}`);
  lines.push(
    `notificacao: ${
      base.notificationsGranted ? 'permitida' : base.notificationsDenied ? 'negada' : 'nao definida'
    } | pode_pedir_de_novo: ${base.canAskNotifAgain ? 'sim' : 'nao'}`
  );
  if (base.notificationPermRaw) lines.push(`notificacao_erro: ${base.notificationPermRaw}`);

  const allAttempts = attempts.length ? attempts : fcmDiagnosticAttempts;
  if (allAttempts.length) {
    lines.push('', 'tentativas:');
    allAttempts.forEach((a, i) => {
      const when = a.at ? ` @ ${a.at}` : '';
      lines.push(`  ${i + 1}. [${a.step}]${when} ${a.detail}`);
    });
  } else {
    lines.push('', 'tentativas: (nenhuma registrada)');
  }

  lines.push('=== fim ===');

  const report = lines.join('\n');
  if (/FIS_AUTH_ERROR/i.test(report)) {
    return `${report}\n\nDICA: FIS_AUTH_ERROR = Firebase nao autenticou o app. Verifique no Google Cloud (projeto ubezap-a6bb4): API Firebase Installations habilitada + API key sem restricao errada. Baixe google-services.json NOVO do app motorista apos o SHA-1.`;
  }
  return report;
}

function finalizeFcmDiagnosticReport(base, attempts = fcmDiagnosticAttempts) {
  lastFcmDiagnosticReport = formatFcmDiagnosticReport(base, attempts);
  return lastFcmDiagnosticReport;
}

function getMessaging() {
  if (Platform.OS === 'web' || IS_EXPO_GO) return null;
  try {
    return require('@react-native-firebase/messaging').default;
  } catch (_) {
    return null;
  }
}

function buildRawRide(d) {
  const id = d?.rideId || d?.id;
  if (!id) return null;
  return {
    id,
    taxa: d.taxa,
    endereco_ini_txt: d.endereco_ini_txt,
    endereco_fim_txt: d.endereco_fim_txt,
    nome_cliente: d.nome_cliente,
    nota_cliente: d.nota_cliente,
    km: d.km,
    tempo: d.tempo,
    f_pagamento: d.f_pagamento,
    cidade_id: d.cidade_id,
    categoria_id: d.categoria_id,
  };
}

export async function handleFcmRideAlert(data) {
  try {
    if (!data || data.type !== 'ride_alert') return;

    const rideId = data.rideId || data.id;
    const event = data.event;

    if (event === 'ride_unavailable' || event === 'passenger_cancelled') {
      if (rideId) await cancelRideRequestNotification(rideId).catch(() => {});
      await stopRideAlertSound().catch(() => {});
      return;
    }

    const raw = buildRawRide(data);
    if (!raw) return;

    const { notifyDriverNewRide } = require('./rideBackgroundAlert');
    await notifyDriverNewRide(raw);
  } catch (e) {
    console.warn('[fcmDirect] handle:', e?.message);
  }
}

export async function handleFcmRideAlertForeground(data) {
  try {
    if (!data || data.type !== 'ride_alert') return;
    const event = data.event;
    if (event === 'ride_unavailable' || event === 'passenger_cancelled') {
      await stopRideAlertSound().catch(() => {});
      return;
    }
    const raw = buildRawRide(data);
    if (!raw) return;
    if (driverRideMonitor.isRideBlocked?.(raw.id)) return;
    if (driverRideMonitor.config?.isOnRide) return;

    // App aberto: modal interno + som em loop (sem banner Notifee duplicado).
    await presentRideRequest(raw).catch(() => {});
    await startRideAlertSound().catch(() => {});
  } catch (e) {
    console.warn('[fcmDirect] foreground:', e?.message);
  }
}

let fgUnsub = null;

export function registerFcmForegroundHandler() {
  const messaging = getMessaging();
  if (!messaging || fgUnsub) return () => {};
  try {
    fgUnsub = messaging().onMessage(async (remoteMessage) => {
      await handleFcmRideAlertForeground(remoteMessage?.data);
    });
  } catch (e) {
    console.warn('[fcmDirect] onMessage:', e?.message);
  }
  return () => { try { fgUnsub && fgUnsub(); } catch (_) {} fgUnsub = null; };
}

async function persistFcmTokenOnServer(sessionId, token, { force = false } = {}) {
  const now = Date.now();
  if (
    !force &&
    token === lastServerSave.token &&
    (now - lastServerSave.at) < FCM_MIN_RESEND_MS
  ) {
    return token;
  }
  const api = require('./api').default;
  try {
    const res = await api.driver.saveFcmToken(sessionId, token);
    const body = res?.data;
    recordFcmAttempt('salvar_servidor', `ok status=${body?.status ?? JSON.stringify(body)}`);
    await AsyncStorage.setItem(FCM_SYNCED_KEY, token);
    lastServerSave = { token, at: now };
    console.log('[FCM] token salvo no servidor:', token.substring(0, 24) + '...');
    return token;
  } catch (e) {
    recordFcmAttempt('salvar_servidor', describeFcmError(e));
    throw e;
  }
}

async function fetchFreshFcmToken(messaging) {
  if (Platform.OS === 'android') {
    const { ensureNotificationPermissions } = require('../utils/notifications');
    const granted = await ensureNotificationPermissions().catch((e) => {
      recordFcmAttempt('permissao_runtime', describeFcmError(e));
      return false;
    });
    if (!granted) {
      recordFcmAttempt('permissao_runtime', 'ensureNotificationPermissions retornou false');
      return null;
    }
  } else {
    const perm = await messaging().requestPermission().catch((e) => {
      recordFcmAttempt('permissao_runtime', describeFcmError(e));
      return null;
    });
    if (perm != null) recordFcmAttempt('permissao_runtime', `ios_permission=${String(perm)}`);
  }
  return messaging().getToken();
}

/**
 * Obtém token FCM do aparelho e grava no servidor.
 * force=true: sempre reenvia (heartbeat). Se falhar, tenta deleteToken + getToken.
 */
export async function getAndSaveFcmToken(sessionId, { force = false, resetDiagnostics = false } = {}) {
  if (resetDiagnostics) beginFcmDiagnosticSession();

  const base = await buildFcmDiagnosticBase(sessionId).catch((e) => ({
    timestamp: new Date().toISOString(),
    platform: Platform.OS,
    androidApi: '?',
    androidRelease: '?',
    deviceBrand: '?',
    deviceModel: '?',
    deviceManufacturer: '?',
    package: '?',
    version: '?',
    versionCode: '?',
    executionEnvironment: '?',
    expoGo: IS_EXPO_GO,
    easProjectId: '?',
    googleServicesFile: '?',
    motoristaId: sessionId ? String(sessionId) : '?',
    messagingAvailable: false,
    messagingLoadError: `falha ao coletar diagnostico: ${describeFcmError(e)}`,
    notificationsGranted: false,
    notificationsDenied: false,
    canAskNotifAgain: true,
    firebaseProjectId: '?',
    firebaseAppId: '?',
    firebaseSenderId: '?',
    firebaseApiKeyPrefix: '?',
  }));

  const messaging = getMessaging();
  if (!messaging || !sessionId) {
    if (!sessionId) recordFcmAttempt('sessao', 'sessionId ausente');
    if (!messaging) {
      recordFcmAttempt('modulo', base.messagingLoadError || 'Firebase Messaging indisponivel');
    }
    finalizeFcmDiagnosticReport(base);
    return null;
  }

  try {
    if (!base.notificationsGranted) {
      recordFcmAttempt('permissao', 'notificacoes nao concedidas antes do getToken');
    }
    let token = await fetchFreshFcmToken(messaging);
    if (token) {
      recordFcmAttempt('getToken', `ok prefixo=${token.substring(0, 24)}...`);
      try {
        await persistFcmTokenOnServer(sessionId, token, { force });
        lastFcmDiagnosticReport = null;
        return token;
      } catch (e) {
        finalizeFcmDiagnosticReport(base);
        throw e;
      }
    }
    recordFcmAttempt('getToken', 'retornou vazio (sem excecao)');
  } catch (e) {
    recordFcmAttempt('getToken', describeFcmError(e));
    console.warn('[fcmDirect] getToken:', describeFcmError(e));
  }

  try {
    await messaging().deleteToken();
    recordFcmAttempt('deleteToken', 'ok');
    const fresh = await fetchFreshFcmToken(messaging);
    if (fresh) {
      recordFcmAttempt('deleteToken+getToken', `ok prefixo=${fresh.substring(0, 24)}...`);
      try {
        await persistFcmTokenOnServer(sessionId, fresh, { force: true });
        lastFcmDiagnosticReport = null;
        return fresh;
      } catch (e) {
        finalizeFcmDiagnosticReport(base);
        throw e;
      }
    }
    recordFcmAttempt('deleteToken+getToken', 'retornou vazio (sem excecao)');
  } catch (e) {
    recordFcmAttempt('deleteToken+getToken', describeFcmError(e));
    console.warn('[fcmDirect] deleteToken/getToken:', describeFcmError(e));
  }

  finalizeFcmDiagnosticReport(base);
  return null;
}

let tokenRefreshUnsub = null;

export function registerFcmTokenRefreshHandler(sessionId) {
  const messaging = getMessaging();
  if (!messaging || !sessionId || tokenRefreshUnsub) return () => {};
  try {
    tokenRefreshUnsub = messaging().onTokenRefresh(async (token) => {
      if (!token) return;
      try {
        await persistFcmTokenOnServer(sessionId, token, { force: true });
      } catch (e) {
        console.warn('[fcmDirect] onTokenRefresh:', e?.message);
      }
    });
  } catch (e) {
    console.warn('[fcmDirect] onTokenRefresh register:', e?.message);
  }
  return () => {
    try { tokenRefreshUnsub && tokenRefreshUnsub(); } catch (_) {}
    tokenRefreshUnsub = null;
  };
}
