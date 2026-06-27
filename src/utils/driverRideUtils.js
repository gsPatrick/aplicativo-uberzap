export const parseCoordinate = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Detecta um texto que é só uma coordenada "lat,lng" (ex.: "-14.4342732,-54.0562463").
 * O passageiro às vezes salva a coordenada crua no campo de endereço.
 */
export const isCoordinateText = (value) => {
  const s = String(value ?? '').trim();
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(s);
};

/** Extrai {latitude, longitude} de um texto "lat,lng" — ou null se não for coordenada. */
export const parseLatLngText = (value) => {
  const s = String(value ?? '').trim();
  const m = s.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

/** Monta um endereço legível a partir do resultado do Location.reverseGeocodeAsync. */
export const formatReverseGeocode = (geo) => {
  if (!geo) return '';
  const rua = geo.street || geo.name || '';
  const numero = geo.streetNumber ? `, ${geo.streetNumber}` : '';
  const bairro = geo.district || geo.subregion || '';
  const cidade = geo.city || geo.region || '';
  const linha1 = `${rua}${numero}`.trim();
  const partes = [linha1, bairro, cidade].map((p) => String(p || '').trim()).filter(Boolean);
  // Remove duplicatas consecutivas (ex.: bairro == cidade)
  const dedup = partes.filter((p, i) => i === 0 || p !== partes[i - 1]);
  return dedup.join(' - ');
};

export const isNoDestinationRide = (ride) => {
  const destinationText = String(ride?.endereco_fim_txt || ride?.endereco_fim || ride?.destino || '').toLowerCase();
  return destinationText.includes('sem destino') || destinationText.includes('a combinar');
};

/** status DB: 1=aceita, 2=no local, 3=em viagem */
export const serverStatusToTaximeterStatus = (serverStatus) => {
  const s = Number(serverStatus);
  if (s >= 3) return 'IN_PROGRESS';
  if (s === 2) return 'ARRIVED';
  return 'WAY_TO_ORIGIN';
};

export const buildTaximeterRide = (rawRide) => {
  if (!rawRide?.id) return null;
  const noDest = isNoDestinationRide(rawRide);

  return {
    ...rawRide,
    id: rawRide.id,
    taxa: rawRide.taxa ?? '0.00',
    taxa_km: rawRide.taxa_km,
    taxa_minuto: rawRide.taxa_minuto,
    nome_cliente: rawRide.nome_cliente || rawRide.cliente || 'Passageiro',
    origem: rawRide.endereco_ini_txt || rawRide.endereco_ini || 'Localização atual',
    destino: noDest ? 'Sem destino (taxímetro)' : (rawRide.endereco_fim_txt || rawRide.endereco_fim || 'Destino'),
    isNoDestination: noDest,
    origin: {
      latitude: parseCoordinate(rawRide.lat_ini),
      longitude: parseCoordinate(rawRide.lng_ini),
    },
    destination: {
      latitude: parseCoordinate(rawRide.lat_fim),
      longitude: parseCoordinate(rawRide.lng_fim),
    },
    serverStatus: rawRide.status,
  };
};

export const animateMapToCoords = (mapRef, coords, delta = 0.02) => {
  if (!mapRef?.current?.animateToRegion || !coords?.latitude || !coords?.longitude) return;
  try {
    mapRef.current.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      1000
    );
  } catch (e) {
    console.warn('animateToRegion failed:', e);
  }
};

/**
 * Segue a posição em TEMPO REAL preservando o zoom atual do usuário.
 * Usa animateCamera (só move o centro) — diferente do animateMapToCoords, que
 * reseta o zoom. Ideal pra chamar a cada atualização de GPS.
 */
export const followMapToCoords = (mapRef, coords, duration = 700) => {
  if (!mapRef?.current?.animateCamera || !coords?.latitude || !coords?.longitude) return;
  try {
    mapRef.current.animateCamera(
      { center: { latitude: coords.latitude, longitude: coords.longitude } },
      { duration }
    );
  } catch (e) {
    // silencioso — não polui o log a cada update
  }
};
