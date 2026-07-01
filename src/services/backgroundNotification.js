import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  handleNotifeeEvent,
  parseRideFromNotificationDetail,
} from './rideNotification';

const STORAGE_KEYS = {
  PENDING_ACCEPT: '@UbeZap:pendingAcceptedRide',
  PENDING_SHOW: '@UbeZap:pendingShowRideRequest',
};
const SESSION_KEY = '@Uberzap:session';

const IS_EXPO_GO = Constants?.appOwnership === 'expo';

if (Platform.OS === 'android' && !IS_EXPO_GO) {
  try {
    const notifee = require('@notifee/react-native').default;
    const { EventType } = require('@notifee/react-native');
    const { CONFIG } = require('../config');

    async function postDriverForm(endpoint, fields) {
      const parts = Object.entries({ ...fields, secret: CONFIG.SECRET_KEY }).map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
      );
      const res = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: parts.join('&'),
      });
      return res.text();
    }

    notifee.onBackgroundEvent(async ({ type, detail }) => {
      const ride = parseRideFromNotificationDetail(detail);
      const rideId = ride?.rideId || detail?.notification?.data?.rideId;

      handleNotifeeEvent(type, detail, EventType, {
        onAccept: async (acceptedRide) => {
          // Para o som/loop + encerra o foreground service ANTES de tudo.
          try {
            const { stopRideAlertSound } = require('../utils/rideAlertSound');
            await stopRideAlertSound();
          } catch (_) {}
          await AsyncStorage.setItem(
            STORAGE_KEYS.PENDING_ACCEPT,
            JSON.stringify(acceptedRide)
          );
          if (detail?.notification?.id) {
            await notifee.cancelNotification(detail.notification.id);
          }
        },
        onDecline: async (declinedRide) => {
          // Para o som/loop + encerra o foreground service.
          try {
            const { stopRideAlertSound } = require('../utils/rideAlertSound');
            await stopRideAlertSound();
          } catch (_) {}
          try {
            const sessionRaw = await AsyncStorage.getItem(SESSION_KEY);
            const session = sessionRaw ? JSON.parse(sessionRaw) : null;
            const motoristaId = session?.id;
            if (motoristaId && declinedRide?.rideId) {
              await postDriverForm('motoristas/recusar.php', {
                id_motorista: motoristaId,
                id_corrida: declinedRide.rideId,
              });
            }
          } catch (e) {
            console.warn('[backgroundNotification] decline:', e?.message);
          }
          if (detail?.notification?.id) {
            await notifee.cancelNotification(detail.notification.id);
          }
        },
        onOpen: async (openedRide) => {
          if (openedRide) {
            await AsyncStorage.setItem(
              STORAGE_KEYS.PENDING_SHOW,
              JSON.stringify(openedRide)
            );
          }
        },
      });

      if (type === EventType.DISMISSED && rideId) {
        await notifee.cancelNotification(detail.notification.id);
      }
    });
  } catch (e) {
    console.warn('[backgroundNotification] Falha ao registrar Notifee:', e?.message);
  }
}
