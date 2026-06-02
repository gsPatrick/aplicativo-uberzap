import Constants from 'expo-constants';
import * as Location from 'expo-location';

const NOMINATIM_USER_AGENT = 'UbeZapPassenger/1.0 (contato: suporte@ubezap.com)';

export const DEFAULT_SEARCH_RADIUS_METERS = 50000;

export function getGoogleMapsApiKey() {
  return (
    Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
    Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
    null
  );
}

function formatLocationLabel(address = {}) {
  const neighborhood =
    address.suburb ||
    address.neighbourhood ||
    address.quarter ||
    address.residential ||
    address.hamlet;

  const city =
    address.city ||
    address.town ||
    address.municipality ||
    address.village ||
    address.county ||
    address.state_district;

  if (neighborhood && city && neighborhood.toLowerCase() !== city.toLowerCase()) {
    return `${neighborhood}, ${city}`;
  }
  if (city) return city;
  if (neighborhood) return neighborhood;
  return null;
}

function labelFromGoogleAddressComponents(components = []) {
  const get = (type) =>
    components.find((c) => c.types?.includes(type))?.long_name;

  const neighborhood = get('sublocality') || get('neighborhood') || get('sublocality_level_1');
  const city = get('locality') || get('administrative_area_level_2');

  if (neighborhood && city && neighborhood.toLowerCase() !== city.toLowerCase()) {
    return `${neighborhood}, ${city}`;
  }
  if (city) return city;
  if (neighborhood) return neighborhood;
  return null;
}

async function reverseGeocodeWithNominatim(latitude, longitude) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}` +
    `&lon=${longitude}&addressdetails=1&accept-language=pt-BR,pt,en`;

  const res = await fetch(url, {
    headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
  });
  const json = await res.json();
  if (!json?.address) return null;

  return {
    label: formatLocationLabel(json.address),
    displayName: json.display_name || null,
  };
}

function parseGoogleGeocodeResults(results = []) {
  if (!Array.isArray(results) || results.length === 0) return null;

  for (const result of results) {
    const label = labelFromGoogleAddressComponents(result.address_components);
    if (label) {
      return { label, displayName: result.formatted_address || label };
    }
  }

  return {
    label: results[0].formatted_address?.split(',')[0]?.trim() || null,
    displayName: results[0].formatted_address || null,
  };
}

async function reverseGeocodeWithGoogle(latitude, longitude, apiKey) {
  const base =
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}` +
    `&language=pt-BR&key=${encodeURIComponent(apiKey)}`;

  const filteredUrl =
    `${base}&result_type=locality|sublocality|administrative_area_level_2|neighborhood`;

  try {
    const filteredRes = await fetch(filteredUrl);
    const filteredJson = await filteredRes.json();
    if (filteredJson?.status === 'OK') {
      const parsed = parseGoogleGeocodeResults(filteredJson.results);
      if (parsed?.label || parsed?.displayName) return parsed;
    }
  } catch (e) {
    console.warn('[Geocoding] Google filtered reverse geocode:', e?.message || e);
  }

  try {
    const res = await fetch(base);
    const json = await res.json();
    if (json?.status === 'OK') {
      return parseGoogleGeocodeResults(json.results);
    }
  } catch (e) {
    console.warn('[Geocoding] Google reverse geocode:', e?.message || e);
  }

  return null;
}

async function reverseGeocodeWithExpo(latitude, longitude) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!Array.isArray(results) || results.length === 0) return null;

    const a = results[0];
    const label =
      formatLocationLabel({
        suburb: a.district || a.subregion,
        neighbourhood: a.name,
        city: a.city,
        town: a.city,
        municipality: a.subregion,
        county: a.region,
      }) ||
      [a.street, a.district, a.city].filter(Boolean).join(', ') ||
      null;

    const displayName =
      [a.street, a.streetNumber, a.district, a.city, a.region]
        .filter(Boolean)
        .join(', ') ||
      label;

    if (!label && !displayName) return null;
    return { label: label || displayName, displayName: displayName || label };
  } catch (e) {
    console.warn('[Geocoding] Expo reverse geocode:', e?.message || e);
    return null;
  }
}

export function formatCoordsFallback(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
}

const PICKUP_PLACEHOLDER_RE = /carregando|obtendo|localização/i;

export function isPickupPlaceholder(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  return PICKUP_PLACEHOLDER_RE.test(s);
}

async function reverseGeocodeCore(latitude, longitude) {
  try {
    const googleKey = getGoogleMapsApiKey();
    if (googleKey) {
      const googleResult = await reverseGeocodeWithGoogle(latitude, longitude, googleKey);
      if (googleResult?.label || googleResult?.displayName) return googleResult;
    }
  } catch (e) {
    console.warn('[Geocoding] Google reverse geocode:', e?.message || e);
  }

  try {
    const expoResult = await reverseGeocodeWithExpo(latitude, longitude);
    if (expoResult?.label || expoResult?.displayName) return expoResult;
  } catch (e) {
    console.warn('[Geocoding] Expo reverse geocode:', e?.message || e);
  }

  try {
    const nominatimResult = await reverseGeocodeWithNominatim(latitude, longitude);
    if (nominatimResult?.label || nominatimResult?.displayName) return nominatimResult;
  } catch (e) {
    console.warn('[Geocoding] Nominatim reverse geocode:', e?.message || e);
  }

  return { label: null, displayName: null };
}

/**
 * Reverse geocoding em tempo real para exibir cidade/bairro atual no header.
 */
export async function reverseGeocodeLocation(latitude, longitude, { timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { label: null, displayName: null };
  }

  try {
    const result = await Promise.race([
      reverseGeocodeCore(latitude, longitude),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Geocoding timeout')), timeoutMs);
      }),
    ]);
    return result;
  } catch (e) {
    console.warn('[Geocoding] reverseGeocodeLocation:', e?.message || e);
    return { label: null, displayName: null };
  }
}

/** Resolve endereço de embarque antes de enviar corrida à API */
export async function resolvePickupAddressForRide(latitude, longitude, currentLabel = '') {
  if (!isPickupPlaceholder(currentLabel)) {
    return currentLabel.trim();
  }
  const { label, displayName } = await reverseGeocodeLocation(latitude, longitude, { timeoutMs: 12000 });
  const resolved = (displayName || label || '').trim();
  if (resolved) return resolved;
  const coords = formatCoordsFallback(latitude, longitude);
  return coords ? `Embarque (${coords})` : 'Embarque';
}

async function fetchGooglePlaceDetails(placeId, apiKey) {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}` +
    `&fields=geometry,formatted_address,name&language=pt-BR&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const json = await res.json();
  if (json?.status !== 'OK' || !json.result?.geometry?.location) return null;

  const { lat, lng } = json.result.geometry.location;
  return {
    place_id: placeId,
    name: json.result.name || '',
    display_name: json.result.formatted_address || json.result.name || '',
    lat: String(lat),
    lon: String(lng),
  };
}

/**
 * Google Places Autocomplete com location biasing (prioriza região local).
 */
export async function searchGooglePlaces(query, latitude, longitude, radius = DEFAULT_SEARCH_RADIUS_METERS) {
  const apiKey = getGoogleMapsApiKey();
  const q = String(query || '').trim();
  if (!apiKey || q.length < 3) return [];

  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  let url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}` +
    `&components=country:br&language=pt-BR&key=${encodeURIComponent(apiKey)}`;

  if (hasCoords) {
    url += `&location=${latitude},${longitude}&radius=${radius}&strictbounds=false`;
  }

  const res = await fetch(url);
  const json = await res.json();
  if (json?.status !== 'OK' || !Array.isArray(json.predictions)) {
    return [];
  }

  const topPredictions = json.predictions.slice(0, 8);
  const details = await Promise.all(
    topPredictions.map((p) => fetchGooglePlaceDetails(p.place_id, apiKey))
  );

  return details.filter(Boolean);
}

/**
 * Busca endereços priorizando Google Places (bias local), com fallback externo.
 */
export async function searchAddressesNearUser(query, latitude, longitude, apiFn, radius = DEFAULT_SEARCH_RADIUS_METERS) {
  let list = [];

  try {
    list = await searchGooglePlaces(query, latitude, longitude, radius);
  } catch (e) {
    console.warn('[Geocoding] Google Places:', e?.message || e);
  }

  if (list.length === 0 && typeof apiFn === 'function') {
    try {
      const r = await apiFn(query, latitude, longitude, radius);
      const raw = r?.data;
      list = Array.isArray(raw) ? raw : [];
    } catch (e) {
      console.warn('[Geocoding] API busca_endereco:', e?.message || e);
    }
  }

  return list;
}
