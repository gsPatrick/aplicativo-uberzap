import AsyncStorage from '@react-native-async-storage/async-storage';

const SKIPPED_RATINGS_KEY = '@UbeZap:skippedRatingRideIds';

export async function getSkippedRatingRideIds() {
  try {
    const raw = await AsyncStorage.getItem(SKIPPED_RATINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function isRatingSkipped(rideId) {
  if (rideId == null || rideId === '') return false;
  const ids = await getSkippedRatingRideIds();
  return ids.includes(String(rideId));
}

export async function markRatingSkipped(rideId) {
  if (rideId == null || rideId === '') return;
  const id = String(rideId);
  const ids = await getSkippedRatingRideIds();
  if (ids.includes(id)) return;
  ids.push(id);
  await AsyncStorage.setItem(SKIPPED_RATINGS_KEY, JSON.stringify(ids.slice(-50)));
}

export async function clearRatingSkipped(rideId) {
  if (rideId == null || rideId === '') return;
  const id = String(rideId);
  const ids = (await getSkippedRatingRideIds()).filter((x) => x !== id);
  await AsyncStorage.setItem(SKIPPED_RATINGS_KEY, JSON.stringify(ids));
}

/** Normaliza resposta da API (legado status 4 ou novo avaliacao_pendente). */
export function extractPendingRating(data) {
  if (!data || typeof data !== 'object') return null;

  if (data.avaliacao_pendente && data.avaliacao_pendente.id) {
    return data.avaliacao_pendente;
  }

  if (
    Number(data.status) === 4 &&
    data.pendente_avaliacao !== false &&
    data.id
  ) {
    return data;
  }

  return null;
}
