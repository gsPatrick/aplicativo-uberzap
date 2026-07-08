import { Platform } from 'react-native';
import Constants from 'expo-constants';

const IS_EXPO_GO = Constants?.appOwnership === 'expo';

let notifeeModule = null;
let channelReady = false;

async function getNotifee() {
  if (Platform.OS !== 'android' || IS_EXPO_GO) return null;
  if (notifeeModule) return notifeeModule;
  try {
    notifeeModule = require('@notifee/react-native').default;
    return notifeeModule;
  } catch (e) {
    console.warn('[rideNotification] Notifee indisponível:', e?.message);
    return null;
  }
}

// v4: canal MAX + heads-up (banner desce) + som customizado em res/raw.
// Bumpar o id força o Android a criar um canal novo (canais são imutáveis).
export const RIDE_REQUEST_CHANNEL_ID = 'ride-requests-v4';
// Nome do som em android/app/src/main/res/raw (sem extensão).
const RIDE_ALERT_SOUND = 'toque_status';
export const RIDE_REQUEST_TIMEOUT_MS = 30000;

/** @typedef {import('./rideRequestController').RideRequest} RideRequest */

export function mapApiRideToRideRequest(raw) {
  if (!raw?.id) return null;

  const paymentRaw = String(raw.f_pagamento || raw.forma_pagamento || '').toLowerCase();
  let paymentMethod = 'dinheiro';
  if (paymentRaw.includes('pix')) paymentMethod = 'pix';
  else if (paymentRaw.includes('cart') || paymentRaw.includes('crédito') || paymentRaw.includes('credito')) {
    paymentMethod = 'cartao';
  }

  const price = parseFloat(String(raw.taxa || '0').replace(',', '.')) || 0;
  const km = parseFloat(String(raw.km || raw.distancia || '0').replace(',', '.')) || 0;
  const tempo = parseInt(String(raw.tempo || raw.tempo_estimado || '0'), 10) || 0;

  return {
    rideId: String(raw.id),
    rawRide: raw,
    passengerName: raw.nome_cliente || raw.cliente || 'Passageiro',
    passengerRating: parseFloat(raw.nota_cliente || raw.rating || '5') || 5,
    pickupAddress: raw.endereco_ini_txt || raw.endereco_ini || 'Embarque',
    dropoffAddress: raw.endereco_fim_txt || raw.endereco_fim || 'Destino',
    distanceKm: km,
    estimatedMinutes: tempo > 0 ? tempo : Math.max(1, Math.round(km * 3)),
    price,
    paymentMethod,
    cidadeId: raw.cidade_id || null,
  };
}

export async function setupRideNotificationChannel() {
  if (channelReady) return;
  const notifee = await getNotifee();
  if (!notifee) return;

  const { AndroidImportance, AndroidVisibility } = require('@notifee/react-native');

  await notifee.createChannel({
    id: RIDE_REQUEST_CHANNEL_ID,
    name: 'Solicitações de Corrida',
    importance: AndroidImportance.MAX,
    visibility: AndroidVisibility.PUBLIC,
    sound: RIDE_ALERT_SOUND,
    vibration: true,
    vibrationPattern: [300, 500, 300, 500, 300, 500],
    lights: true,
    lightColor: '#3AB56B',
    bypassDnd: true,
  });
  channelReady = true;
}

export async function requestRideNotificationPermission() {
  let granted = false;

  try {
    const { ensureNotificationPermissions } = require('../utils/notifications');
    granted = await ensureNotificationPermissions();
  } catch {
    // expo-notifications indisponível
  }

  const notifee = await getNotifee();
  if (!notifee) return granted;

  try {
    const settings = await notifee.requestPermission();
    return granted || settings?.authorizationStatus >= 1;
  } catch {
    return granted;
  }
}

export async function showRideRequestNotification(ride) {
  const notifee = await getNotifee();
  if (!notifee || !ride?.rideId) return false;

  const {
    AndroidImportance,
    AndroidVisibility,
    AndroidCategory,
    AndroidStyle,
    AndroidForegroundServiceType,
  } = require('@notifee/react-native');

  await setupRideNotificationChannel();

  const pickup = String(ride.pickupAddress || '').split('(')[0].trim();
  const dest = String(ride.dropoffAddress || '').split('(')[0].trim();
  const priceTxt = `R$ ${Number(ride.price || 0).toFixed(2).replace('.', ',')}`;
  const payMap = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  const payTxt = payMap[ride.paymentMethod] || 'Dinheiro';
  const ratingTxt = ride.passengerRating ? `⭐ ${Number(ride.passengerRating).toFixed(1)}` : '';
  const kmTxt = ride.distanceKm ? `${Number(ride.distanceKm).toFixed(1).replace('.', ',')} km` : '';
  const minTxt = ride.estimatedMinutes ? `~${ride.estimatedMinutes} min` : '';
  // Texto expandido (BigText) — mostra TODAS as infos da corrida no card.
  const bigText =
    `💰 ${priceTxt}  •  ${payTxt}\n` +
    `👤 ${ride.passengerName || 'Passageiro'} ${ratingTxt}\n` +
    `📍 Embarque: ${pickup}\n` +
    `🏁 Destino: ${dest}` +
    (kmTxt || minTxt ? `\n📏 ${[kmTxt, minTxt].filter(Boolean).join('  •  ')}` : '');

  const compactPayload = JSON.stringify({
    rideId: ride.rideId,
    passengerName: ride.passengerName,
    passengerRating: ride.passengerRating,
    pickupAddress: ride.pickupAddress,
    dropoffAddress: ride.dropoffAddress,
    distanceKm: ride.distanceKm,
    estimatedMinutes: ride.estimatedMinutes,
    price: ride.price,
    paymentMethod: ride.paymentMethod,
    cidadeId: ride.cidadeId,
  });

  let canFullScreen = false;
  try {
    if (typeof notifee.canUseFullScreenIntent === 'function') {
      canFullScreen = await notifee.canUseFullScreenIntent();
    }
  } catch (_) {
    canFullScreen = false;
  }

  const androidConfig = {
    channelId: RIDE_REQUEST_CHANNEL_ID,
    // MAX = heads-up (banner desce de cima) em qualquer fabricante compatível.
    importance: AndroidImportance.MAX,
    visibility: AndroidVisibility.PUBLIC,
    category: AndroidCategory.CALL,
    sound: RIDE_ALERT_SOUND,
    style: { type: AndroidStyle.BIGTEXT, text: bigText },
    vibrationPattern: [300, 500, 300, 500, 300, 500],
    lightUpScreen: true,
    color: '#3AB56B',
    // Mantém o processo vivo + som em loop até aceitar/recusar (Motorola/Samsung).
    asForegroundService: true,
    foregroundServiceTypes: [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK],
    pressAction: { id: 'default', launchActivity: 'default' },
    actions: [
      {
        title: 'Aceitar',
        pressAction: { id: 'accept', launchActivity: 'default' },
      },
      {
        title: 'Recusar',
        pressAction: { id: 'decline' },
      },
    ],
    timeoutAfter: RIDE_REQUEST_TIMEOUT_MS + 5000,
    autoCancel: false,
    ongoing: true,
    // Som do sistema em loop até cancelar a notificação (complementa o FG service).
    loopSound: true,
  };

  // Tela cheia só com permissão + tela bloqueada — não atrasa o banner no topo.
  if (canFullScreen) {
    androidConfig.fullScreenAction = {
      id: 'ride_screen',
      launchActivity: 'default',
    };
  }

  try {
    await notifee.displayNotification({
      id: `ride-${ride.rideId}`,
      title: `🚕 Nova corrida — ${priceTxt}`,
      body: `${ride.passengerName || 'Passageiro'} • ${pickup} → ${dest}`,
      data: {
        type: 'ride_request',
        ride: compactPayload,
        rideId: ride.rideId,
      },
      android: androidConfig,
    });
    return true;
  } catch (e) {
    console.warn('[rideNotification] displayNotification:', e?.message || e);
    return false;
  }
}

export async function cancelRideRequestNotification(rideId) {
  const notifee = await getNotifee();
  if (!notifee || !rideId) return;
  try {
    await notifee.cancelNotification(`ride-${rideId}`);
  } catch (e) {
    console.warn('[rideNotification] cancel:', e?.message);
  }
}

export async function cancelAllRideRequestNotifications() {
  const notifee = await getNotifee();
  if (!notifee) return;
  try {
    await notifee.cancelAllNotifications();
  } catch (e) {
    console.warn('[rideNotification] cancelAll:', e?.message);
  }
}

export function listenToRideNotificationActions(callbacks) {
  let unsubscribe = () => {};

  (async () => {
    const notifee = await getNotifee();
    if (!notifee) return;

    const { EventType } = require('@notifee/react-native');

    unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      handleNotifeeEvent(type, detail, EventType, callbacks);
    });
  })();

  return () => unsubscribe();
}

export function parseRideFromNotificationDetail(detail) {
  try {
    const raw = detail?.notification?.data?.ride;
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export function handleNotifeeEvent(type, detail, EventType, callbacks) {
  const ride = parseRideFromNotificationDetail(detail);
  if (!ride?.rideId) return;

  if (type === EventType.ACTION_PRESS) {
    const action = detail.pressAction?.id;
    if (action === 'accept') callbacks.onAccept?.(ride);
    if (action === 'decline') callbacks.onDecline?.(ride);
  }

  if (type === EventType.PRESS || type === EventType.DELIVERED) {
    callbacks.onOpen?.(ride);
  }

  if (type === EventType.DISMISSED) {
    callbacks.onDismiss?.(ride);
  }
}

export async function getInitialRideNotification() {
  const notifee = await getNotifee();
  if (!notifee) return null;
  try {
    const initial = await notifee.getInitialNotification();
    if (!initial) return null;
    return parseRideFromNotificationDetail(initial);
  } catch {
    return null;
  }
}
