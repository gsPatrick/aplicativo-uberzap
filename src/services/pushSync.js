import { CONFIG } from '../config';
import {
  registerForPushNotificationsAsync,
  getStoredPushToken,
} from '../utils/notifications';
import { getSession } from '../utils/session';
import api from '../services/api';

// Throttle: evita salvar o token a cada 1-2s (era chamado em loop por vários
// effects, gerando spam de rede e travando o app). Só salva de novo se o token
// mudou ou se passou o intervalo mínimo.
let lastSync = { token: null, at: 0 };
const SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 min

/** Sincroniza Expo Push Token com o servidor (passageiro ou motorista). */
export async function syncPushTokenWithServer({ force = false } = {}) {
  try {
    const session = await getSession();
    if (!session) return null;

    let token = await getStoredPushToken();
    if (!token) {
      token = await registerForPushNotificationsAsync();
    }
    if (!token) return null;

    const now = Date.now();
    if (!force && token === lastSync.token && (now - lastSync.at) < SYNC_MIN_INTERVAL_MS) {
      return token; // já salvo recentemente — não repete
    }

    if (CONFIG.APP_BUILD === 'driver' && session.id) {
      await api.driver.savePushToken(session.id, token);
    } else if (session.telefone && session.senha) {
      await api.passenger.savePushToken(session.telefone, session.senha, token);
    }

    lastSync = { token, at: now };
    return token;
  } catch (e) {
    console.warn('[PushSync] Falha ao sincronizar token:', e);
    return null;
  }
}
