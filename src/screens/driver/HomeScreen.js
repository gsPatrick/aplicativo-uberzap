import React, { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StatusBar, SafeAreaView, Switch, TouchableOpacity, Animated, Dimensions, Platform, LayoutAnimation, UIManager, ActivityIndicator, Modal, Alert, AppState } from 'react-native';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import alertsService from '../../services/alertsService';
import driverRideMonitor from '../../services/driverRideMonitor';
import { getSession, saveSession, clearSession } from '../../utils/session';
import {
    triggerRideAlertNotification,
    cancelRideAlertNotification,
} from '../../utils/notifications';
import { requestDriverPermissionsFlow, ensureDriverCanGoOnline } from '../../utils/driverPermissions';
import { startRideAlertSound, stopRideAlertSound, isRideAlertSoundPlaying } from '../../utils/rideAlertSound';
import { wakeScreenForRideAlert } from '../../utils/androidOverlay';
import {
    parseCoordinate,
    isNoDestinationRide,
    buildTaximeterRide,
    serverStatusToTaximeterStatus,
    animateMapToCoords,
} from '../../utils/driverRideUtils';
import { safeRemoveLocationSubscriptionAsync } from '../../utils/locationSubscription';
import { startRideForegroundService, stopRideForegroundService } from '../../services/rideForegroundService';
import { syncPushTokenWithServer } from '../../services/pushSync';
import { subscribeRideRequest, STORAGE_KEYS as RIDE_UI_KEYS } from '../../services/rideRequestController';
import Constants from 'expo-constants';

// Fallback for MapView
let MapView = View;
let PROVIDER_GOOGLE = null;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
} catch (e) {}

const { width, height } = Dimensions.get('window');

const Container = styled.View`
  flex: 1;
  background-color: ${colors.background};
`;

const StatusHeader = styled(LinearGradient)`
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  border-bottom-left-radius: 30px;
  border-bottom-right-radius: 30px;
  elevation: 6;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.1;
  shadow-radius: 8px;
`;

const TopRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const OnlineToggle = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  background-color: ${props => props.active ? 'rgba(58, 181, 107, 0.1)' : colors.surface};
  padding: 8px 16px;
  border-radius: 25px;
  border-width: 1px;
  border-color: ${props => props.active ? colors.primary : colors.border};
`;

const GlowDot = styled(Animated.View)`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${props => props.active ? colors.primary : '#ff4444'};
  margin-right: 8px;
`;

const EarningsCard = styled.View`
  background-color: ${colors.white};
  margin: ${spacing.md}px;
  padding: 20px;
  border-radius: 20px;
  border-width: 1px;
  border-color: ${colors.border};
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  elevation: 4;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.05;
  shadow-radius: 4px;
`;

const MapContainer = styled.View`
  flex: 1;
  background-color: ${colors.surface};
  overflow: hidden;
`;

const BottomActions = styled.View`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: transparent;
  padding: ${spacing.md}px;
  padding-bottom: ${Platform.OS === 'ios' ? 40 : 20}px;
`;

const FloatingButton = styled.TouchableOpacity`
  width: 60px;
  height: 60px;
  border-radius: 30px;
  background-color: ${props => props.color || colors.white};
  justify-content: center;
  align-items: center;
  elevation: 8;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.15;
  shadow-radius: 5px;
  border-width: 1px;
  border-color: ${colors.border};
`;

const RideAlertContainer = styled(Animated.View)`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.2);
  justify-content: flex-end;
  align-items: stretch;
  z-index: 1000;
`;

const AlertCard = styled(Animated.View)`
  width: 100%;
  background-color: ${colors.white};
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  padding: 18px;
  align-items: stretch;
  border-width: 1px;
  border-color: ${colors.border};
`;

const TimerSemicircle = styled.View`
  width: 100px;
  height: 100px;
  border-radius: 50px;
  border-width: 3px;
  border-color: ${colors.primary};
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
  background-color: rgba(58, 181, 107, 0.1);
`;

const Overlay = styled.TouchableOpacity`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0,0,0,0.5);
  z-index: 10000;
`;

const DriverHomeScreen = () => {
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuAnim = useRef(new Animated.Value(-width * 0.8)).current;
    const mapRef = useRef(null);
    
    const [isAvailable, setIsAvailable] = useState(true);
    const [isOnRide, setIsOnRide] = useState(false);
    const [newRide, setNewRide] = useState(null);
    const newRideRef = useRef(null);
    const [alertsHistory, setAlertsHistory] = useState([]);
    const [driver, setDriver] = useState({ nome: 'Motorista', rating: '5.0', nivel: 'Platina', cidade_id: 1 });
    const [sessionId, setSessionId] = useState(null);
    const [earnings, setEarnings] = useState('0,00');
    const [alertMessage, setAlertMessage] = useState('');
    const [showAlertModal, setShowAlertModal] = useState(false);
    const [isAccepting, setIsAccepting] = useState(false);
    const [rejectedRides, setRejectedRides] = useState([]);
    const [resumeError, setResumeError] = useState('');
    const resumeInFlightRef = useRef(false);
    const pulseLoopRef = useRef(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const timerAnim = useRef(new Animated.Value(15)).current;
    const alertAnim = useRef(new Animated.Value(height)).current;
    const alertOpacity = useRef(new Animated.Value(0)).current;
    const alertScale = useRef(new Animated.Value(0.98)).current;
    const [timerValue, setTimerValue] = useState(15);

    const hasActiveRide = (activeRideId) => {
        if (activeRideId == null || activeRideId === '') return false;
        return String(activeRideId) !== 'manual';
    };

    const syncDriverOnlineIfStuck = useCallback(async (session, profileOnline) => {
        if (!session?.id) return;
        const onlineVal = Number(profileOnline);
        const onRide = hasActiveRide(session.activeRideId);
        if (onlineVal === 2 && !onRide) {
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
            } catch (syncErr) {
                console.warn('Sync online preso (2→1):', syncErr);
            }
        }
    }, []);

    const syncSessionRideState = useCallback(async () => {
        const session = await getSession();
        if (!session) return;

        const onRide = hasActiveRide(session.activeRideId);
        setIsOnRide(onRide);
        if (!onRide) {
            setResumeError('');
        }

        if (!onRide && session.activeRideId != null) {
            await saveSession({ activeRideId: null, taximeterStatus: null });
        }

        await driverRideMonitor.updateConfig({
            sessionId: session.id,
            cidadeId: session.cidade_id || driver.cidade_id || 1,
            isOnRide: onRide,
            rejectedRides,
        });
    }, [driver.cidade_id, rejectedRides]);

    const resumeActiveRideIfNeeded = useCallback(async (force = false) => {
        if (resumeInFlightRef.current) return;
        if (newRideRef.current && !force) return;

        const navState = navigation.getState?.();
        const currentRoute = navState?.routes?.[navState.index]?.name;
        if (currentRoute === 'Taximeter' && !force) return;

        const session = await getSession();
        if (!session?.id) return;

        const shouldTry =
            force ||
            hasActiveRide(session.activeRideId);

        if (!shouldTry) return;

        resumeInFlightRef.current = true;
        setResumeError('');

        try {
            const response = await api.driver.getOpenRides(session.id);
            const rides = (response.data || []).filter((r) => {
                const s = Number(r.status);
                return s >= 1 && s <= 3;
            });

            if (!rides.length) {
                if (session.activeRideId) {
                    await saveSession({ activeRideId: null, taximeterStatus: null });
                }
                setIsOnRide(false);
                setResumeError('');
                setIsAvailable(true);
                await driverRideMonitor.updateConfig({
                    sessionId: session.id,
                    cidadeId: session.cidade_id || driver.cidade_id || 1,
                    isAvailable: true,
                    isOnRide: false,
                    rejectedRides,
                });
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
                } catch (syncErr) {
                    console.warn('Sync online após corrida encerrada:', syncErr);
                }
                return;
            }

            const preferredId = session.activeRideId;
            const rawRide =
                rides.find((r) => String(r.id) === String(preferredId)) || rides[0];

            if (!rawRide || Number(rawRide.status) >= 4) {
                await saveSession({ activeRideId: null, taximeterStatus: null });
                setIsOnRide(false);
                setResumeError('');
                return;
            }

            const rideData = buildTaximeterRide(rawRide);
            if (!rideData) {
                await saveSession({ activeRideId: null, taximeterStatus: null });
                setIsOnRide(false);
                setResumeError('');
                return;
            }

            await saveSession({ activeRideId: rawRide.id });
            setIsOnRide(true);
            await driverRideMonitor.updateConfig({
                sessionId: session.id,
                cidadeId: session.cidade_id || driver.cidade_id || 1,
                isAvailable: true,
                isOnRide: true,
                rejectedRides,
            });

            navigation.replace('Taximeter', {
                ride: rideData,
                resume: true,
                initialStatus: serverStatusToTaximeterStatus(rawRide.status),
                initialPrice: parseFloat(String(rawRide.taxa || '0').replace(',', '.')) || 0,
                initialKm: parseFloat(String(rawRide.km || '0').replace(',', '.')) || 0,
            });
        } catch (e) {
            console.warn('Erro ao retomar corrida:', e);
            setResumeError('Não foi possível retomar a corrida. Toque em "Retomar corrida".');
            setIsOnRide(true);
        } finally {
            resumeInFlightRef.current = false;
        }
    }, [navigation, driver.cidade_id, rejectedRides]);

    const permissionsAskedRef = useRef(false);

    useFocusEffect(
        useCallback(() => {
            if (permissionsAskedRef.current) return undefined;
            permissionsAskedRef.current = true;
            requestDriverPermissionsFlow().catch(() => {});
            return undefined;
        }, [])
    );

    useEffect(() => {
        const loadInitial = async () => {
            const session = await getSession();
            if (session) {
                setSessionId(session.id);
                setIsOnRide(hasActiveRide(session.activeRideId));
                try {
                    const profile = await api.driver.getDriverProfile(session.id);
                    if (profile.data) {
                        const cid = profile.data.cidade_id || 1;
                        const onlineVal = Number(profile.data.online);
                        const online = onlineVal === 1 || onlineVal === 2;
                        setIsAvailable(online);
                        await syncDriverOnlineIfStuck(session, onlineVal);
                        setDriver({
                            nome: profile.data.nome || 'Motorista',
                            rating: profile.data.nota || '5.0',
                            nivel: profile.data.nivel || 'Ouro',
                            cidade_id: cid
                        });
                        await driverRideMonitor.updateConfig({
                            sessionId: session.id,
                            cidadeId: cid,
                            isAvailable: online,
                            isOnRide: hasActiveRide(session.activeRideId),
                            rejectedRides: [],
                        });
                    }
                    // Carrega ganhos reais
                    const earnResponse = await api.driver.getDriverEarnings(session.id);
                    if (earnResponse.data) setEarnings(earnResponse.data);


                } catch (e) {
                    console.warn('Erro ao carregar perfil:', e);
                }
                await resumeActiveRideIfNeeded();
            }
        };
        loadInitial();
        const listener = timerAnim.addListener(({ value }) => {
            setTimerValue(Math.round(value));
        });

        return () => {
            timerAnim.removeListener(listener);
        };
    }, []);

    // Sincroniza configuração com o monitor global (polling continua em background)
    useEffect(() => {
        if (!sessionId) return;

        driverRideMonitor.updateConfig({
            sessionId,
            cidadeId: driver.cidade_id,
            isAvailable,
            isOnRide,
            rejectedRides,
        });
    }, [sessionId, isAvailable, isOnRide, driver.cidade_id, rejectedRides]);

    // Escuta novas corridas do monitor (funciona mesmo com app em background)
    useEffect(() => {
        const unsubscribe = driverRideMonitor.subscribe((event, payload) => {
            if (event === 'newRide' && payload) {
                showRideAlert(payload, { fromMonitor: true });
            } else if (event === 'rideExpired') {
                hideRideAlert();
            }
        });

        const unsubRideUi = subscribeRideRequest((event) => {
            if (event === 'hide') {
                setNewRide(null);
                newRideRef.current = null;
            }
        });

        return () => {
            unsubscribe();
            unsubRideUi();
        };
    }, [sessionId, rejectedRides]);

    // Restaura corrida pendente ao abrir/voltar ao app
    useEffect(() => {
        const restorePendingRide = async () => {
            const session = await getSession();
            if (hasActiveRide(session?.activeRideId)) return;

            const pending = await driverRideMonitor.getPendingRide();
            if (pending && !newRideRef.current) {
                showRideAlert(pending, { fromMonitor: true, skipNotification: true });
            }
        };
        restorePendingRide();

        const sub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                restorePendingRide();
                resumeActiveRideIfNeeded();
            }
        });
        return () => sub.remove();
    }, [sessionId, resumeActiveRideIfNeeded]);

    useFocusEffect(
        useCallback(() => {
            let mounted = true;

            (async () => {
                await syncSessionRideState();
                if (!mounted || !sessionId) return;

                await syncPushTokenWithServer().catch(() => {});

                await resumeActiveRideIfNeeded();
                if (!mounted) return;

                checkNewAlerts();
            })();

            const alertsInterval = setInterval(() => {
                if (mounted) checkNewAlerts();
            }, 10000);

            return () => {
                mounted = false;
                clearInterval(alertsInterval);
            };
        }, [sessionId, isOnRide, syncSessionRideState, resumeActiveRideIfNeeded])
    );

    const checkNewAlerts = async () => {
        if (!isFocused || !sessionId || !isAvailable || isOnRide) return;
        try {
            const response = await api.driver.getDriverAlerts(sessionId);
            if (response.data && response.data !== 'no' && typeof response.data === 'string') {
                const message = response.data;
                alertsService.addAlert({ msg: message });
                setAlertMessage(message);
                setShowAlertModal(true);
            }
        } catch (e) {
            console.warn('Erro ao buscar alertas:', e);
        }
    };

    const updateLocation = async (location) => {
        if (!sessionId || !location || !location.coords) return;
        try {
            const { latitude, longitude } = location.coords;
            // API expects (id_motorista, status, latitude, longitude)
            // status 2 = Em corrida, 1 = Online, 0 = Offline
            await api.driver.updateLocation(
                sessionId, 
                isAvailable ? (isOnRide ? 2 : 1) : 0, 
                latitude, 
                longitude
            );
        } catch (e) {
            console.warn('Erro ao atualizar localização:', e);
        }
        
        if (mapRef.current && location && location.coords) {
            animateMapToCoords(mapRef, location.coords);
        }
    };

    useEffect(() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }, []);

    useEffect(() => {
        let locationSubPromise = null;
        // Mantém foreground service ativo enquanto online (mesmo em background)
        // Mapa: mantém GPS no painel quando online; corrida ativa redireciona ao taxímetro
        if (isAvailable && sessionId) {
            const startTracking = async () => {
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status !== 'granted') {
                    return;
                }
                try {
                    const { status: bg } = await Location.getBackgroundPermissionsAsync();
                    if (bg !== 'granted') {
                        await Location.requestBackgroundPermissionsAsync().catch(() => {});
                    }
                } catch (e) {
                    console.log('Permissão de background não concedida ou não suportada:', e);
                }

                try {
                    const started = await startRideForegroundService({
                        title: 'UbeZap Motorista Online',
                        body: 'Monitorando novas solicitações de corrida em segundo plano...',
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 5000,
                        distanceInterval: 5,
                    });
                    if (!started) {
                        const { status: bg } = await Location.getBackgroundPermissionsAsync();
                        if (bg !== 'granted') {
                            Alert.alert(
                                'Localização em segundo plano',
                                'Para receber corridas com o app minimizado, conceda "Permitir o tempo todo" nas configurações de localização.'
                            );
                        }
                    }
                } catch (e) {
                    console.log('Erro ao iniciar rastreamento em background:', e);
                    Alert.alert(
                        'Monitoramento',
                        'Não foi possível iniciar o serviço em segundo plano. Corridas podem só aparecer com o app aberto.'
                    );
                }

                if (isFocused) {
                    locationSubPromise = Location.watchPositionAsync({
                        accuracy: Location.Accuracy.Balanced,
                        timeInterval: 15000,
                        distanceInterval: 10
                    }, (loc) => {
                        updateLocation(loc);
                    });
                }
            };

            startTracking();
            
            if (isFocused) {
                pulseLoopRef.current?.stop();
                pulseLoopRef.current = Animated.loop(
                    Animated.sequence([
                        Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
                        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
                    ])
                );
                pulseLoopRef.current.start();
            }
        } else if (!isAvailable) {
            pulseAnim.setValue(1);
            (async () => {
                try {
                    await stopRideForegroundService();
                } catch (e) {}
            })();
        } else {
            pulseAnim.setValue(1);
        }

        return () => {
            pulseLoopRef.current?.stop();
            safeRemoveLocationSubscriptionAsync(locationSubPromise);
        };
    }, [isFocused, isAvailable, isOnRide, sessionId]);

    const loadEarnings = async () => {
        if (!sessionId) return;
        try {
            const response = await api.driver.getDriverEarnings(sessionId);
            if (response && response.data) setEarnings(response.data);
        } catch (e) {
            console.error(e);
        }
    };

    const showRideAlert = async (ride, options = {}) => {
        const { skipNotification = false } = options;
        if (!ride?.id) return;
        if (driverRideMonitor.isRideBlocked(ride.id)) return;

        const noDestination = isNoDestinationRideLocal(ride);
        const normalizedRide = {
            ...ride,
            endereco_ini_txt: ride.endereco_ini_txt || ride.endereco_ini || 'A combinar',
            endereco_fim_txt: ride.endereco_fim_txt || ride.endereco_fim || 'Destino a definir',
            isNoDestination: noDestination,
        };

        const isNewRide = !newRideRef.current || newRideRef.current.id !== ride.id;

        if (isNewRide) {
            if (!isRideAlertSoundPlaying()) {
                startRideAlertSound();
            }
            activateKeepAwakeAsync('ride-alert').catch(() => {});

            if (AppState.currentState !== 'active') {
                wakeScreenForRideAlert().catch(() => {});
            }

            if (!skipNotification && AppState.currentState !== 'active') {
                triggerRideAlertNotification(normalizedRide).catch(() => {});
            }
        }

        driverRideMonitor.markRideHandled(ride.id);

        setNewRide(normalizedRide);
        newRideRef.current = normalizedRide;
        setTimerValue(15);

        alertAnim.setValue(64);
        alertOpacity.setValue(0);
        alertScale.setValue(0.98);

        Animated.parallel([
            Animated.spring(alertAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 52,
                friction: 9
            }),
            Animated.timing(alertOpacity, {
                toValue: 1,
                duration: 220,
                useNativeDriver: true
            }),
            Animated.timing(alertScale, {
                toValue: 1,
                duration: 220,
                useNativeDriver: true
            })
        ]).start();

        timerAnim.setValue(15);
        Animated.timing(timerAnim, {
            toValue: 0,
            duration: 15000,
            useNativeDriver: false
        }).start(({ finished }) => {
            if (finished && newRideRef.current && newRideRef.current.id === ride.id) {
                hideRideAlert();
            }
        });
    };

    const hideRideAlert = async (wasRejected = false) => {
        stopRideAlertSound();
        deactivateKeepAwake('ride-alert');
        cancelRideAlertNotification();
        if (!driverRideMonitor.config?.isOnRide) {
            driverRideMonitor.releaseRideLock();
        }
        await driverRideMonitor.clearPendingRide();
        await AsyncStorage.removeItem(RIDE_UI_KEYS.PENDING_SHOW).catch(() => {});

        if (wasRejected && newRide) {
            const rideId = newRide.id;
            setRejectedRides(prev => [...prev, String(rideId)]);
            try {
                await api.driver.refuseRide(sessionId, rideId);
            } catch (e) {
                console.warn('Erro ao registrar recusa na API:', e);
            }
        }
        
        Animated.parallel([
            Animated.timing(alertAnim, {
                toValue: 140,
                duration: 220,
                useNativeDriver: true
            }),
            Animated.timing(alertOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true
            }),
            Animated.timing(alertScale, {
                toValue: 0.98,
                duration: 200,
                useNativeDriver: true
            })
        ]).start(() => {
            setNewRide(null);
            newRideRef.current = null;
        });
    };

    const toggleMenu = () => {
        const toValue = isMenuOpen ? -width * 0.8 : 0;
        Animated.spring(menuAnim, { toValue, useNativeDriver: true, tension: 50, friction: 8 }).start();
        setIsMenuOpen(!isMenuOpen);
    };

    const toggleStatus = async () => {
        const newStatus = !isAvailable;

        if (newStatus) {
            const canGoOnline = await ensureDriverCanGoOnline();
            if (!canGoOnline) {
                Alert.alert(
                    'Permissões necessárias',
                    'Conceda localização e notificações para ficar online e receber corridas.'
                );
                return;
            }
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsAvailable(newStatus);

        await driverRideMonitor.updateConfig({
            sessionId,
            cidadeId: driver.cidade_id,
            isAvailable: newStatus,
            isOnRide,
            rejectedRides,
        });

        if (sessionId) {
            try {
                const location = await Location.getCurrentPositionAsync({});
                await api.driver.updateLocation(
                    sessionId,
                    newStatus ? 1 : 0,
                    location.coords.latitude,
                    location.coords.longitude
                );
                if (newStatus) {
                    await syncPushTokenWithServer().catch(() => {});
                }
            } catch (e) {
                console.log('Status push error:', e);
                setIsAvailable(!newStatus);
                await driverRideMonitor.updateConfig({
                    sessionId,
                    cidadeId: driver.cidade_id,
                    isAvailable: !newStatus,
                    isOnRide,
                    rejectedRides,
                });
                Alert.alert('Erro', 'Não foi possível atualizar seu status. Tente novamente.');
            }
        }
    };

    const handleLogout = () => {
        Alert.alert('Sair', 'Deseja realmente sair do modo motorista?', [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Sair', 
            style: 'destructive', 
            onPress: async () => {
                try {
                    // 1. Notify server we are going offline (status 0)
                    if (sessionId) {
                        const loc = await Location.getCurrentPositionAsync({});
                        await api.driver.updateLocation(sessionId, 0, loc.coords.latitude, loc.coords.longitude);
                    }
                    // 2. Clear session and navigate
                    await clearSession();
                    navigation.navigate('DriverLogin');
                } catch (e) {
                    // Fallback to navigate even if API fails
                    navigation.navigate('DriverLogin');
                }
            } 
          }
        ]);
    };

    const parseCoordinateLocal = parseCoordinate;

    const formatCurrency = (value) => {
        const n = Number(String(value ?? '0').replace(',', '.'));
        if (!Number.isFinite(n)) return '0,00';
        return n.toFixed(2).replace('.', ',');
    };

    const formatEta = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return '-- min';
        return `${Math.round(n)} min`;
    };

    const formatDistanceKm = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return '-- km';
        return `${n.toFixed(1)} km`;
    };

    function isNoDestinationRideLocal(ride) {
        return isNoDestinationRide(ride);
    }

    const handleAccept = async () => {
        if (isAccepting || !newRide?.id) return;
        
        setIsAccepting(true);
        const rideId = newRide.id;
        
        const rideData = buildTaximeterRide({
            ...newRide,
            isNoDestination: Boolean(newRide.isNoDestination),
        }) || {
            ...newRide,
            id: rideId,
            valor: `R$ ${(newRide.taxa || '0.00').toString().replace('.', ',')}`,
            cliente: newRide.nome_cliente || 'Passageiro',
            origem: newRide.endereco_ini_txt || 'Localização atual',
            destino: newRide.isNoDestination ? 'Sem destino (taxímetro)' : (newRide.endereco_fim_txt || 'Destino não detalhado'),
            isNoDestination: Boolean(newRide.isNoDestination),
            origin: {
                latitude: parseCoordinateLocal(newRide.lat_ini),
                longitude: parseCoordinateLocal(newRide.lng_ini),
            },
            destination: {
                latitude: parseCoordinateLocal(newRide.lat_fim),
                longitude: parseCoordinateLocal(newRide.lng_fim),
            },
        };
        
        try {
            await driverRideMonitor.beginAcceptRide(rideId, {
                sessionId,
                cidadeId: driver?.cidade_id || newRide?.cidade_id || 1,
                isAvailable: true,
                rejectedRides,
            });
            setIsOnRide(true);

            cancelRideAlertNotification().catch(() => {});
            console.log(`Aceitando corrida ${rideId} via motoristas/aceitar.php`);
            
            const response = await api.driver.acceptRide(sessionId, rideId);
            const ok =
                response.data === 'ok' ||
                (typeof response.data === 'string' && response.data.trim().toLowerCase() === 'ok');
            
            console.log(`[Aceite] Resposta do Servidor: ${response.data}`);

            if (ok) {
                await saveSession({ activeRideId: rideId });
                await driverRideMonitor.updateConfig({
                    sessionId,
                    cidadeId: driver?.cidade_id || newRide?.cidade_id || 1,
                    isAvailable: true,
                    isOnRide: true,
                    rejectedRides,
                });
                await driverRideMonitor.clearPendingRide();
                hideRideAlert();
                navigation.replace('Taximeter', { ride: rideData });
            } else {
                driverRideMonitor.clearAcceptLock();
                Alert.alert('Corrida Indisponível', 'Esta corrida já foi aceita por outro motorista ou cancelada.');
                setIsOnRide(false);
                setRejectedRides((prev) => [...prev, String(rideId)]);
                await driverRideMonitor.updateConfig({
                    sessionId,
                    cidadeId: driver?.cidade_id || 1,
                    isAvailable: true,
                    isOnRide: false,
                    rejectedRides: [...rejectedRides, String(rideId)],
                });
                hideRideAlert();
            }
        } catch (e) {
            console.error('Erro ao aceitar corrida:', e);
            driverRideMonitor.clearAcceptLock();
            const errorMsg = e.response ? JSON.stringify(e.response.data) : e.message;
            Alert.alert('Erro de Integração', `O servidor não autorizou o aceite: ${errorMsg}`);
            setIsOnRide(false);
            await driverRideMonitor.updateConfig({
                sessionId,
                cidadeId: driver?.cidade_id || 1,
                isAvailable: true,
                isOnRide: false,
                rejectedRides,
            }).catch(() => {});
        } finally {
            setIsAccepting(false);
        }
    };

    return (
        <Container>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            <StatusHeader colors={isAvailable ? [colors.white, '#f8fafc'] : ['#fee2e2', colors.white]} start={{x:0, y:0}} end={{x:1, y:1}}>
                <TopRow>
                    <TouchableOpacity onPress={toggleMenu}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                                <Icon name="person" size={26} color={colors.secondary} />
                            </View>
                            <View style={{ marginLeft: 12 }}>
                                <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>{driver.nome}</Text>
                                <Text style={{ color: colors.primary, fontSize: 12 }}>Nível {driver.nivel}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>

                    <OnlineToggle active={isAvailable} onPress={toggleStatus}>
                        <GlowDot active={isAvailable} style={{ transform: [{ scale: pulseAnim }], opacity: isAvailable ? 1 : 0.6 }} />
                        <Text style={{ color: isAvailable ? colors.primary : colors.textSecondary, fontWeight: 'bold' }}>{isAvailable ? 'ONLINE' : 'OFFLINE'}</Text>
                    </OnlineToggle>
                </TopRow>
            </StatusHeader>

            <EarningsCard style={{ borderBottomWidth: 3, borderBottomColor: colors.primary }}>
                <View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 'bold' }}>Saldo de Hoje</Text>
                    <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900', marginTop: 4 }}>R$ {earnings?.valor_hoje || '0,00'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <View style={{ backgroundColor: 'rgba(58, 181, 107, 0.15)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(58, 181, 107, 0.3)' }}>
                        <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 16 }}>{earnings?.qnt_hoje || 0} Viagens</Text>
                    </View>
                    <TouchableOpacity
                        style={{ marginTop: 12 }}
                        onPress={() => navigation.navigate('DriverHistory')}
                    >
                        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: 'bold' }}>DETALHES ›</Text>
                    </TouchableOpacity>
                </View>
            </EarningsCard>

            {isOnRide && resumeError ? (
                <TouchableOpacity
                    onPress={() => resumeActiveRideIfNeeded(true)}
                    style={{
                        marginHorizontal: spacing.md,
                        marginBottom: 8,
                        backgroundColor: '#fef3c7',
                        borderColor: '#f59e0b',
                        borderWidth: 1,
                        borderRadius: 14,
                        padding: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <Icon name="warning" size={22} color="#b45309" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: '#92400e', fontWeight: '800' }}>Corrida em andamento</Text>
                        <Text style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>{resumeError}</Text>
                    </View>
                    <Text style={{ color: '#b45309', fontWeight: '900' }}>Retomar ›</Text>
                </TouchableOpacity>
            ) : null}

            <MapContainer>
                {Platform.OS !== 'web' ? (
                    <MapView 
                        ref={mapRef}
                        style={StyleSheet.absoluteFillObject}
                        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                        initialRegion={{
                            latitude: -23.5617,
                            longitude: -46.6623,
                            latitudeDelta: 0.02,
                            longitudeDelta: 0.02,
                        }}
                        showsUserLocation={true}
                        showsMyLocationButton={false}
                    />
                ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Icon name="map" size={100} color={colors.border} />
                        <Text style={{ color: colors.textSecondary }}>Mapa em Modo Claro</Text>
                    </View>
                )}
                
                <BottomActions>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <FloatingButton onPress={() => navigation.navigate('DriverHistory')}>
                            <Icon name="history" size={28} color={colors.text} />
                        </FloatingButton>

                        {isAvailable && (
                            <TouchableOpacity 
                                onPress={() => navigation.navigate('Taximeter', { ride: { id: 'manual', taxa: '0.00', isNoDestination: true, destino: 'A combinar' } })}
                                style={{ 
                                    backgroundColor: colors.primary, 
                                    paddingHorizontal: 25, 
                                    height: 60, 
                                    borderRadius: 30, 
                                    flexDirection: 'row', 
                                    alignItems: 'center',
                                    elevation: 8,
                                    shadowColor: colors.primary,
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 10
                                }}
                            >
                                <Icon name="timer" size={24} color="#fff" />
                                <Text style={{ color: '#fff', fontWeight: '900', marginLeft: 10, fontSize: 16 }}>TAXÍMETRO</Text>
                            </TouchableOpacity>
                        )}

                        <FloatingButton onPress={() => {
                            Location.getCurrentPositionAsync({}).then((loc) => {
                                animateMapToCoords(mapRef, loc.coords);
                            }).catch(() => {});
                        }}>
                            <Icon name="my-location" size={28} color={colors.primary} />
                        </FloatingButton>
                    </View>
                </BottomActions>
            </MapContainer>

            {/* Side Menu Overlay */}
            {isMenuOpen && (
                <Overlay activeOpacity={1} onPress={toggleMenu} />
            )}
            <Animated.View style={[{ 
                position: 'absolute', 
                top: 0, bottom: 0, left: 0, 
                width: width * 0.8, 
                backgroundColor: colors.white, 
                zIndex: 10001, 
                transform: [{ translateX: menuAnim }],
                paddingTop: Platform.OS === 'ios' ? 60 : 40,
                borderRightWidth: 1,
                borderRightColor: colors.border,
            }]}>
                <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 20 }}>
                    <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: colors.border }}>
                    <Icon name="person" size={44} color={colors.primary} />
                    </View>
                    <View>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: colors.text }}>{driver.nome}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon name="star" size={16} color="#fbbf24" />
                            <Text style={{ color: colors.textSecondary, fontSize: 14, marginLeft: 5 }}>{driver.rating} • Nível {driver.nivel}</Text>
                        </View>
                    </View>
                </View>

                {[
                    { title: 'Painel Inicial', icon: 'dashboard', screen: 'DriverHome' },
                    { title: 'Relatório de Ganhos', icon: 'trending-up', screen: 'DriverEarnings' },
                    { title: 'Minha Carteira', icon: 'account-balance-wallet', screen: 'DriverWallet' },
                    { title: 'Minhas Viagens', icon: 'history', screen: 'DriverHistory' },
                    { title: 'Central de Alertas', icon: 'notifications', screen: 'DriverAlerts' },
                    { title: 'Documentos', icon: 'description', screen: 'DriverDocs' },
                    { title: 'Perfil do Veículo', icon: 'directions-car', screen: 'VehicleProfile' },
                    { title: 'Ajuda', icon: 'help-outline', screen: 'DriverSupport' },
                ].map((item, idx) => (
                    <TouchableOpacity key={idx} onPress={() => {
                        toggleMenu();
                        if (item.screen) navigation.navigate(item.screen);
                    }} style={{ flexDirection: 'row', alignItems: 'center', padding: 15, paddingHorizontal: 20 }}>
                    <Icon name={item.icon} size={24} color={colors.primary} />
                    <View style={{ marginLeft: 15 }}>
                        <Text style={{ fontSize: 16, color: colors.text }}>{item.title}</Text>
                    </View>
                    </TouchableOpacity>
                ))}

                <TouchableOpacity style={{ marginTop: 'auto', marginBottom: 20, flexDirection: 'row', alignItems: 'center', padding: 15, paddingHorizontal: 20 }} onPress={handleLogout}>
                    <Icon name="exit-to-app" size={24} color="#f44" />
                    <Text style={{ fontSize: 16, color: '#f44', marginLeft: 15 }}>Sair do Modo Motorista</Text>
                </TouchableOpacity>
            </Animated.View>

            {newRide && (
                <RideAlertContainer style={{ transform: [{ translateY: alertAnim }], opacity: alertOpacity }}>
                    <AlertCard style={{ backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, transform: [{ scale: alertScale }] }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <View>
                                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>NOVA CHAMADA</Text>
                                <Text style={{ color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 2 }}>
                                    R$ {formatCurrency(newRide.taxa)}
                                </Text>
                                <Text style={{ color: colors.textSecondary, marginTop: 2, fontSize: 15 }}>
                                    {newRide.nome_cliente || 'Passageiro'} • {newRide.categoria || 'Categoria padrão'}
                                </Text>
                            </View>

                            <TimerSemicircle style={{ width: 58, height: 58, borderRadius: 29, marginBottom: 0, backgroundColor: 'rgba(58,181,107,0.1)', borderColor: colors.primary }}>
                                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900' }}>
                                    {timerValue}
                                </Text>
                            </TimerSemicircle>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                            <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, marginRight: 6 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', marginBottom: 2 }}>PAGAMENTO</Text>
                                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
                                    {newRide.f_pagamento || 'Não informado'}
                                </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, marginHorizontal: 3 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', marginBottom: 2 }}>ATÉ EMBARQUE</Text>
                                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
                                    {formatEta(newRide.tempo_embarque)}
                                </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, marginLeft: 6 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700', marginBottom: 2 }}>DISTÂNCIA</Text>
                                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
                                    {formatDistanceKm(newRide.distancia_embarque)}
                                </Text>
                            </View>
                        </View>

                        {newRide.isNoDestination && (
                            <View style={{ marginBottom: 14, backgroundColor: 'rgba(250, 204, 21, 0.15)', borderWidth: 1, borderColor: 'rgba(250, 204, 21, 0.45)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
                                    CORRIDA SEM DESTINO - valor fechado no taxímetro
                                </Text>
                            </View>
                        )}

                        <View style={{ width: '100%', padding: 14, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 16, marginBottom: 14 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginRight: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Embarque</Text>
                                    <Text style={{ color: colors.text, fontWeight: '800' }} numberOfLines={2}>
                                        {newRide.endereco_ini_txt || 'Localização atual'}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 4, marginBottom: 12 }} />
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', marginRight: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Destino</Text>
                                    <Text style={{ color: colors.text, fontWeight: '800' }} numberOfLines={2}>
                                        {newRide.isNoDestination ? 'Sem destino definido (A combinar)' : (newRide.endereco_fim_txt || 'Destino não informado')}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {(newRide.telefone_cliente || (newRide.obs && newRide.obs !== 'Não Informado')) && (
                            <View style={{ width: '100%', marginBottom: 14, backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 14, padding: 12 }}>
                                {newRide.telefone_cliente ? (
                                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                                        Telefone: <Text style={{ color: colors.text, fontWeight: '700' }}>{newRide.telefone_cliente}</Text>
                                    </Text>
                                ) : null}
                                {newRide.obs && newRide.obs !== 'Não Informado' ? (
                                    <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>
                                        Obs: <Text style={{ color: colors.text }}>{newRide.obs}</Text>
                                    </Text>
                                ) : null}
                            </View>
                        )}

                        <TouchableOpacity 
                            activeOpacity={0.7}
                            onPress={handleAccept}
                            disabled={isAccepting}
                            style={{ 
                                backgroundColor: isAccepting ? '#444' : colors.primary, 
                                width: '100%', 
                                height: 58,
                                borderRadius: 14,
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                elevation: 8,
                                shadowColor: colors.primary,
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.3,
                                shadowRadius: 10
                            }}>
                            {isAccepting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.4 }}>Aceitar corrida</Text>
                            )}
                        </TouchableOpacity>
                        
                        <TouchableOpacity onPress={() => hideRideAlert(true)} style={{ marginTop: 12, alignItems: 'center', paddingVertical: 4 }}>
                            <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '700' }}>Recusar chamada</Text>
                        </TouchableOpacity>
                    </AlertCard>
                </RideAlertContainer>
            )}
            <Modal
                visible={showAlertModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAlertModal(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <View style={{ width: '100%', backgroundColor: colors.white, borderRadius: 30, padding: 30, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: colors.primary }}>
                        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(58, 181, 107, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                            <Icon name="notifications-active" size={44} color={colors.primary} />
                        </View>
                        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '900', marginBottom: 15, textAlign: 'center' }}>Novo Comunicado</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 30 }}>
                            {alertMessage}
                        </Text>
                        <TouchableOpacity 
                            onPress={() => setShowAlertModal(false)}
                            style={{ 
                                backgroundColor: colors.primary, 
                                width: '100%', 
                                height: 60, 
                                borderRadius: 15, 
                                justifyContent: 'center', 
                                alignItems: 'center',
                                elevation: 5
                            }}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>ENTENDI</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </Container>
    );
};

const darkMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#212121" }] },
  { "featureType": "road", "elementType": "geometry.fill", "stylers": [{ "color": "#2c2c2c" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] }
];

const StyleSheet = {
    absoluteFillObject: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0
    }
};

export default DriverHomeScreen;
