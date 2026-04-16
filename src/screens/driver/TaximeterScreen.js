import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StatusBar, TouchableOpacity, Animated, Dimensions, StyleSheet, SafeAreaView, Alert, Linking, Platform, Modal, Pressable, ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { getSession, saveSession } from '../../utils/session';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  background-color: #0b0c10;
`;

const StatusHeader = styled.View`
  background-color: ${props => props.color || '#27ae60'};
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
  background-color: #1a1c22;
  margin: 20px;
  padding: 25px;
  border-radius: 24px;
  align-items: center;
  border-width: 1px;
  borderColor: rgba(255,255,255,0.05);
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
  color: #fff;
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
  color: #fff;
  font-size: 20px;
  font-weight: 800;
`;

const ActionFooter = styled.View`
  padding: 20px 25px 45px 25px;
  background-color: #0b0c10;
`;

const SecondaryButton = styled.TouchableOpacity`
  background-color: #2c3e50;
  height: 64px;
  border-radius: 18px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
`;

const WaitingButton = styled.TouchableOpacity`
  background-color: ${props => props.active ? '#e67e22' : '#2c3e50'};
  height: 64px;
  border-radius: 18px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
`;

const PrimaryButton = styled.TouchableOpacity`
  background-color: ${props => props.color || '#2ecc71'};
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

    const [status, setStatus] = useState('WAY_TO_ORIGIN');
    const [seconds, setSeconds] = useState(0);
    const [waitingSeconds, setWaitingSeconds] = useState(0);
    const [isWaiting, setIsWaiting] = useState(false);
    const [distance, setDistance] = useState(0.0);
    const [currentPrice, setCurrentPrice] = useState(parseFloat(String(ride?.taxa || '0.00').replace(',', '.')));
    const [loading, setLoading] = useState(false);
    const [showNavModal, setShowNavModal] = useState(false);
    
    const [lastCoords, setLastCoords] = useState(null);
    const [ratePerKm, setRatePerKm] = useState(2.00); // Valor padrão (seria ideal vir da categoria)
    const [ratePerMin, setRatePerMin] = useState(0.20); // Valor padrão
    const [gpsAccuracy, setGpsAccuracy] = useState(0); // Precisão em metros
    const gpsOpacity = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        if (!ride?.id) return;
        Animated.loop(
            Animated.sequence([
                Animated.timing(gpsOpacity, { toValue: 1, duration: 1200, useNativeDriver: true }),
                Animated.timing(gpsOpacity, { toValue: 0.4, duration: 1200, useNativeDriver: true })
            ])
        ).start();
        
        let positionWatcher;

        const startTracking = async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;

            positionWatcher = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, distanceInterval: 10 },
                (location) => {
                    // Atualiza precisão para o indicador visual
                    setGpsAccuracy(location.coords.accuracy || 0);

                    if (status === 'IN_PROGRESS') {
                        if (lastCoords) {
                            const d = getDistance(
                                lastCoords.latitude, lastCoords.longitude,
                                location.coords.latitude, location.coords.longitude
                            );
                            if (d > 0.01) { // Só conta se moveu mais de 10 metros
                                setDistance(prev => prev + d);
                                // Incrementa preço: Distância * KM + (Tempo é processado no interval)
                                setCurrentPrice(prev => prev + (d * ratePerKm));
                            }
                        }
                        setLastCoords(location.coords);
                    }
                }
            );
        };

        startTracking();
        if (!IS_EXPO_GO) {
            startBackgroundTracking();
        }

        return () => {
            if (positionWatcher) positionWatcher.remove();
            if (!IS_EXPO_GO) {
                stopBackgroundTracking();
            }
        };
    }, [status, lastCoords, ride?.id]);

    // Timer secundário para incrementar valor por minuto
    useEffect(() => {
        let priceTimer;
        if (status === 'IN_PROGRESS' || isWaiting) {
            priceTimer = setInterval(() => {
                setCurrentPrice(prev => prev + (ratePerMin / 60)); // Adiciona fração de minuto a cada segundo
            }, 1000);
        }
        return () => clearInterval(priceTimer);
    }, [status, isWaiting]);

    // SINCRO EM TEMPO REAL: Heartbeat que atualiza a Taxa no Servidor
    useEffect(() => {
        const syncInterval = setInterval(async () => {
            if (status === 'IN_PROGRESS' || isWaiting) {
                try {
                    const session = await getSession();
                    if (session) {
                        // Atualiza a taxa no banco para o passageiro ver em tempo real
                        // Passamos o status atual e o valor calculado no taxímetro
                        await api.driver.updateRideStatus(
                            ride.id, 
                            (status === 'IN_PROGRESS' ? 3 : 2), 
                            session.cidade_id || 1,
                            currentPrice.toFixed(2)
                        );
                    }
                } catch (e) {}
            }
        }, 10000); // 10 segundos
        return () => clearInterval(syncInterval);
    }, [status, isWaiting, currentPrice]);

    const startBackgroundTracking = async () => {
        if (IS_EXPO_GO) return;
        const { status: fg } = await Location.requestForegroundPermissionsAsync();
        if (fg !== 'granted') return;
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
        setLoading(true);
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
            setLoading(false);
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
            setLoading(true);
            const session = await getSession();
            await api.driver.updateRideStatus(ride.id, apiCode, session?.cidade_id || 1);
            setStatus(nextStatus);
        } catch (e) {
            Alert.alert('Falha', 'Erro ao atualizar status.');
        } finally {
            setLoading(false);
        }
    };

    const finalizeRide = async () => {
        if (!ride?.id) {
            Alert.alert('Corrida inválida', 'Nenhuma corrida ativa encontrada para finalizar.');
            return;
        }
        setLoading(true);
        try {
            const session = await getSession();
            const totalSeconds = Number(seconds || 0) + Number(waitingSeconds || 0);
            const tempoMinutos = Math.max(1, Math.round(totalSeconds / 60));
            const kmRodados = Math.max(0.01, Number(distance || 0));
            const enderecoFimRaw = ride?.endereco_fim_txt || ride?.endereco_fim || ride?.destino || '';
            const enderecoFim = String(enderecoFimRaw).trim();

            // Finalização completa do taxímetro: persiste taxa + tempo + km no histórico.
            await api.driver.finishRideTaxi({
                id_motorista: session?.id,
                id_cidade: session?.cidade_id || 1,
                id_corrida: ride.id,
                taxa: currentPrice.toFixed(2),
                tempo: String(tempoMinutos),
                km: kmRodados.toFixed(2),
                endereco_fim: enderecoFim || 'Destino não informado',
            });
            await saveSession({ activeRideId: null });
            stopBackgroundTracking();
            setStatus('FINISHED');
        } catch (e) {
            Alert.alert('Erro', 'Falha ao finalizar.');
        } finally {
            setLoading(false);
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
        const appleMap = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
        const googleAndroid = `google.navigation:q=${lat},${lng}&mode=d`;

        if (app === 'waze') {
            Linking.canOpenURL(wazeApp)
                .then((ok) => Linking.openURL(ok ? wazeApp : wazeWeb))
                .catch(() => Alert.alert('Erro', 'Não foi possível abrir o Waze.'));
            return;
        }

        if (Platform.OS === 'ios') {
            Linking.canOpenURL(googleIos)
                .then((ok) => Linking.openURL(ok ? googleIos : appleMap))
                .catch(() => Alert.alert('Erro', 'Não foi possível abrir o mapa.'));
            return;
        }

        Linking.openURL(googleAndroid).catch(() => Alert.alert('Erro', 'Não foi possível abrir o Google Maps.'));
    };

    if (!ride?.id) {
        return (
            <Container style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                <Icon name="error-outline" size={56} color="#f39c12" />
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 18, textAlign: 'center' }}>
                    Nenhuma corrida ativa no taximetro
                </Text>
                <Text style={{ color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>
                    Aceite uma corrida primeiro para iniciar o fluxo.
                </Text>
                <PrimaryButton color="#2c3e50" style={{ width: '100%', marginTop: 30 }} onPress={() => navigation.navigate('DriverHome')}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>VOLTAR</Text>
                </PrimaryButton>
            </Container>
        );
    }

    if (status === 'FINISHED') {
        return (
            <Container style={{ justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                <Icon name="check" size={60} color="#2ecc71" />
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginVertical: 20 }}>CONCLUÍDO</Text>
                <Value>R$ {currentPrice.toFixed(2).replace('.', ',')}</Value>
                <PrimaryButton color="#2ecc71" style={{ width: '100%', marginTop: 40 }} onPress={() => navigation.navigate('DriverHome')}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>PRÓXIMA CORRIDA</Text>
                </PrimaryButton>
            </Container>
        );
    }

    return (
        <Container>
            <StatusBar barStyle="light-content" />
            <StatusHeader color={isWaiting ? '#e67e22' : (status === 'WAY_TO_ORIGIN' ? '#34495e' : (status === 'ARRIVED' ? '#f39c12' : '#27ae60'))}>
                <TouchableOpacity onPress={() => navigation.navigate('DriverHome')}>
                    <Icon name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <StatusText>
                    {isWaiting ? 'EM ESPERA ATIVA' : status === 'WAY_TO_ORIGIN' ? 'A CAMINHO' : status === 'ARRIVED' ? 'NO LOCAL' : 'EM VIAGEM'}
                </StatusText>
                <TouchableOpacity onPress={() => setShowNavModal(true)}>
                    <Icon name="navigation" size={24} color="#fff" />
                </TouchableOpacity>
            </StatusHeader>

            <DashArea>
                <View style={{ padding: 25, flexDirection: 'row', alignItems: 'center' }}>
                    <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2ecc71', marginRight: 10, opacity: gpsOpacity }} />
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
                            <StatText style={{ color: isWaiting ? '#e67e22' : '#fff' }}>{formatTime(waitingSeconds)}</StatText>
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
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 2 }}>{ride.origem || 'Localização atual'}</Text>
                        </View>
                    </View>
                    <View style={{ width: 1, height: 15, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 3, marginBottom: 15 }} />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f44', marginRight: 15 }} />
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: '#64748b', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 }}>DESTINO FINAL</Text>
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 2 }}>
                                {isNoDestinationRide ? 'Sem destino definido (A combinar)' : (ride.destino || 'A definir durante trajeto')}
                            </Text>
                        </View>
                    </View>
                </View>
            </DashArea>

            <ActionFooter>
                {(status === 'ARRIVED' || isWaiting) && (
                    <WaitingButton active={isWaiting} onPress={toggleWaiting} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : (
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
                    disabled={loading}
                    color={status === 'IN_PROGRESS' ? '#e74c3c' : '#2ecc71'} 
                    onPress={handleAction}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : (
                        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>
                            {status === 'WAY_TO_ORIGIN' && 'CHEGUEI NO LOCAL'}
                            {status === 'ARRIVED' && 'INICIAR VIAGEM'}
                            {status === 'IN_PROGRESS' && 'FINALIZAR CORRIDA'}
                        </Text>
                    )}
                </PrimaryButton>
            </ActionFooter>
            
            <Modal visible={showNavModal} transparent animationType="slide">
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }} onPress={() => setShowNavModal(false)}>
                    <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 35 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: '#1a1c22', marginBottom: 25, textAlign: 'center' }}>NAVEGAR COM</Text>
                        <TouchableOpacity style={{ backgroundColor: '#f1f5f9', height: 74, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, marginBottom: 15 }} onPress={() => openMap('waze')}>
                            <Icon name="navigation" size={28} color="#05c8f8" />
                            <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 20 }}>Waze</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor: '#f1f5f9', height: 74, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25 }} onPress={() => openMap('google')}>
                            <Icon name="map" size={28} color="#4285F4" />
                            <Text style={{ fontSize: 18, fontWeight: '800', marginLeft: 20 }}>Google Maps</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowNavModal(false)} style={{ marginTop: 25, alignItems: 'center' }}>
                            <Text style={{ color: '#64748b', fontSize: 16, fontWeight: 'bold' }}>CANCELAR</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </Container>
    );
};

export default TaximeterScreen;
