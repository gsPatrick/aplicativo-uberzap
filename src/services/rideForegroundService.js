import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';

/** Mesmo nome registrado em App.js via TaskManager.defineTask */
export const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK';

/**
 * Foreground service leve — mantém JS vivo no Android para polling + notificações locais.
 * Necessário porque setInterval para quando o app vai para segundo plano.
 */
export async function startRideForegroundService({
  title = 'UbeZap',
  body = 'Monitorando em segundo plano...',
  accuracy = Location.Accuracy.Lowest,
  timeInterval = 8000,
  distanceInterval = 25,
} = {}) {
  if (Constants?.appOwnership === 'expo') return false;

  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    await Location.requestBackgroundPermissionsAsync().catch(() => {});

    const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
    if (registered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK).catch(() => {});
    }

    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
      accuracy,
      timeInterval,
      distanceInterval,
      deferredUpdatesInterval: timeInterval,
      foregroundService: {
        notificationTitle: title,
        notificationBody: body,
        notificationColor: '#3AB56B',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
    });

    return true;
  } catch (e) {
    console.warn('[RideForegroundService] Falha ao iniciar:', e);
    return false;
  }
}

export async function stopRideForegroundService() {
  if (Constants?.appOwnership === 'expo') return;

  try {
    const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
    if (registered) {
      await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
    }
  } catch (e) {
    console.warn('[RideForegroundService] Falha ao parar:', e);
  }
}

export async function isRideForegroundServiceRunning() {
  try {
    return TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
  } catch {
    return false;
  }
}
