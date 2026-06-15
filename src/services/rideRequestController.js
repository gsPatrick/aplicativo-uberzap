import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import driverRideMonitor from './driverRideMonitor';
import { saveSession, getSession } from '../utils/session';
import { buildTaximeterRide } from '../utils/driverRideUtils';
import { stopRideAlertSound } from '../utils/rideAlertSound';
import { triggerRideAlertNotification, cancelRideAlertNotification } from '../utils/notifications';
import { wakeScreenForRideAlert } from '../utils/androidOverlay';
import {
  mapApiRideToRideRequest,
  showRideRequestNotification,
  cancelRideRequestNotification,
  cancelAllRideRequestNotifications,
} from './rideNotification';
const IS_EXPO_GO = Constants?.appOwnership === 'expo';

export const STORAGE_KEYS = {
  PENDING_ACCEPT: '@UbeZap:pendingAcceptedRide',
  PENDING_SHOW: '@UbeZap:pendingShowRideRequest',
};

const listeners = new Set();
let activeRide = null;

function emit(event, payload) {
  listeners.forEach((cb) => {
    try {
      cb(event, payload);
    } catch (e) {
      console.warn('[rideRequestController]', e);
    }
  });
}

export function subscribeRideRequest(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getActiveRideRequest() {
  return activeRide;
}

function normalizeApiOk(data) {
  if (data === 'ok' || data === true) return true;
  if (typeof data === 'string') return data.trim().toLowerCase() === 'ok';
  return false;
}

async function clearRidePendingStorage() {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.PENDING_ACCEPT,
    STORAGE_KEYS.PENDING_SHOW,
  ]).catch(() => {});
}

export async function presentRideRequest(rawRide) {
  const ride =
    rawRide?.rideId && (rawRide?.pickupAddress || rawRide?.passengerName)
      ? rawRide
      : mapApiRideToRideRequest(rawRide);
  if (!ride) return null;

  if (driverRideMonitor.isRideBlocked(ride.rideId)) {
    return ride;
  }

  if (activeRide?.rideId === String(ride.rideId)) {
    return ride;
  }

  activeRide = ride;
  const apiRide = ride.rawRide || rawRide;
  if (apiRide?.id) {
    await driverRideMonitor.setPendingRide(apiRide);
  }
  driverRideMonitor.markRideHandled(ride.rideId);

  const appInBackground = AppState.currentState !== 'active';

  if (appInBackground) {
    let notifeeDelivered = false;
    if (Platform.OS === 'android' && !IS_EXPO_GO) {
      notifeeDelivered = await showRideRequestNotification(ride).catch((e) => {
        console.warn('[presentRideRequest] Notifee:', e?.message);
        return false;
      });
    }
    if (!notifeeDelivered) {
      await triggerRideAlertNotification(apiRide).catch((e) => {
        console.warn('[presentRideRequest] Expo fallback:', e?.message);
      });
    }
    await wakeScreenForRideAlert().catch(() => {});
    return ride;
  }

  emit('show', ride);
  return ride;
}

export async function dismissRideRequest(rideId, { cancelNotification = true } = {}) {
  if (cancelNotification && rideId) {
    await cancelRideRequestNotification(rideId);
  }
  if (!rideId || activeRide?.rideId === String(rideId)) {
    activeRide = null;
  }
  emit('hide', { rideId });
}

export async function declineRideRequest(ride, sessionId, rejectedRides = []) {
  if (!ride?.rideId || !sessionId) return;

  stopRideAlertSound();
  await dismissRideRequest(ride.rideId);

  const nextRejected = [...rejectedRides, String(ride.rideId)];
  await driverRideMonitor.updateConfig({
    sessionId,
    rejectedRides: nextRejected,
  });
  await driverRideMonitor.clearPendingRide();

  try {
    await api.driver.refuseRide(sessionId, ride.rideId);
  } catch (e) {
    console.warn('[declineRideRequest]', e?.message);
  }

  return nextRejected;
}

export async function acceptRideRequest(ride, { sessionId, cidadeId, rejectedRides = [] }) {
  if (!ride?.rideId || !sessionId) {
    return { ok: false, error: 'Sessão inválida' };
  }

  stopRideAlertSound();
  await dismissRideRequest(ride.rideId);
  await clearRidePendingStorage();
  await cancelRideAlertNotification().catch(() => {});

  await driverRideMonitor.beginAcceptRide(ride.rideId, {
    sessionId,
    cidadeId: cidadeId || 1,
    isAvailable: true,
    rejectedRides,
  });

  const raw = ride.rawRide || { id: ride.rideId };
  const rideData =
    buildTaximeterRide({
      ...raw,
      id: ride.rideId,
      taxa: raw.taxa ?? ride.price,
      nome_cliente: ride.passengerName,
      endereco_ini_txt: ride.pickupAddress,
      endereco_fim_txt: ride.dropoffAddress,
      km: ride.distanceKm,
      tempo: ride.estimatedMinutes,
      f_pagamento: raw.f_pagamento,
      cidade_id: raw.cidade_id || cidadeId,
    }) || {
      id: ride.rideId,
      taxa: String(ride.price),
      nome_cliente: ride.passengerName,
      endereco_ini_txt: ride.pickupAddress,
      endereco_fim_txt: ride.dropoffAddress,
    };

  try {
    const response = await api.driver.acceptRide(sessionId, ride.rideId);

    if (normalizeApiOk(response.data)) {
      await saveSession({ activeRideId: ride.rideId });
      await driverRideMonitor.updateConfig({
        sessionId,
        cidadeId: cidadeId || 1,
        isAvailable: true,
        isOnRide: true,
        rejectedRides,
      });
      await driverRideMonitor.clearPendingRide();
      activeRide = null;
      return { ok: true, rideData };
    }

    driverRideMonitor.clearAcceptLock();
    await driverRideMonitor.updateConfig({
      sessionId,
      cidadeId: cidadeId || 1,
      isAvailable: true,
      isOnRide: false,
      rejectedRides: [...rejectedRides, String(ride.rideId)],
    });
    await driverRideMonitor.clearPendingRide();
    activeRide = null;
    return { ok: false, error: 'Corrida indisponível' };
  } catch (e) {
    console.error('[acceptRideRequest]', e);
    driverRideMonitor.clearAcceptLock();
    await driverRideMonitor.updateConfig({
      sessionId,
      cidadeId: cidadeId || 1,
      isAvailable: true,
      isOnRide: false,
      rejectedRides,
    }).catch(() => {});
    return { ok: false, error: e?.message || 'Erro ao aceitar' };
  }
}

export async function processPendingRideActions(navigationRef) {
  if (!navigationRef?.current) return;

  try {
    const session = await getSession();
    if (session?.activeRideId) {
      await clearRidePendingStorage();
      return;
    }

    if (driverRideMonitor.config?.isOnRide || driverRideMonitor.acceptingRideId) {
      await clearRidePendingStorage();
      return;
    }

    const pendingShow = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_SHOW);
    if (pendingShow) {
      await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_SHOW);
      const ride = JSON.parse(pendingShow);
      if (ride?.rideId && !driverRideMonitor.isRideBlocked(ride.rideId)) {
        const pendingRaw = await driverRideMonitor.getPendingRide();
        activeRide = ride.rawRide
          ? ride
          : { ...ride, rawRide: pendingRaw || { id: ride.rideId } };
        emit('show', activeRide);
      }
    }

    const pendingAcceptRaw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_ACCEPT);
    if (!pendingAcceptRaw) return;

    await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_ACCEPT);
    const ride = JSON.parse(pendingAcceptRaw);
    if (!ride?.rideId) return;

    if (!session?.id) return;

    const result = await acceptRideRequest(ride, {
      sessionId: session.id,
      cidadeId: session.cidade_id || ride.cidadeId || 1,
    });

    if (result.ok) {
      navigationRef.current.navigate('Taximeter', { ride: result.rideData });
    }
  } catch (e) {
    console.warn('[processPendingRideActions]', e?.message);
  }
}

export async function clearRideRequestState() {
  activeRide = null;
  await cancelAllRideRequestNotifications();
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.PENDING_ACCEPT,
    STORAGE_KEYS.PENDING_SHOW,
  ]);
}
