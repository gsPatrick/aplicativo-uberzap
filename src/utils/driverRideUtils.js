export const parseCoordinate = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
