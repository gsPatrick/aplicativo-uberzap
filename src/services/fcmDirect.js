/**
 * FCM DIRETO (@react-native-firebase/messaging) para o alerta de corrida do
 * MOTORISTA — o único caminho que entrega com o app MORTO no Android.
 *
 * O servidor envia FCM v1 data-only (high priority). O setBackgroundMessageHandler
 * (registrado em index.js) roda mesmo com o app fechado e chama handleFcmRideAlert,
 * que desenha o card full-screen (Notifee) + acorda a tela + toca o som.
 *
 * messaging é carregado de forma "lazy" (require dentro das funções) para não
 * quebrar onde o módulo nativo não existe (ex.: Expo Go).
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

/**
 * Processa o data do push FCM de corrida. Chamado pelo background handler
 * (app morto, em index.js) E pelo onMessage (app em foreground).
 */
export async function handleFcmRideAlert(data) {
  try {
    if (!data || data.type !== 'ride_alert') return;

    const rideId = data.rideId || data.id;
    const event = data.event;

    // Corrida aceita por outro / cancelada -> remove o card e para o som.
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

    // Card full-screen (Notifee, Aceitar/Recusar) — funciona com app morto.
    await showRideRequestNotification(ride).catch(() => {});
    // Acorda a tela + toque em loop.
    await wakeScreenForRideAlert().catch(() => {});
    await startRideAlertSound().catch(() => {});
  } catch (e) {
    console.warn('[fcmDirect] handle:', e?.message);
  }
}

/**
 * Caminho com o app ABERTO (foreground): mostra SÓ o card interno do app
 * (modal RideRequestScreen) — NÃO dispara o overlay full-screen do sistema
 * (Notifee), que seria redundante/duplicado por cima do próprio app.
 */
export async function handleFcmRideAlertForeground(data) {
  try {
    if (!data || data.type !== 'ride_alert') return;
    const event = data.event;
    if (event === 'ride_unavailable' || event === 'passenger_cancelled') {
      await stopRideAlertSound().catch(() => {});
      return; // o modal interno some sozinho (monitor/polling)
    }
    const raw = buildRawRide(data);
    if (!raw) return;
    if (driverRideMonitor.isRideBlocked?.(raw.id)) return;
    if (driverRideMonitor.config?.isOnRide) return;
    // Apresenta o modal interno (com dedup) — sem notificação de sistema.
    await presentRideRequest(raw).catch(() => {});
    await startRideAlertSound().catch(() => {});
  } catch (e) {
    console.warn('[fcmDirect] foreground:', e?.message);
  }
}

let fgUnsub = null;

/** Registra o handler de foreground (app aberto). Idempotente. */
export function registerFcmForegroundHandler() {
  const messaging = getMessaging();
  if (!messaging || fgUnsub) return () => {};
  try {
    // onMessage SÓ dispara com o app em foreground -> usa o card interno.
    fgUnsub = messaging().onMessage(async (remoteMessage) => {
      await handleFcmRideAlertForeground(remoteMessage?.data);
    });
  } catch (e) {
    console.warn('[fcmDirect] onMessage:', e?.message);
  }
  return () => { try { fgUnsub && fgUnsub(); } catch (_) {} fgUnsub = null; };
}

/** Pega o token FCM nativo e salva no servidor (motorista). */
export async function getAndSaveFcmToken(sessionId) {
  const messaging = getMessaging();
  if (!messaging || !sessionId) return null;
  try {
    await messaging().requestPermission().catch(() => {});
    const token = await messaging().getToken();
    if (token) {
      const api = require('./api').default;
      await api.driver.saveFcmToken(sessionId, token);
    }
    return token;
  } catch (e) {
    console.warn('[fcmDirect] getToken:', e?.message);
    return null;
  }
}
