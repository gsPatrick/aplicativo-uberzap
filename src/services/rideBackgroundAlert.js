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

/**
 * Dispara alertas de corrida no 2º plano (Notifee + Expo + acordar tela).
 * Payload leve — objeto grande no data{} faz o Android rejeitar a notificação.
 */
export async function notifyDriverNewRide(rawRide) {
  if (!rawRide?.id) return false;
  if (driverRideMonitor.isRideBlocked(rawRide.id)) return false;
  if (driverRideMonitor.config?.isOnRide) return false;

  const ride = mapApiRideToRideRequest(rawRide);
  if (!ride) return false;

  await driverRideMonitor.setPendingRide(rawRide);

  try {
    const { rawRide: _drop, ...compact } = ride;
    await AsyncStorage.setItem(RIDE_STORAGE_KEYS.PENDING_SHOW, JSON.stringify(compact));
  } catch (e) {
    console.warn('[rideBackgroundAlert] pending show:', e?.message);
  }

  // App aberto: modal interno (HomeScreen / RideRequestScreen) — sem banner do sistema.
  if (AppState.currentState === 'active') {
    try {
      const { presentRideRequest } = require('./rideRequestController');
      await presentRideRequest(rawRide);
      await startRideAlertSound();
      return true;
    } catch (e) {
      console.warn('[rideBackgroundAlert] foreground:', e?.message);
    }
  }

  let delivered = false;

  // 2º plano / app morto: banner Notifee por cima de outros apps (WhatsApp etc.).
  if (Platform.OS === 'android' && !IS_EXPO_GO) {
    delivered = await showRideRequestNotification(ride).catch((e) => {
      console.warn('[rideBackgroundAlert] Notifee:', e?.message);
      return false;
    });
  }

  if (!delivered) {
    try {
      await triggerRideAlertNotification(rawRide);
      delivered = true;
    } catch (e) {
      console.warn('[rideBackgroundAlert] Expo:', e?.message);
    }
  }

  // Som em loop: expo-av + FG service do Notifee (não abrir o app automaticamente).
  if (delivered) {
    try {
      await startRideAlertSound();
    } catch (_) {}
  }

  try {
    await wakeScreenForRideAlert();
  } catch (_) {}

  return delivered;
}
