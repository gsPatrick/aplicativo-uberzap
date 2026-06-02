import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { triggerRideAlertNotification } from '../utils/notifications';
import { wakeScreenForRideAlert } from '../utils/androidOverlay';
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

  let delivered = false;

  // Notifee é a notificação RICA (full-screen, Aceitar/Recusar) — preferida.
  if (Platform.OS === 'android' && !IS_EXPO_GO) {
    try {
      await showRideRequestNotification(ride);
      delivered = true;
    } catch (e) {
      console.warn('[rideBackgroundAlert] Notifee:', e?.message);
    }
  }

  // Expo só como FALLBACK quando o Notifee não está disponível (Expo Go / iOS).
  // Evita a duplicata Notifee + Expo que aparecia para o mesmo alerta.
  if (!delivered) {
    try {
      await triggerRideAlertNotification(rawRide);
      delivered = true;
    } catch (e) {
      console.warn('[rideBackgroundAlert] Expo:', e?.message);
    }
  }

  try {
    await wakeScreenForRideAlert();
  } catch (_) {}

  return delivered;
}
