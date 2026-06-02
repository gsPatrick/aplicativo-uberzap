import * as Location from 'expo-location';

const MAX_LAST_KNOWN_AGE_MS = 45000;
const GPS_TIMEOUT_MS = 20000;

/**
 * Obtém coordenadas GPS atuais — evita posição cacheada antiga do getLastKnownPosition.
 */
export async function getFreshPassengerLocation() {
  let last = null;
  try {
    last = await Location.getLastKnownPositionAsync({
      maxAge: MAX_LAST_KNOWN_AGE_MS,
      requiredAccuracy: 150,
    });
  } catch {
    // segue para getCurrentPosition
  }

  const lastAge = last?.timestamp ? Date.now() - last.timestamp : Infinity;
  const lastAcc = last?.coords?.accuracy ?? Infinity;
  const lastKnownUsable =
    last?.coords &&
    Number.isFinite(last.coords.latitude) &&
    Number.isFinite(last.coords.longitude) &&
    lastAge <= MAX_LAST_KNOWN_AGE_MS &&
    lastAcc <= 150;

  if (lastKnownUsable) {
    return last;
  }

  return Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
    maximumAge: 0,
    timeout: GPS_TIMEOUT_MS,
  });
}

/**
 * LocationSubscription.remove() no expo-location retorna void, não Promise.
 * Nunca encadeie .catch() diretamente em remove().
 */
export function safeRemoveLocationSubscription(subscription) {
  if (!subscription) return;
  try {
    if (typeof subscription.remove === 'function') {
      subscription.remove();
    }
  } catch (e) {
    console.warn('[Location] Erro ao remover watcher:', e);
  }
}

export function safeRemoveLocationSubscriptionAsync(subscriptionOrPromise) {
  if (!subscriptionOrPromise) return Promise.resolve();
  if (typeof subscriptionOrPromise.then === 'function') {
    return subscriptionOrPromise
      .then((sub) => {
        safeRemoveLocationSubscription(sub);
      })
      .catch(() => {});
  }
  safeRemoveLocationSubscription(subscriptionOrPromise);
  return Promise.resolve();
}
