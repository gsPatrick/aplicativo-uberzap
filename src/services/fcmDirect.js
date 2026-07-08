/**
 * FCM DIRETO (@react-native-firebase/messaging) para o alerta de corrida do
 * MOTORISTA — o único caminho que entrega com o app MORTO no Android.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  mapApiRideToRideRequest,
  showRideRequestNotification,
  cancelRideRequestNotification,
} from './rideNotification';
import { startRideAlertSound, stopRideAlertSound } from '../utils/rideAlertSound';
import { wakeScreenForRideAlert } from '../utils/androidOverlay';
import { STORAGE_KEYS as RIDE_STORAGE_KEYS, presentRideRequest } from './rideRequestController';
import driverRideMonitor from './driverRideMonitor';

const IS_EXPO_GO = Constants?.appOwnership === 'expo';
const FCM_SYNCED_KEY = '@UbeZap:lastFcmTokenSynced';
const FCM_MIN_RESEND_MS = 15 * 1000;
let lastServerSave = { token: null, at: 0 };

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
    if (driverRideMonitor.isRideBlocked?.(raw.id)) return;
    if (driverRideMonitor.config?.isOnRide) return;

    const ride = mapApiRideToRideRequest(raw);
    if (!ride) return;

    try { await driverRideMonitor.setPendingRide(raw); } catch (_) {}
    try {
      const { rawRide: _drop, ...compact } = ride;
      await AsyncStorage.setItem(RIDE_STORAGE_KEYS.PENDING_SHOW, JSON.stringify(compact));
    } catch (_) {}

    await showRideRequestNotification(ride).catch(() => {});
    await wakeScreenForRideAlert().catch(() => {});
    await startRideAlertSound().catch(() => {});
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
  await api.driver.saveFcmToken(sessionId, token);
  await AsyncStorage.setItem(FCM_SYNCED_KEY, token);
  lastServerSave = { token, at: now };
  console.log('[FCM] token salvo no servidor:', token.substring(0, 24) + '...');
  return token;
}

async function fetchFreshFcmToken(messaging) {
  if (Platform.OS === 'android') {
    const { ensureNotificationPermissions } = require('../utils/notifications');
    const granted = await ensureNotificationPermissions().catch(() => false);
    if (!granted) return null;
  } else {
    await messaging().requestPermission().catch(() => {});
  }
  return messaging().getToken();
}

/**
 * Obtém token FCM do aparelho e grava no servidor.
 * force=true: sempre reenvia (heartbeat). Se falhar, tenta deleteToken + getToken.
 */
export async function getAndSaveFcmToken(sessionId, { force = false } = {}) {
  const messaging = getMessaging();
  if (!messaging || !sessionId) return null;

  try {
    let token = await fetchFreshFcmToken(messaging);
    if (token) {
      await persistFcmTokenOnServer(sessionId, token, { force });
      return token;
    }
  } catch (e) {
    console.warn('[fcmDirect] getToken:', e?.message);
  }

  try {
    await messaging().deleteToken();
    const fresh = await fetchFreshFcmToken(messaging);
    if (fresh) {
      await persistFcmTokenOnServer(sessionId, fresh, { force: true });
      return fresh;
    }
  } catch (e) {
    console.warn('[fcmDirect] deleteToken/getToken:', e?.message);
  }

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
