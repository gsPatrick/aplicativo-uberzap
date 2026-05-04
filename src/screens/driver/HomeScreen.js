import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StatusBar, SafeAreaView, Switch, TouchableOpacity, Animated, Dimensions, Platform, LayoutAnimation, UIManager, ActivityIndicator, Modal, Alert } from 'react-native';
import * as Location from 'expo-location';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import api from '../../services/api';
import alertsService from '../../services/alertsService';
import { getSession, saveSession, clearSession } from '../../utils/session';

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
  background-color: #0c0d0d;
`;

const StatusHeader = styled(LinearGradient)`
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  border-bottom-left-radius: 30px;
  border-bottom-right-radius: 30px;
  elevation: 10;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
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
  background-color: ${props => props.active ? 'rgba(58, 181, 107, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
  padding: 8px 16px;
  border-radius: 25px;
  border-width: 1px;
  border-color: ${props => props.active ? colors.primary : 'rgba(255, 255, 255, 0.2)'};
`;

const GlowDot = styled(Animated.View)`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${props => props.active ? colors.primary : '#ff4444'};
  margin-right: 8px;
`;

const EarningsCard = styled.View`
  background-color: rgba(255, 255, 255, 0.05);
  margin: ${spacing.md}px;
  padding: 20px;
  border-radius: 20px;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.1);
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const MapContainer = styled.View`
  flex: 1;
  background-color: #1a1a1a;
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
  background-color: #1f2120;
  justify-content: center;
  align-items: center;
  elevation: 8;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 5px;
  border-width: 1px;
  border-color: rgba(255,255,255,0.1);
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

const AlertCard = styled.View`
  width: 100%;
  background-color: #0f1113;
  border-top-left-radius: 26px;
  border-top-right-radius: 26px;
  padding: 18px;
  align-items: stretch;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.08);
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

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const timerAnim = useRef(new Animated.Value(15)).current;
    const alertAnim = useRef(new Animated.Value(height)).current;
    const alertOpacity = useRef(new Animated.Value(0)).current;
    const alertScale = useRef(new Animated.Value(0.98)).current;
    const [timerValue, setTimerValue] = useState(15);

    useEffect(() => {
        const loadInitial = async () => {
            const session = await getSession();
            if (session) {
                setSessionId(session.id);
                setIsOnRide(Boolean(session.activeRideId));
                try {
                    const profile = await api.driver.getDriverProfile(session.id);
                    if (profile.data) {
                        const cid = profile.data.cidade_id || 1;
                        setDriver({
                            nome: profile.data.nome || 'Motorista',
                            rating: profile.data.nota || '5.0',
                            nivel: profile.data.nivel || 'Ouro',
                            cidade_id: cid
                        });
                    }
                    // Carrega ganhos reais
                    const earnResponse = await api.driver.getDriverEarnings(session.id);
                    if (earnResponse.data) setEarnings(earnResponse.data);
                } catch (e) {
                    console.warn('Erro ao carregar perfil:', e);
                }
            }
        };
        loadInitial();
        const listener = timerAnim.addListener(({ value }) => {
            setTimerValue(Math.round(value));
        });

        return () => {
            timerAnim.removeListener(listener);
        };
    }, [sessionId]);

    useFocusEffect(
        useCallback(() => {
            if (!isFocused || !sessionId) return () => {};

            checkNewAlerts();
            checkAvailableRides();

            const alertsInterval = setInterval(checkNewAlerts, 10000);
            const ridesInterval = setInterval(checkAvailableRides, 5000);

            return () => {
                clearInterval(alertsInterval);
                clearInterval(ridesInterval);
            };
        }, [isFocused, sessionId, isAvailable, isOnRide, driver.cidade_id, rejectedRides])
    );

    useFocusEffect(
        useCallback(() => {
            let mounted = true;
            (async () => {
                const session = await getSession();
                if (!mounted || !session) return;
                const onRide = Boolean(session.activeRideId);
                setIsOnRide(onRide);
                // Ao voltar do taxímetro (corrida encerrada), garante estado visual online.
                if (!onRide) {
                    setIsAvailable(true);
                }
            })();
            return () => {
                mounted = false;
            };
        }, [])
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

    const checkAvailableRides = async () => {
        if (!isFocused || !sessionId || !isAvailable || isOnRide || newRideRef.current) return;
        try {
            console.log(`Buscando corridas: Motorista ${sessionId}, Cidade ${driver.cidade_id}`);
            // Use pollRides as defined in api.js (id_motorista, cidade_id)
            const response = await api.driver.pollRides(sessionId, driver.cidade_id);
            
            if (response.data && response.data !== 'no' && Array.isArray(response.data) && response.data.length > 0) {
                const rejectedSet = new Set(rejectedRides.map(id => String(id)));
                // Procuramos a primeira corrida da lista que NÃO foi recusada
                const freshRide = response.data.find(r => !rejectedSet.has(String(r.id)));
                
                if (freshRide) {
                    showRideAlert(freshRide);
                } else {
                    // Se todas as corridas da lista foram recusadas, garantimos que o alerta suma
                    if (newRideRef.current) hideRideAlert();
                }
            } else if (response.data === 'no') {
                // Se o servidor disse "no" (corrida aceita por outro ou expirada), limpamos
                if (newRideRef.current) hideRideAlert();
            }
        } catch (e) {
            console.warn('Erro ao buscar corridas:', e);
            // Em caso de erro de rede, também escondemos para evitar "fantasma" offline
            if (newRideRef.current) hideRideAlert();
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
            mapRef.current.animateToRegion({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
            }, 1000);
        }
    };

    useEffect(() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }, []);

    useEffect(() => {
        let locationSubPromise = null;
        if (isFocused && isAvailable && sessionId) {
            const startTracking = async () => {
                let { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Erro', 'Permissão de localização negada.');
                    return;
                }

                locationSubPromise = Location.watchPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                    timeInterval: 15000,
                    distanceInterval: 10
                }, (loc) => {
                    updateLocation(loc);
                });
            };

            startTracking();
            
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }

        return () => {
            if (locationSubPromise) {
                locationSubPromise.then(sub => sub.remove()).catch(() => {});
            }
        };
    }, [isFocused, isAvailable, isOnRide, sessionId]);

    const playNotificationSound = async () => {
        try {
            const { sound } = await Audio.Sound.createAsync(
                require('../../../assets/sounds/toque_status.mp3')
            );
            await sound.playAsync();
        } catch (e) {
            console.warn('Erro ao tocar som:', e);
        }
    };

    const loadEarnings = async () => {
        if (!sessionId) return;
        try {
            const response = await api.driver.getDriverEarnings(sessionId);
            if (response && response.data) setEarnings(response.data);
        } catch (e) {
            console.error(e);
        }
    };

    const showRideAlert = (ride) => {
        const noDestination = isNoDestinationRide(ride);
        // Garantir que endereços estão mapeados corretamente antes de salvar no estado
        const normalizedRide = {
            ...ride,
            endereco_ini_txt: ride.endereco_ini_txt || ride.endereco_ini || 'A combinar',
            endereco_fim_txt: ride.endereco_fim_txt || ride.endereco_fim || 'Destino a definir',
            isNoDestination: noDestination,
        };

        // Só tocamos o som se a corrida for realmente nova (evita o bipe constante do polling)
        if (!newRideRef.current || newRideRef.current.id !== ride.id) {
            playNotificationSound();
        }

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
        if (wasRejected && newRide) {
            const rideId = newRide.id;
            setRejectedRides(prev => [...prev, String(rideId)]);
            try {
                // Notifica o servidor sobre a recusa real
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
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsAvailable(newStatus);
        
        // Push instant status update to server
        if (sessionId) {
            try {
                const location = await Location.getCurrentPositionAsync({});
                await api.driver.updateLocation(sessionId, newStatus ? 1 : 0, location.coords.latitude, location.coords.longitude);
            } catch (e) {
                console.log('Status push error:', e);
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

    const parseCoordinate = (value) => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'string') {
            const n = Number(value.replace(',', '.').trim());
            return Number.isFinite(n) ? n : null;
        }
        return null;
    };

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

    const isNoDestinationRide = (ride) => {
        const destinationText = String(ride?.endereco_fim_txt || ride?.endereco_fim || '').toLowerCase();
        return destinationText.includes('sem destino') || destinationText.includes('a combinar');
    };

    const handleAccept = async () => {
        if (isAccepting) return;
        
        setIsAccepting(true);
        const rideId = newRide.id;
        
        // Limpeza e normalização de dados para o Waze/GPS
        const rideData = {
            ...newRide,
            id: rideId,
            valor: `R$ ${(newRide.taxa || '0.00').toString().replace('.', ',')}`,
            cliente: newRide.nome_cliente || 'Passageiro',
            origem: newRide.endereco_ini_txt || 'Localização atual',
            destino: newRide.isNoDestination ? 'Sem destino (taxímetro)' : (newRide.endereco_fim_txt || 'Destino não detalhado'),
            isNoDestination: Boolean(newRide.isNoDestination),
            origin: {
                latitude: parseCoordinate(newRide.lat_ini),
                longitude: parseCoordinate(newRide.lng_ini),
            },
            destination: {
                latitude: parseCoordinate(newRide.lat_fim),
                longitude: parseCoordinate(newRide.lng_fim),
            }
        };
        
        try {
            const cid = driver?.cidade_id || newRide?.cidade_id || 1;
            console.log(`Aceitando corrida ${rideId} via motoristas/aceitar.php na cidade ${cid}`);
            
            setIsOnRide(true); // Trava novo polling sem derrubar o motorista para OFFLINE
            
            // O aceitar.php já faz o altera_motorista e o set_status(1) internamente
            const response = await api.driver.acceptRide(sessionId, rideId);
            
            console.log(`[Aceite] Resposta do Servidor: ${response.data}`);

            if (response.data === 'ok') {
                await saveSession({ activeRideId: rideId });
                hideRideAlert();
                navigation.replace('Taximeter', { ride: rideData });
            } else {
                Alert.alert('Corrida Indisponível', 'Esta corrida já foi aceita por outro motorista ou cancelada.');
                setIsOnRide(false);
            }
        } catch (e) {
            console.error('Erro ao aceitar corrida:', e);
            const errorMsg = e.response ? JSON.stringify(e.response.data) : e.message;
            Alert.alert('Erro de Integração', `O servidor não autorizou o aceite: ${errorMsg}`);
            setIsOnRide(false);
        } finally {
            setIsAccepting(false);
        }
    };

    return (
        <Container>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
            
            <StatusHeader colors={isAvailable ? ['#1f2120', '#121212'] : ['#2a1010', '#121212']} start={{x:0, y:0}} end={{x:1, y:1}}>
                <TopRow>
                    <TouchableOpacity onPress={toggleMenu}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }}>
                                <Icon name="person" size={26} color="#fff" />
                            </View>
                            <View style={{ marginLeft: 12 }}>
                                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>{driver.nome}</Text>
                                <Text style={{ color: colors.primary, fontSize: 12 }}>Nível {driver.nivel}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>

                    <OnlineToggle active={isAvailable} onPress={toggleStatus}>
                        <GlowDot active={isAvailable} style={{ transform: [{ scale: pulseAnim }], opacity: isAvailable ? 1 : 0.6 }} />
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isAvailable ? 'ONLINE' : 'OFFLINE'}</Text>
                    </OnlineToggle>
                </TopRow>
            </StatusHeader>

            <EarningsCard style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderBottomWidth: 2, borderBottomColor: colors.primary }}>
                <View>
                    <Text style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 'bold' }}>Saldo de Hoje</Text>
                    <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4 }}>R$ {earnings?.valor_hoje || '0,00'}</Text>
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

            <MapContainer>
                {Platform.OS !== 'web' ? (
                    <MapView 
                        ref={mapRef}
                        style={StyleSheet.absoluteFillObject}
                        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                        customMapStyle={darkMapStyle || []}
                        initialRegion={{
                            latitude: -23.5617,
                            longitude: -46.6623,
                            latitudeDelta: 0.02,
                            longitudeDelta: 0.02,
                        }}
                    />
                ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Icon name="map" size={100} color="rgba(255,255,255,0.1)" />
                        <Text style={{ color: '#444' }}>Mapa em Modo Noturno</Text>
                    </View>
                )}
                
                <BottomActions>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' }}>
                        <FloatingButton onPress={() => navigation.navigate('DriverHistory')}>
                            <Icon name="history" size={28} color="#fff" />
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
                backgroundColor: '#1f2120', 
                zIndex: 10001, 
                transform: [{ translateX: menuAnim }],
                paddingTop: Platform.OS === 'ios' ? 60 : 40,
                borderRightWidth: 1,
                borderRightColor: 'rgba(255,255,255,0.1)',
            }]}>
                <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', marginBottom: 20 }}>
                    <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}>
                    <Icon name="person" size={44} color={colors.primary} />
                    </View>
                    <View>
                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#fff' }}>{driver.nome}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon name="star" size={16} color="#fbbf24" />
                            <Text style={{ color: '#94a3b8', fontSize: 14, marginLeft: 5 }}>{driver.rating} • Nível {driver.nivel}</Text>
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
                        <Text style={{ fontSize: 16, color: '#fff' }}>{item.title}</Text>
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
                    <AlertCard style={{ shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, elevation: 20, transform: [{ scale: alertScale }] }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <View>
                                <Text style={{ color: '#8b95a7', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>NOVA CHAMADA</Text>
                                <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 2 }}>
                                    R$ {formatCurrency(newRide.taxa)}
                                </Text>
                                <Text style={{ color: '#94a3b8', marginTop: 2, fontSize: 15 }}>
                                    {newRide.nome_cliente || 'Passageiro'} • {newRide.categoria || 'Categoria padrão'}
                                </Text>
                            </View>

                            <TimerSemicircle style={{ width: 58, height: 58, borderRadius: 29, marginBottom: 0, backgroundColor: 'rgba(58,181,107,0.15)', borderColor: 'rgba(58,181,107,0.5)' }}>
                                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>
                                    {timerValue}
                                </Text>
                            </TimerSemicircle>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, marginRight: 6 }}>
                                <Text style={{ color: '#8b95a7', fontSize: 10, fontWeight: '700', marginBottom: 2 }}>PAGAMENTO</Text>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                                    {newRide.f_pagamento || 'Não informado'}
                                </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, marginHorizontal: 3 }}>
                                <Text style={{ color: '#8b95a7', fontSize: 10, fontWeight: '700', marginBottom: 2 }}>ATÉ EMBARQUE</Text>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                                    {formatEta(newRide.tempo_embarque)}
                                </Text>
                            </View>
                            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, marginLeft: 6 }}>
                                <Text style={{ color: '#8b95a7', fontSize: 10, fontWeight: '700', marginBottom: 2 }}>DISTÂNCIA</Text>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                                    {formatDistanceKm(newRide.distancia_embarque)}
                                </Text>
                            </View>
                        </View>

                        {newRide.isNoDestination && (
                            <View style={{ marginBottom: 14, backgroundColor: 'rgba(250, 204, 21, 0.12)', borderWidth: 1, borderColor: 'rgba(250, 204, 21, 0.4)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                                <Text style={{ color: '#fde68a', fontSize: 12, fontWeight: '800' }}>
                                    CORRIDA SEM DESTINO - valor fechado no taxímetro
                                </Text>
                            </View>
                        )}

                        <View style={{ width: '100%', padding: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, marginBottom: 14 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginRight: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Embarque</Text>
                                    <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={2}>
                                        {newRide.endereco_ini_txt || 'Localização atual'}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 4, marginBottom: 12 }} />
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', marginRight: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Destino</Text>
                                    <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={2}>
                                        {newRide.isNoDestination ? 'Sem destino definido (A combinar)' : (newRide.endereco_fim_txt || 'Destino não informado')}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {(newRide.telefone_cliente || (newRide.obs && newRide.obs !== 'Não Informado')) && (
                            <View style={{ width: '100%', marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 12 }}>
                                {newRide.telefone_cliente ? (
                                    <Text style={{ color: '#cbd5e1', fontSize: 12, marginBottom: 6 }}>
                                        Telefone: <Text style={{ color: '#fff', fontWeight: '700' }}>{newRide.telefone_cliente}</Text>
                                    </Text>
                                ) : null}
                                {newRide.obs && newRide.obs !== 'Não Informado' ? (
                                    <Text style={{ color: '#cbd5e1', fontSize: 12 }} numberOfLines={2}>
                                        Obs: <Text style={{ color: '#fff' }}>{newRide.obs}</Text>
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
                    <View style={{ width: '100%', backgroundColor: '#1f2120', borderRadius: 30, padding: 30, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: colors.primary }}>
                        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(58, 181, 107, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                            <Icon name="notifications-active" size={44} color={colors.primary} />
                        </View>
                        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 15, textAlign: 'center' }}>Novo Comunicado</Text>
                        <Text style={{ color: '#cbd5e0', fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 30 }}>
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
