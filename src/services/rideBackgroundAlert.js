import { Platform, AppState } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { triggerRideAlertNotification } from '../utils/notifications';
import { wakeScreenForRideAlert } from '../utils/androidOverlay';
import { startRideAlertSound } from '../utils/rideAlertSound';
import { mapApiRideToRideRequest, showRideRequestNotification } from './rideNotification';
import { STORAGE_KEYS as RIDE_STORAGE_KEYS } from './rideRequestController';
import driverRideMonitor from './driverRideMonitor';

const IS_EXPO_GO = Constants?.appOwnership === 'expo';

function persistRideForLater(ride, rawRide) {
  const jobs = [driverRideMonitor.setPendingRide(rawRide)];
  if (ride) {
    const { rawRide: _drop, ...compact } = ride;
    jobs.push(
      AsyncStorage.setItem(RIDE_STORAGE_KEYS.PENDING_SHOW, JSON.stringify(compact))
    );
  }
  Promise.all(jobs).catch((e) => {
    console.warn('[rideBackgroundAlert] persist:', e?.message);
  });
}

/**
 * Dispara alertas de corrida.
 * Caminho crítico: desenha o banner Notifee ANTES de AsyncStorage/I/O lento.
 */
export async function notifyDriverNewRide(rawRide) {
  if (!rawRide?.id) return false;
  if (driverRideMonitor.isRideBlocked(rawRide.id)) return false;
  if (driverRideMonitor.config?.isOnRide) return false;

  const ride = mapApiRideToRideRequest(rawRide);
  if (!ride) return false;

  // App aberto: modal interno — sem banner do sistema.
  if (AppState.currentState === 'active') {
    persistRideForLater(ride, rawRide);
    try {
      const { presentRideRequest } = require('./rideRequestController');
      await presentRideRequest(rawRide);
      startRideAlertSound().catch(() => {});
      return true;
    } catch (e) {
      console.warn('[rideBackgroundAlert] foreground:', e?.message);
    }
  }

  let delivered = false;

  // 2º plano / app morto: banner primeiro (não esperar gravação no disco).
  if (Platform.OS === 'android' && !IS_EXPO_GO) {
    delivered = await showRideRequestNotification(ride).catch((e) => {
      console.warn('[rideBackgroundAlert] Notifee:', e?.message);
      return false;
    });
  }

  if (delivered) {
    startRideAlertSound().catch(() => {});
    wakeScreenForRideAlert().catch(() => {});
    persistRideForLater(ride, rawRide);
    return true;
  }

  if (!delivered) {
    try {
      await triggerRideAlertNotification(rawRide);
      delivered = true;
    } catch (e) {
      console.warn('[rideBackgroundAlert] Expo:', e?.message);
    }
    if (delivered) {
      startRideAlertSound().catch(() => {});
      wakeScreenForRideAlert().catch(() => {});
    }
  }

  persistRideForLater(ride, rawRide);
  return delivered;
}
