import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StatusBar, TouchableOpacity, Animated, Dimensions, StyleSheet, SafeAreaView, Alert, Linking, Platform, Modal, Pressable, ActivityIndicator, BackHandler } from 'react-native';
import styled from 'styled-components/native';
import Icon from '../../components/AppIcon';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import driverRideMonitor from '../../services/driverRideMonitor';
import { getSession, saveSession } from '../../utils/session';
import { safeRemoveLocationSubscription } from '../../utils/locationSubscription';
import {
    isCoordinateText,
    parseLatLngText,
    formatReverseGeocode,
} from '../../utils/driverRideUtils';

// Função Haversine para calcular distância entre coordenadas
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Raio da Terra em KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

const { width, height } = Dimensions.get('window');
const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK';
const IS_EXPO_GO = Constants?.appOwnership === 'expo';

const Container = styled.View`
  flex: 1;
  background-color: ${colors.background};
`;

const StatusHeader = styled.View`
  background-color: ${props => props.color || '#22C55E'};
  padding: 15px 20px;
  padding-top: 55px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const StatusText = styled.Text`
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const DashArea = styled.ScrollView`
  flex: 1;
`;

const InfoCard = styled.View`
  background-color: ${colors.surface};
  margin: 20px;
  padding: 25px;
  border-radius: 24px;
  align-items: center;
  border-width: 1px;
  borderColor: ${colors.border};
  elevation: 6;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.1;
  shadow-radius: 8px;
`;

const Label = styled.Text`
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
`;

const Value = styled.Text`
  color: ${colors.text};
  font-size: 46px;
  font-weight: 900;
`;

const StatsGrid = styled.View`
  flex-direction: row;
  width: 100%;
  margin-top: 30px;
  border-top-width: 1px;
  border-top-color: rgba(255,255,255,0.05);
  padding-top: 25px;
`;

const Stat = styled.View`
  flex: 1;
  align-items: center;
`;

const StatText = styled.Text`
  color: ${colors.text};
  font-size: 20px;
  font-weight: 800;
`;

const ActionFooter = styled.View`
  padding: 20px 25px 45px 25px;
  background-color: ${colors.background};
  border-top-width: 1px;
  border-top-color: ${colors.border};
`;

const SecondaryButton = styled.TouchableOpacity`
  background-color: #1B2740;
  height: 64px;
  border-radius: 18px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
`;

const WaitingButton = styled.TouchableOpacity`
  background-color: ${props => props.active ? '#F59E0B' : '#1B2740'};
  height: 64px;
  border-radius: 18px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
`;

const PrimaryButton = styled.TouchableOpacity`
  background-color: ${props => props.color || '#22C55E'};
  height: 74px;
  border-radius: 20px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  elevation: 5;
`;

const TaximeterScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const ride = route.params?.ride || null;
    const isNoDestinationRide = Boolean(ride?.isNoDestination) || String(ride?.destino || '').toLowerCase().includes('sem destino');
    const resumeInitialStatus = route.params?.initialStatus || 'WAY_TO_ORIGIN';

    // Endereços exibidos. Às vezes o passageiro salva a coordenada crua no campo
    // de endereço (ex.: "-14.43,-54.05"); neste caso fazemos reverse-geocode para
    // mostrar o endereço legível em vez dos números.
    const GENERIC_ORIGIN = 'Localização atual';
    const GENERIC_DEST = 'Destino';
    const [originAddress, setOriginAddress] = useState(
        () => (isCoordinateText(ride?.origem) ? GENERIC_ORIGIN : (ride?.origem || GENERIC_ORIGIN))
    );
    const [destAddress, setDestAddress] = useState(
        () => (isCoordinateText(ride?.destino) ? GENERIC_DEST : (ride?.destino || GENERIC_DEST))
    );

    useEffect(() => {
        let active = true;

        const resolveAddress = async (text, coordObj, fallback, setter) => {
            const isGeneric = !text || text === fallback;
            // Já é um endereço textual de verdade: usa direto.
            if (text && !isCoordinateText(text) && !isGeneric) {
                setter(text);
                return;
            }
            // Coordenada (do texto ou dos campos lat/lng): reverte para endereço.
            const coords =
                (coordObj && Number.isFinite(coordObj.latitude) && Number.isFinite(coordObj.longitude))
                    ? coordObj
                    : parseLatLngText(text);
            if (coords) {
                try {
                    const [geo] = await Location.reverseGeocodeAsync(coords);
                    const addr = formatReverseGeocode(geo);
                    if (active && addr) {
                        setter(addr);
                        return;
                    }
                } catch (e) {
                    // sem rede/sem geocoder: cai no fallback abaixo
                }
            }
            if (active) setter(text && !isCoordinateText(text) ? text : fallback);
        };

        resolveAddress(ride?.origem, ride?.origin, GENERIC_ORIGIN, setOriginAddress);
        if (!isNoDestinationRide) {
            resolveAddress(ride?.destino, ride?.destination, GENERIC_DEST, setDestAddress);
        }

        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ride]);

    const [status, setStatus] = useState(resumeInitialStatus);
    const [seconds, setSeconds] = useState(0);
    const [waitingSeconds, setWaitingSeconds] = useState(0);
    const [isWaiting, setIsWaiting] = useState(false);
    const [distance, setDistance] = useState(() => {
        const km = route.params?.initialKm;
        return Number.isFinite(km) ? km : 0.0;
    });
    const [currentPrice, setCurrentPrice] = useState(() => {
        if (route.params?.initialPrice != null) {
            return Number(route.params.initialPrice) || 0;
        }
        return parseFloat(String(ride?.taxa || '0.00').replace(',', '.'));
    });
    const [actionLoading, setActionLoading] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [showNavModal, setShowNavModal] = useState(false);
    
    const [lastCoords, setLastCoords] = useState(null);
    // Tarifas: começam com o que veio na corrida (ou default) e são SOBRESCRITAS
    // pelas tarifas do PAINEL (API por cidade) no efeito abaixo.
    const [ratePerKm, setRatePerKm] = useState(parseFloat(String(ride?.taxa_km || '1.20').replace(',', '.')));
    const [ratePerMin, setRatePerMin] = useState(parseFloat(String(ride?.taxa_minuto || '0.25').replace(',', '.')));
    const [baseFare, setBaseFare] = useState(0); // bandeirada (tx_minima) do painel
    const [gpsAccuracy, setGpsAccuracy] = useState(0);

    // Busca as tarifas do PAINEL (tabela taximetro) pela cidade do motorista.
    // Aplica a bandeirada (tx_minima) como valor inicial do taxímetro livre.
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const session = await getSession();
                const cid = session?.cidade_id || ride?.cidade_id || 1;
                let tx = null;
                try {
                    const r = await api.driver.getTaximetro(cid);
                    if (r?.data && r.data.tx_km != null) tx = r.data;
                } catch (_) {}
                // Fallback: tarifas salvas na sessão no login
                if (!tx && session && session.taxi_tx_km != null) {
                    tx = { tx_km: session.taxi_tx_km, tx_minuto: session.taxi_tx_minuto, tx_minima: session.taxi_tx_minima };
                }
                if (!active || !tx) return;
                const km = parseFloat(String(tx.tx_km ?? '').replace(',', '.'));
                const mn = parseFloat(String(tx.tx_minuto ?? '').replace(',', '.'));
                const base = parseFloat(String(tx.tx_minima ?? '').replace(',', '.'));
                if (Number.isFinite(km) && km > 0) setRatePerKm(km);
                if (Number.isFinite(mn) && mn > 0) setRatePerMin(mn);
                if (Number.isFinite(base) && base >= 0) {
                    setBaseFare(base);
                    // Taxímetro livre (sem destino): começa na bandeirada, não em R$ 0,00.
                    if (isNoDestinationRide && route.params?.initialPrice == null && base > 0) {
                        setCurrentPrice(prev => (prev < base ? base : prev));
                    }
                }
            } catch (_) {}
        })();
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const gpsOpacity = useRef(new Animated.Value(0.4)).current;
    const statusRef = useRef(status);
    const lastCoordsRef = useRef(null);
    const currentPriceRef = useRef(currentPrice);
    const isFinalizingRef = useRef(false);
    const isMountedRef = useRef(true);
    const isWaitingRef = useRef(isWaiting);
    const positionWatcherRef = useRef(null);

    useEffect(() => {
        isWaitingRef.current = isWaiting;
    }, [isWaiting]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        currentPriceRef.current = currentPrice;
    }, [currentPrice]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (positionWatcherRef.current) {
                safeRemoveLocationSubscription(positionWatcherRef.current);
                positionWatcherRef.current = null;
            }
            if (!IS_EXPO_GO) {
                stopBackgroundTracking();
            }
        };
    }, []);

    const setDriverOnlineAfterRide = async (session) => {
        if (!session?.id) return;
        try {
            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            await api.driver.updateLocation(
                session.id,
                1,
                loc.coords.latitude,
                loc.coords.longitude
            );
        } catch (e) {
            console.warn('Erro ao marcar motorista online após corrida:', e);
        }
    };

    const goToDriverHome = useCallback(async () => {
        await saveSession({ activeRideId: null, taximeterStatus: null }).catch(() => {});
        const session = await getSession();
        if (session?.id) {
            await driverRideMonitor.updateConfig({
                sessionId: session.id,
                cidadeId: session.cidade_id || 1,
                isAvailable: true,
                isOnRide: false,
                rejectedRides: [],
            });
            await setDriverOnlineAfterRide(session);
        }
        navigation.dispatch(
            CommonActions.reset({
                index: 0,
                routes: [{ name: 'DriverHome' }],
            })
        );
    }, [navigation]);

    const confirmLeaveTaximeter = useCallback(() => {
        Alert.alert(
            'Sair do taxímetro',
            ride?.id === 'manual'
                ? 'Deseja voltar ao painel inicial?'
                : 'A corrida ainda está em andamento. Deseja voltar ao painel?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Voltar', onPress: goToDriverHome },
            ]
        );
    }, [ride?.id, goToDriverHome]);

    useEffect(() => {
        if (Platform.OS !== 'android' || !ride?.id) return undefined;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            confirmLeaveTaximeter();
            return true;
        });
        return () => sub.remove();
    }, [ride?.id, confirmLeaveTaximeter]);

    useEffect(() => {
        if (!ride?.id || ride.id === 'manual') return;
        if (status === 'FINISHED') {
            saveSession({ activeRideId: null, taximeterStatus: null }).catch(() => {});
            return;
        }
        saveSession({ activeRideId: ride.id, taximeterStatus: status }).catch(() => {});
    }, [status, ride?.id]);

    useEffect(() => {
        if (!ride?.id) return;

        Animated.loop(
            Animated.sequence([
                Animated.timing(gpsOpacity, { toValue: 1, duration: 1200, useNativeDriver: true }),
                Animated.timing(gpsOpacity, { toValue: 0.4, duration: 1200, useNativeDriver: true })
            ])
        ).start();

        let mounted = true;

        const startTracking = async () => {
            const { status: perm } = await Location.requestForegroundPermissionsAsync();
            if (perm !== 'granted' || !mounted) return;

            const watcher = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, distanceInterval: 10 },
                (location) => {
                    if (!isMountedRef.current || isFinalizingRef.current) return;

                    setGpsAccuracy(location.coords.accuracy || 0);

                    if (statusRef.current === 'IN_PROGRESS') {
                        const prev = lastCoordsRef.current;
                        if (prev) {
                            const d = getDistance(
                                prev.latitude, prev.longitude,
                                location.coords.latitude, location.coords.longitude
                            );
                            const accuracy = location.coords.accuracy || 0;
                            // O watcher dispara a cada ~10m (distanceInterval:10). O limiar antigo
                            // (20m) era MAIOR que o passo, então a distância nunca acumulava.
                            // Agora aceita passos reais (>4m), descarta saltos de GPS (>600m) e
                            // relaxa a precisão (zona rural costuma ter accuracy pior).
                            if (d > 0.004 && d < 0.6 && (accuracy === 0 || accuracy < 50)) {
                                setDistance(prevDist => prevDist + d);
                                if (isNoDestinationRide) {
                                    setCurrentPrice(prevPrice => prevPrice + (d * ratePerKm));
                                }
                            }
                        }
                        lastCoordsRef.current = location.coords;
                        setLastCoords(location.coords);
                    }
                }
            );

            if (mounted) {
                positionWatcherRef.current = watcher;
            } else {
                safeRemoveLocationSubscription(watcher);
            }
        };

        startTracking();
        if (!IS_EXPO_GO) {
            startBackgroundTracking();
        }

        return () => {
            mounted = false;
            if (positionWatcherRef.current) {
                safeRemoveLocationSubscription(positionWatcherRef.current);
                positionWatcherRef.current = null;
            }
        };
    }, [ride?.id, isNoDestinationRide, ratePerKm]);

    // Timer secundário para incrementar valor por minuto (apenas se for corrida sem destino definido)
    useEffect(() => {
        let priceTimer;
        if ((status === 'IN_PROGRESS' || isWaiting) && isNoDestinationRide) {
            priceTimer = setInterval(() => {
                setCurrentPrice(prev => prev + (ratePerMin / 60)); // Adiciona fração de minuto a cada segundo
            }, 1000);
        }
        return () => clearInterval(priceTimer);
    }, [status, isWaiting, isNoDestinationRide, ratePerMin]);

    // SINCRO EM TEMPO REAL: Heartbeat que atualiza a Taxa no Servidor
    useEffect(() => {
        if (!ride?.id || ride.id === 'manual') return undefined;

        const syncInterval = setInterval(async () => {
            if (isFinalizingRef.current) return;
            if (statusRef.current !== 'IN_PROGRESS' && !isWaitingRef.current) return;

            try {
                const session = await getSession();
                if (!session) return;

                await api.driver.updateRideStatus(
                    ride.id,
                    statusRef.current === 'IN_PROGRESS' ? 3 : 2,
                    session.cidade_id || 1,
                    currentPriceRef.current.toFixed(2)
                );
            } catch (e) {}
        }, 10000);

        return () => clearInterval(syncInterval);
    }, [ride?.id]);

    const startBackgroundTracking = async () => {
        if (IS_EXPO_GO) return;
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        if (fg !== 'granted') return;
        try {
            await Location.requestBackgroundPermissionsAsync();
        } catch (e) {}
        try {
            await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: 8000,
                distanceInterval: 5,
                foregroundService: {
                    notificationTitle: 'Corrida em Curso',
                    notificationBody: 'Rastreando posição para o passageiro.',
                    notificationColor: colors.primary,
                },
                pausesUpdatesAutomatically: false,
            });
        } catch (e) {}
    };

    const stopBackgroundTracking = async () => {
        if (IS_EXPO_GO) return;
        try {
            const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TRACKING_TASK);
            if (registered) await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
        } catch (e) {}
    };

    useEffect(() => {
        let timer = null;
        if (status === 'IN_PROGRESS' && !isWaiting) {
            timer = setInterval(() => setSeconds(s => s + 1), 1000);
        } else if (isWaiting) {
            timer = setInterval(() => setWaitingSeconds(s => s + 1), 1000);
        }
        return () => timer && clearInterval(timer);
    }, [status, isWaiting]);

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const isValidCoordinate = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng);

    const toggleWaiting = async () => {
        setActionLoading(true);
        try {
            if (!isWaiting) {
                await api.driver.startWaiting(ride.id);
                setIsWaiting(true);
            } else {
                await api.driver.stopWaiting(ride.id);
                setIsWaiting(false);
            }
        } catch (e) {
            Alert.alert('Erro', 'Falha ao atualizar status de espera.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleAction = async () => {
        let nextStatus = status;
        let apiCode = 0;

        if (status === 'WAY_TO_ORIGIN') {
            nextStatus = 'ARRIVED';
            apiCode = 2;
        } else if (status === 'ARRIVED') {
            if (isWaiting) {
                Alert.alert('Atenção', 'Finalize o tempo de espera antes de iniciar a viagem.');
                return;
            }
            nextStatus = 'IN_PROGRESS';
            apiCode = 3;
        } else if (status === 'IN_PROGRESS') {
            Alert.alert('Encerrar Viagem', 'O passageiro já desembarcou?', [
                { text: 'Não', style: 'cancel' },
                { text: 'Sim, Finalizar', onPress: finalizeRide }
            ]);
            return;
        }

        try {
            setActionLoading(true);
            const session = await getSession();
            // Corrida manual (taxímetro avulso) não tem registro no servidor — muda só local.
            if (ride?.id && ride.id !== 'manual') {
                await api.driver.updateRideStatus(ride.id, apiCode, session?.cidade_id || 1);
            }
            setStatus(nextStatus);
        } catch (e) {
            Alert.alert('Falha', 'Erro ao atualizar status.');
        } finally {
            setActionLoading(false);
        }
    };

    const resetRideSession = async () => {
        await stopBackgroundTracking();
        await saveSession({ activeRideId: null, taximeterStatus: null });
        const session = await getSession();
        if (session?.id) {
            await driverRideMonitor.updateConfig({
                sessionId: session.id,
                cidadeId: session.cidade_id || 1,
                isAvailable: true,
                isOnRide: false,
                rejectedRides: [],
            });
            await driverRideMonitor.clearPendingRide();
        }
    };

    const handleCancelRide = () => {
        Alert.alert(
            'Cancelar corrida',
            'Tem certeza? O passageiro será avisado e a corrida voltará para a fila.',
            [
                { text: 'Não', style: 'cancel' },
                {
                    text: 'Sim, cancelar',
                    style: 'destructive',
                    onPress: confirmCancelRide,
                },
            ]
        );
    };

    const confirmCancelRide = async () => {
        if (cancelLoading || actionLoading || isFinalizingRef.current) return;
        setCancelLoading(true);
        try {
            if (ride.id !== 'manual') {
                await api.driver.cancelRideByDriver(ride.id);
            }
            if (positionWatcherRef.current) {
                safeRemoveLocationSubscription(positionWatcherRef.current);
                positionWatcherRef.current = null;
            }
            await resetRideSession();
            const session = await getSession();
            await setDriverOnlineAfterRide(session);
            goToDriverHome();
        } catch (e) {
            Alert.alert('Erro', 'Não foi possível cancelar a corrida. Tente novamente.');
        } finally {
            if (isMountedRef.current) {
                setCancelLoading(false);
            }
        }
    };

    const finalizeRide = async () => {
        if (!ride?.id) {
            Alert.alert('Corrida inválida', 'Nenhuma corrida ativa encontrada para finalizar.');
            return;
        }
        if (isFinalizingRef.current) return;

        isFinalizingRef.current = true;
        setActionLoading(true);

        let session = null;
        let finishedOk = false;

        try {
            session = await getSession();
            const totalSeconds = Number(seconds || 0) + Number(waitingSeconds || 0);
            const tempoMinutos = Math.max(1, Math.round(totalSeconds / 60));
            const kmRodados = Math.max(0.01, Number(distance || 0));
            let enderecoFim = String(ride?.endereco_fim_txt || ride?.endereco_fim || ride?.destino || '').trim();
            let latFim = null;
            let lngFim = null;
            // Corrida sem destino: captura o local REAL do fim (GPS + reverse geocode)
            if (isNoDestinationRide) {
                try {
                    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                    latFim = loc.coords.latitude;
                    lngFim = loc.coords.longitude;
                    let addr = '';
                    try {
                        const geo = await Location.reverseGeocodeAsync({ latitude: latFim, longitude: lngFim });
                        if (geo && geo[0]) {
                            const g = geo[0];
                            addr = [g.street, g.name && g.name !== g.street ? g.name : null, g.district, g.city]
                                .filter(Boolean).join(', ');
                        }
                    } catch (_) {}
                    if (!addr) addr = `${latFim.toFixed(5)}, ${lngFim.toFixed(5)}`;
                    enderecoFim = `Sem destino • ${addr}`;
                } catch (_) {
                    enderecoFim = 'Sem destino • (local não capturado)';
                }
            }
            if (!enderecoFim) enderecoFim = 'Destino não informado';
            const priceFromRef = Number(currentPriceRef.current);
            const priceFromRide = parseFloat(String(ride?.taxa || '0').replace(',', '.'));
            const finalPrice = Number.isFinite(priceFromRef) && priceFromRef >= 0
                ? priceFromRef
                : (Number.isFinite(priceFromRide) ? priceFromRide : 0);

            if (ride.id !== 'manual') {
                await api.driver.finishRide({
                    id_motorista: session?.id,
                    id_cidade: session?.cidade_id || 1,
                    id_corrida: ride.id,
                    taxa: finalPrice.toFixed(2),
                    tempo: String(tempoMinutos),
                    km: kmRodados.toFixed(2),
                    endereco_fim: enderecoFim || 'Destino não informado',
                    lat_fim: latFim != null ? String(latFim) : '',
                    lng_fim: lngFim != null ? String(lngFim) : '',
                });
            }

            finishedOk = true;

            if (positionWatcherRef.current) {
                safeRemoveLocationSubscription(positionWatcherRef.current);
                positionWatcherRef.current = null;
            }
            await stopBackgroundTracking();
            await saveSession({ activeRideId: null, taximeterStatus: null });

            if (session?.id) {
                await driverRideMonitor.updateConfig({
                    sessionId: session.id,
                    cidadeId: session.cidade_id || 1,
                    isAvailable: true,
                    isOnRide: false,
                    rejectedRides: [],
                });
                await driverRideMonitor.clearPendingRide();
                await setDriverOnlineAfterRide(session);
            }

            if (isMountedRef.current) {
                setStatus('FINISHED');
            }
        } catch (e) {
            isFinalizingRef.current = false;
            const msg = e?.message?.includes('confirmou')
                ? e.message
                : 'Falha ao finalizar. Verifique a conexão e tente novamente.';
            Alert.alert('Erro', msg);
        } finally {
            if (finishedOk && session?.id) {
                await setDriverOnlineAfterRide(session).catch(() => {});
            }
            if (isMountedRef.current) {
                setActionLoading(false);
            }
        }
    };

    const openMap = (app) => {
        setShowNavModal(false);
        if (status === 'IN_PROGRESS' && isNoDestinationRide) {
            Alert.alert('Corrida sem destino', 'Defina o destino com o passageiro durante a corrida. A navegação para destino final fica indisponível neste modo.');
            return;
        }
        const dest = (status === 'WAY_TO_ORIGIN' || status === 'ARRIVED') ? ride.origin : ride.destination;
        const lat = Number(dest?.latitude);
        const lng = Number(dest?.longitude);
        if (!isValidCoordinate(lat, lng)) {
            Alert.alert('Coordenadas inválidas', 'Esta corrida não possui latitude/longitude válidas para navegação.');
            return;
        }

        const wazeApp = `waze://?ll=${lat},${lng}&navigate=yes`;
        const wazeWeb = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
        const googleIos = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
        const googleAndroid = `google.navigation:q=${lat},${lng}&mode=d`;
        // URL universal do Google Maps: abre o app (via app links) ou o navegador.
        // Nunca falha por app ausente — fallback final garantido.
        const googleUniversal = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

        // Tenta o app preferido; se não der, cai no fallback web garantido.
        const openWithFallback = async (preferred, fallback) => {
            try {
                const ok = await Linking.canOpenURL(preferred);
                await Linking.openURL(ok ? preferred : fallback);
            } catch (e) {
                try {
                    await Linking.openURL(fallback);
                } catch (e2) {
                    Alert.alert('Erro', 'Não foi possível abrir o aplicativo de navegação.');
                }
            }
        };

        if (app === 'waze') {
            openWithFallback(wazeApp, wazeWeb);
            return;
        }

        // Google Maps: scheme nativo por plataforma -> universal web.
        openWithFallback(Platform.OS === 'ios' ? googleIos : googleAndroid, googleUniversal);
    };

    if (!ride?.id) {
        return (
            <Container style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                <Icon name="error-outline" size={56} color="#F59E0B" />
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 18, textAlign: 'center' }}>
                    Nenhuma corrida ativa no taxímetro
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 10, textAlign: 'center' }}>
                    Aceite uma corrida primeiro para iniciar o fluxo.
                </Text>
                <PrimaryButton color="#1B2740" style={{ width: '100%', marginTop: 30 }} onPress={goToDriverHome}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>VOLTAR</Text>
                </PrimaryButton>
            </Container>
        );
    }

    if (status === 'FINISHED') {
        return (
            <Container style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                <Icon name="check-circle" size={60} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900', marginVertical: 20 }}>CONCLUÍDO</Text>
                <Value>R$ {currentPrice.toFixed(2).replace('.', ',')}</Value>
                <PrimaryButton color="#22C55E" style={{ width: '100%', marginTop: 40 }} onPress={goToDriverHome}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>PRÓXIMA CORRIDA</Text>
                </PrimaryButton>
            </Container>
        );
    }

    return (
        <Container>
            <StatusBar barStyle="light-content" />
            <StatusHeader color={isWaiting ? '#F59E0B' : (status === 'WAY_TO_ORIGIN' ? '#243049' : (status === 'ARRIVED' ? '#F59E0B' : '#22C55E'))}>
                <TouchableOpacity onPress={confirmLeaveTaximeter}>
                    <Icon name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <StatusText style={{ color: '#fff' }}>
                    {isWaiting ? 'EM ESPERA ATIVA' : status === 'WAY_TO_ORIGIN' ? 'A CAMINHO' : status === 'ARRIVED' ? 'NO LOCAL' : 'EM VIAGEM'}
                </StatusText>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {ride?.id !== 'manual' && (
                        <TouchableOpacity 
                            style={{ marginRight: 15 }} 
                            onPress={() => navigation.navigate('ChatScreen', { rideId: ride?.id, isDriver: true, otherUser: { nome: ride?.nome_cliente || 'Passageiro', foto: ride?.img_user || '' } })}
                        >
                            <Icon name="chat" size={24} color="#fff" />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setShowNavModal(true)}>
                        <Icon name="navigation" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            </StatusHeader>

            <DashArea>
                <View style={{ padding: 25, flexDirection: 'row', alignItems: 'center' }}>
                    <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 10, opacity: gpsOpacity }} />
                    <Text style={{ color: '#64748b', fontSize: 12, fontWeight: 'bold' }}>SINCRO GPS ATIVA</Text>
                </View>

                <InfoCard>
                    <Label>VALOR ATUAL</Label>
                    <Value>R$ {currentPrice.toFixed(2).replace('.', ',')}</Value>
                    
                    <StatsGrid>
                        <Stat>
                            <Label>TEMPO</Label>
                            <StatText>{formatTime(seconds)}</StatText>
                        </Stat>
                        <Stat>
                            <Label>ESPERA</Label>
                            <StatText style={{ color: isWaiting ? '#F59E0B' : colors.text }}>{formatTime(waitingSeconds)}</StatText>
                        </Stat>
                        <Stat>
                            <Label>DISTÂNCIA</Label>
                            <StatText>{distance.toFixed(1)} KM</StatText>
                        </Stat>
                    </StatsGrid>
                </InfoCard>

                {/* ENDEREÇOS DA VIAGEM */}
                <View style={{ marginHorizontal: 20, marginBottom: 30, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginRight: 15 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: '#64748b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>PARTIDA</Text>
                            <Text style={{ color: colors.text, fontSize: 14, fontWeight: 'bold', marginTop: 2 }}>{originAddress}</Text>
                        </View>
                    </View>
                    <View style={{ width: 1, height: 15, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 3, marginBottom: 15 }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 15 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: '#64748b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>DESTINO FINAL</Text>
                            <Text style={{ color: colors.text, fontSize: 14, fontWeight: 'bold', marginTop: 2 }}>
                                {isNoDestinationRide ? 'Sem destino definido (A combinar)' : (destAddress || 'A definir durante trajeto')}
                            </Text>
                        </View>
                    </View>
                </View>
            </DashArea>

            <ActionFooter>
                {(status === 'ARRIVED' || isWaiting) && (
                    <WaitingButton active={isWaiting} onPress={toggleWaiting} disabled={actionLoading || cancelLoading}>
                        {actionLoading ? <ActivityIndicator color="#fff" /> : (
                            <>
                                <Icon name="timer" size={24} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>
                                    {isWaiting ? 'PARAR ESPERA' : 'INICIAR ESPERA'}
                                </Text>
                            </>
                        )}
                    </WaitingButton>
                )}

                <PrimaryButton 
                    disabled={actionLoading || cancelLoading}
                    color={status === 'IN_PROGRESS' ? '#EF4444' : '#22C55E'} 
                    onPress={handleAction}
                >
                    {actionLoading ? <ActivityIndicator color="#fff" /> : (
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>
                            {status === 'WAY_TO_ORIGIN' && 'CHEGUEI NO LOCAL'}
                            {status === 'ARRIVED' && 'INICIAR VIAGEM'}
                            {status === 'IN_PROGRESS' && 'FINALIZAR CORRIDA'}
                        </Text>
                    )}
                </PrimaryButton>

                {ride?.id !== 'manual' && (
                    <TouchableOpacity
                        onPress={handleCancelRide}
                        disabled={cancelLoading || actionLoading}
                        style={{ marginTop: 14, alignItems: 'center', paddingVertical: 8 }}
                    >
                        {cancelLoading ? (
                            <ActivityIndicator color="#EF4444" />
                        ) : (
                            <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '800' }}>
                                Cancelar corrida
                            </Text>
                        )}
                    </TouchableOpacity>
                )}
            </ActionFooter>
            
            <Modal visible={showNavModal} transparent animationType="slide">
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }} onPress={() => setShowNavModal(false)}>
                    <View style={{ backgroundColor: '#131C2E', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 35 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: '#F1F5F9', marginBottom: 25, textAlign: 'center' }}>NAVEGAR COM</Text>
                        <TouchableOpacity style={{ backgroundColor: '#1B2740', height: 74, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, marginBottom: 15 }} onPress={() => openMap('waze')}>
                            <Icon name="navigation" size={28} color="#05c8f8" />
                            <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 20, color: '#F1F5F9' }}>Waze</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor: '#1B2740', height: 74, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25 }} onPress={() => openMap('google')}>
                            <Icon name="map" size={28} color="#4285F4" />
                            <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 20, color: '#F1F5F9' }}>Google Maps</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowNavModal(false)} style={{ marginTop: 25, alignItems: 'center' }}>
                            <Text style={{ color: '#64748b', fontSize: 16, fontWeight: 'bold' }}>FECHAR</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </Container>
    );
};

export default TaximeterScreen;
