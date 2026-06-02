import { CONFIG } from '../config';
import {
  registerForPushNotificationsAsync,
  getStoredPushToken,
} from '../utils/notifications';
import { getSession } from '../utils/session';
import api from '../services/api';

/** Sincroniza Expo Push Token com o servidor (passageiro ou motorista). */
export async function syncPushTokenWithServer() {
  try {
    const session = await getSession();
    if (!session) return null;

    let token = await getStoredPushToken();
    if (!token) {
      token = await registerForPushNotificationsAsync();
    }
    if (!token) return null;

    if (CONFIG.APP_BUILD === 'driver' && session.id) {
      await api.driver.savePushToken(session.id, token);
    } else if (session.telefone && session.senha) {
      await api.passenger.savePushToken(session.telefone, session.senha, token);
    }

    return token;
  } catch (e) {
    console.warn('[PushSync] Falha ao sincronizar token:', e);
    return null;
  }
}
