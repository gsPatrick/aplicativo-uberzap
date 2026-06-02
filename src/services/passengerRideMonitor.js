import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import api from './api';
import { getSession } from '../utils/session';
import {
  triggerTripStatusNotification,
} from '../utils/notifications';
import { playStatusSoundOnce } from '../utils/statusSound';
import { wakeScreenForRideAlert } from '../utils/androidOverlay';
import { stopRideForegroundService } from './rideForegroundService';
import { recentlyPushed, tripStatusKey } from '../utils/notificationDedup';

const STORAGE_KEY = '@UbeZap:passengerMonitorState';
const POLL_INTERVAL_MS = 4000;

class PassengerRideMonitor {
  constructor() {
    this.intervalId = null;
    this.config = {
      rideId: null,
      telefone: null,
      senha: null,
      lastStatus: null,
      lastNotifiedStatus: null,
      lastMotoristaLat: null,
      lastMotoristaLng: null,
    };
    this.listeners = new Set();
    this.inFlight = null;
    this.appStateSubscription = null;
    this.backgroundIntervalId = null;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, payload);
      } catch (e) {
        console.warn('[PassengerRideMonitor] Listener error:', e);
      }
    });
  }

  async persistState() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn('[PassengerRideMonitor] Erro ao persistir:', e);
    }
  }

  async restoreState() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.config = { ...this.config, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[PassengerRideMonitor] Erro ao restaurar:', e);
    }
  }

  async persistActiveRide(rideId) {
    if (!rideId) return;
    const session = await getSession();
    if (!session?.telefone) return;
    this.config = {
      rideId: String(rideId),
      telefone: session.telefone,
      senha: session.senha,
      lastStatus: this.config.lastStatus,
    };
    await this.persistState();
  }

  startBackgroundPoll() {
    if (this.backgroundIntervalId || !this.config.rideId) return;
    this.backgroundIntervalId = setInterval(() => {
      this.pollOnce(true);
    }, POLL_INTERVAL_MS);
  }

  stopBackgroundPoll() {
    if (this.backgroundIntervalId) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }
  }

  async start(rideId, { reset = false } = {}) {
    if (!rideId) return;

    const session = await getSession();
    if (!session?.telefone) return;

    const rideChanged = String(rideId) !== String(this.config.rideId);

    this.config = {
      rideId: String(rideId),
      telefone: session.telefone,
      senha: session.senha,
      lastStatus: reset || rideChanged ? null : this.config.lastStatus,
      lastNotifiedStatus: reset || rideChanged ? null : this.config.lastNotifiedStatus,
      lastMotoristaLat: reset || rideChanged ? null : this.config.lastMotoristaLat,
      lastMotoristaLng: reset || rideChanged ? null : this.config.lastMotoristaLng,
    };
    await this.persistState();

    if (this.intervalId) clearInterval(this.intervalId);

    this.appStateSubscription?.remove();
    this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        this.stopBackgroundPoll();
        if (this.config.rideId) {
          this.pollOnce(false);
        }
      } else if (nextState === 'background' || nextState === 'inactive') {
        this.startBackgroundPoll();
      }
    });

    if (AppState.currentState !== 'active') {
      this.startBackgroundPoll();
    }

    await this.pollOnce(false);
    this.intervalId = setInterval(() => this.pollOnce(false), POLL_INTERVAL_MS);
  }

  async stop() {
    this.stopBackgroundPoll();
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.config = {
      rideId: null,
      telefone: null,
      senha: null,
      lastStatus: null,
      lastNotifiedStatus: null,
      lastMotoristaLat: null,
      lastMotoristaLng: null,
    };
    await AsyncStorage.removeItem(STORAGE_KEY);
    await stopRideForegroundService().catch(() => {});
  }

  async pollOnce(fromBackground = false) {
    const { rideId, telefone, senha } = this.config;
    if (!rideId || !telefone) return null;
    if (this.inFlight) return this.inFlight;

    this.inFlight = (async () => {
      try {
        const response = await api.passenger.getStatus(telefone, senha, rideId);
        const data = response.data;
        if (!data || data.status === undefined) return null;

        let status = Number(data.status);
        let payload = data;

        if (
          status === 0 &&
          data.avaliacao_pendente &&
          String(data.avaliacao_pendente.id) === String(rideId)
        ) {
          status = 4;
          payload = {
            ...data.avaliacao_pendente,
            status: 4,
            pendente_avaliacao: true,
          };
        }

        const prev = this.config.lastStatus != null ? Number(this.config.lastStatus) : null;

        const mot = data.motorista;
        const motLat = mot?.latitude != null ? String(mot.latitude) : null;
        const motLng = mot?.longitude != null ? String(mot.longitude) : null;
        const prevMotLat = this.config.lastMotoristaLat;
        const prevMotLng = this.config.lastMotoristaLng;
        const statusChanged = prev === null || prev !== status;
        const motLatNum = motLat != null ? parseFloat(motLat) : null;
        const motLngNum = motLng != null ? parseFloat(motLng) : null;
        const prevLatNum = prevMotLat != null ? parseFloat(prevMotLat) : null;
        const prevLngNum = prevMotLng != null ? parseFloat(prevMotLng) : null;
        const driverMoved =
          motLatNum != null &&
          motLngNum != null &&
          (prevLatNum == null ||
            prevLngNum == null ||
            Math.abs(motLatNum - prevLatNum) > 0.00015 ||
            Math.abs(motLngNum - prevLngNum) > 0.00015);

        const prevNotified = this.config.lastNotifiedStatus != null
          ? Number(this.config.lastNotifiedStatus)
          : null;
        const appInBackground = AppState.currentState !== 'active';
        const shouldNotify =
          (fromBackground || appInBackground) &&
          status >= 1 &&
          status <= 5 &&
          statusChanged &&
          (prevNotified === null || prevNotified !== status);

        if (shouldNotify) {
          // Se o push remoto (FCM) deste mesmo status já chegou, ele já mostrou a
          // notificação e tocou o som — não duplicar pelo caminho local.
          const remoteAlreadyShown = recentlyPushed(tripStatusKey(rideId, status));
          if (!remoteAlreadyShown) {
            await wakeScreenForRideAlert().catch(() => {});
            await triggerTripStatusNotification(status, data.motorista, rideId);
            if (fromBackground || appInBackground) {
              playStatusSoundOnce().catch(() => {});
            }
          }
          this.config.lastNotifiedStatus = status;
          await this.persistState();
        }

        if (statusChanged) {
          this.config.lastStatus = status;
          await this.persistState();
        }
        if (motLat != null) this.config.lastMotoristaLat = motLat;
        if (motLng != null) this.config.lastMotoristaLng = motLng;
        if (statusChanged || driverMoved || status === 4 || status === 5) {
          this.notify('statusUpdate', payload);
        }

        if (status === 4 || status === 5) {
          if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
          }
          this.stopBackgroundPoll();
          if (fromBackground || appInBackground) {
            await this.stop();
          }
        }

        return data;
      } catch (e) {
        console.warn('[PassengerRideMonitor] Erro no polling:', e);
        return null;
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  /** Chamado pela task de localização em background (app minimizado) */
  async pollFromBackground() {
    await this.restoreState();
    if (!this.config.rideId || !this.config.telefone) return null;
    return this.pollOnce(true);
  }
}

const passengerRideMonitor = new PassengerRideMonitor();
export default passengerRideMonitor;

export async function getPassengerMonitorStateForBackground() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
