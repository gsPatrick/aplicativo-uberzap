import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import api from './api';

const STORAGE_KEYS = {
  PENDING_RIDE: '@UbeZap:pendingRide',
  MONITOR_STATE: '@UbeZap:driverMonitorState',
};

const POLL_INTERVAL_MS = 3000;

class DriverRideMonitor {
  constructor() {
    this.intervalId = null;
    this.config = {
      sessionId: null,
      cidadeId: 1,
      isAvailable: false,
      isOnRide: false,
      rejectedRides: [],
    };
    this.listeners = new Set();
    this.currentRideId = null;
    this.acceptingRideId = null;
    this.appStateSubscription = null;
    this.backgroundIntervalId = null;
    this.isPolling = false;
  }

  async notifyBackgroundRide(ride) {
    if (!ride?.id) return;
    try {
      const { notifyDriverNewRide } = await import('./rideBackgroundAlert');
      await notifyDriverNewRide(ride);
    } catch (e) {
      console.warn('[DriverRideMonitor] Erro ao notificar corrida em background:', e);
    }
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
        console.warn('[DriverRideMonitor] Listener error:', e);
      }
    });
  }

  async updateConfig(partial) {
    this.config = { ...this.config, ...partial };
    await this.persistState();

    if (this.config.isOnRide) {
      this.acceptingRideId = null;
    }

    if (this.config.isAvailable && this.config.sessionId && !this.config.isOnRide) {
      this.start();
    } else {
      this.stop();
    }
  }

  /** Trava polling/alertas enquanto aceite está em andamento. */
  async beginAcceptRide(rideId, partial = {}) {
    if (!rideId) return;
    this.acceptingRideId = String(rideId);
    this.currentRideId = String(rideId);
    await this.updateConfig({
      isOnRide: true,
      ...partial,
    });
  }

  clearAcceptLock() {
    this.acceptingRideId = null;
  }

  isRideBlocked(rideId) {
    const id = String(rideId);
    if (this.acceptingRideId === id) return true;
    if (this.config.isOnRide && this.currentRideId === id) return true;
    return false;
  }

  async persistState() {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.MONITOR_STATE,
        JSON.stringify({
          sessionId: this.config.sessionId,
          cidadeId: this.config.cidadeId,
          isAvailable: this.config.isAvailable,
          isOnRide: this.config.isOnRide,
          rejectedRides: this.config.rejectedRides,
        })
      );
    } catch (e) {
      console.warn('[DriverRideMonitor] Erro ao persistir estado:', e);
    }
  }

  async restoreState() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.MONITOR_STATE);
      if (raw) {
        const saved = JSON.parse(raw);
        this.config = { ...this.config, ...saved };
      }
    } catch (e) {
      console.warn('[DriverRideMonitor] Erro ao restaurar estado:', e);
    }
  }

  async getPendingRide() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_RIDE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async setPendingRide(ride) {
    try {
      if (ride) {
        await AsyncStorage.setItem(STORAGE_KEYS.PENDING_RIDE, JSON.stringify(ride));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_RIDE);
      }
    } catch (e) {
      console.warn('[DriverRideMonitor] Erro ao salvar corrida pendente:', e);
    }
  }

  async clearPendingRide() {
    this.currentRideId = null;
    await this.setPendingRide(null);
  }

  startBackgroundPoll() {
    if (this.backgroundIntervalId) return;
    if (!this.config.isAvailable || this.config.isOnRide || !this.config.sessionId) return;

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

  start() {
    if (this.intervalId) return;

    this.appStateSubscription?.remove();
    this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        this.stopBackgroundPoll();
        if (this.config.isAvailable && !this.config.isOnRide) {
          this.pollOnce(false);
        }
      } else if (nextState === 'background' || nextState === 'inactive') {
        this.startBackgroundPoll();
      }
    });

    if (AppState.currentState !== 'active') {
      this.startBackgroundPoll();
    }

    this.pollOnce(false);
    this.intervalId = setInterval(() => this.pollOnce(false), POLL_INTERVAL_MS);
  }

  stop() {
    this.stopBackgroundPoll();
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  async pollOnce(fromBackground = false) {
    const { sessionId, cidadeId, isAvailable, isOnRide, rejectedRides } = this.config;
    if (!sessionId || !isAvailable || isOnRide || this.isPolling || this.acceptingRideId) return;

    this.isPolling = true;
    try {
      const response = await api.driver.pollRides(sessionId, cidadeId);
      const rejectedSet = new Set((rejectedRides || []).map((id) => String(id)));

      if (response.data && response.data !== 'no' && Array.isArray(response.data) && response.data.length > 0) {
        const freshRide = response.data.find((r) => !rejectedSet.has(String(r.id)));

        if (freshRide) {
          if (
            this.currentRideId !== String(freshRide.id) &&
            !this.isRideBlocked(freshRide.id)
          ) {
            this.currentRideId = String(freshRide.id);
            await this.setPendingRide(freshRide);
            this.notify('newRide', freshRide);

            const appInBackground = AppState.currentState !== 'active';
            if (fromBackground || appInBackground) {
              await this.notifyBackgroundRide(freshRide);
            }
          }
        } else if (this.currentRideId && !this.acceptingRideId) {
          this.currentRideId = null;
          await this.clearPendingRide();
          this.notify('rideExpired', null);
        }
      } else if (response.data === 'no' && this.currentRideId) {
        this.currentRideId = null;
        await this.clearPendingRide();
        this.notify('rideExpired', null);
      }
    } catch (e) {
      console.warn('[DriverRideMonitor] Erro no polling:', e);
      // Não limpa corrida pendente em erro de rede — evita sumir alerta por falha temporária
    } finally {
      this.isPolling = false;
    }
  }

  /** Chamado pela task de background (location) para verificar corridas */
  async pollFromBackground(sessionId, cidadeId, rejectedRides = []) {
    if (!sessionId || this.config.isOnRide || this.acceptingRideId) return null;
    try {
      const response = await api.driver.pollRides(sessionId, cidadeId);
      const rejectedSet = new Set(rejectedRides.map((id) => String(id)));

      if (response.data && response.data !== 'no' && Array.isArray(response.data) && response.data.length > 0) {
        const freshRide = response.data.find((r) => !rejectedSet.has(String(r.id)));
        if (freshRide) {
          if (
            this.currentRideId !== String(freshRide.id) &&
            !this.isRideBlocked(freshRide.id)
          ) {
            this.currentRideId = String(freshRide.id);
            await this.setPendingRide(freshRide);
            await this.notifyBackgroundRide(freshRide);
          }
          return freshRide;
        }
      }
    } catch (e) {
      console.warn('[DriverRideMonitor] Background poll error:', e);
    }
    return null;
  }

  markRideHandled(rideId) {
    if (rideId) {
      this.currentRideId = String(rideId);
    }
  }

  releaseRideLock() {
    this.currentRideId = null;
  }
}

const driverRideMonitor = new DriverRideMonitor();
export default driverRideMonitor;
export { STORAGE_KEYS as DRIVER_MONITOR_STORAGE_KEYS };

export async function getDriverMonitorStateForBackground() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.MONITOR_STATE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
