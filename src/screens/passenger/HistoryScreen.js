import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet, Modal, Dimensions, Animated, Platform, ScrollView, Image } from 'react-native';
import styled from 'styled-components/native';
import Icon from '../../components/AppIcon';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getSession } from '../../utils/session';
import { isSemDestino, labelDestinoSemDestino } from '../../utils/rideDestination';
import SmartImage from '../../components/SmartImage';

// Fallback para MapView
let MapView = View;
let Marker = View;
let Polyline = View;
let PROVIDER_GOOGLE = null;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
} catch (e) {}

const decodePolyline = (t) => {
    if (!t) return [];
    let n, o, r = 0, l = 0, a = 0, h = [];
    const d = t.length;
    while (r < d) {
        let i = 0, f = 0;
        do {
            n = t.charCodeAt(r++) - 63;
            f |= (31 & n) << i;
            i += 5;
        } while (n >= 32);
        let p = (1 & f) ? ~(f >> 1) : f >> 1;
        l += p;
        i = 0;
        f = 0;
        do {
            o = t.charCodeAt(r++) - 63;
            f |= (31 & o) << i;
            i += 5;
        } while (o >= 32);
        let g = (1 & f) ? ~(f >> 1) : f >> 1;
        a += g;
        h.push({
            latitude: l / 1e5,
            longitude: a / 1e5
        });
    }
    return h;
};

const { width } = Dimensions.get('window');

const Container = styled.View`
  flex: 1;
  background-color: #0B1220;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  background-color: #131C2E;
  border-bottom-width: 1px;
  border-bottom-color: #243049;
`;

const BackButton = styled.TouchableOpacity`
  width: 40px;
  height: 40px;
  justify-content: center;
  align-items: center;
`;

const HeaderTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: #F1F5F9;
  margin-left: 10px;
`;

const RideCard = styled(Animated.createAnimatedComponent(TouchableOpacity))`
  background-color: #131C2E;
  margin-horizontal: ${spacing.md}px;
  margin-vertical: 10px;
  border-radius: 20px;
  overflow: hidden;
  elevation: 5;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.1;
  shadow-radius: 8px;
`;

const MapPreview = styled.View`
  height: 120px;
  width: 100%;
  background-color: #131C2E;
`;

const MapOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.4);
  justify-content: center;
  align-items: center;
`;

const CardContent = styled.View`
  padding: 16px;
`;

const RideHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const RideDate = styled.Text`
  font-size: 13px;
  color: #94a3b8;
  font-weight: 600;
`;

const RideValue = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #F1F5F9;
`;

const AddressRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 4px;
`;

const AddressText = styled.Text`
  font-size: 14px;
  color: #94A3B8;
  flex: 1;
  margin-left: 10px;
`;

const DriverSection = styled.View`
  flex-direction: row;
  align-items: center;
  border-top-width: 1px;
  border-top-color: #243049;
  padding-top: 12px;
  margin-top: 12px;
`;

const DriverBadge = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  flex: 1;
`;

const DriverAvatar = styled.View`
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background-color: #1B2740;
  justify-content: center;
  align-items: center;
`;

const DriverName = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: ${colors.primary};
  margin-left: 10px;
`;

const RatingSmall = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: #1B2740;
  padding-horizontal: 8px;
  padding-vertical: 4px;
  border-radius: 8px;
`;

const DetailModal = styled.View`
  flex: 1;
  background-color: #0B1220;
`;

const RideItem = ({ item, index, onPress, onDriverPress }) => {
    const cardAnim = useRef(new Animated.Value(0)).current;
    
    useEffect(() => {
        Animated.timing(cardAnim, {
            toValue: 1,
            duration: 500,
            delay: index * 100,
            useNativeDriver: true
        }).start();
    }, []);

    return (
      <RideCard 
        activeOpacity={0.95}
        onPress={onPress}
        style={{ opacity: cardAnim, transform: [{ translateY: cardAnim.interpolate({ inputRange:[0,1], outputRange:[30,0] }) }] }}
      >
        <MapPreview>
          {Platform.OS !== 'web' ? (
            <MapView
              style={{ flex: 1 }}
              liteMode={true}
              scrollEnabled={false}
              zoomEnabled={false}
              initialRegion={{
                latitude: -23.5617,
                longitude: -46.6623,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
            />
          ) : (
             <View style={{ flex: 1, backgroundColor: '#131C2E', justifyContent: 'center', alignItems: 'center' }}>
                <Icon name="map" size={40} color="#94A3B8" />
             </View>
          )}
          <MapOverlay>
             <Icon name="location-searching" size={32} color={colors.primary} style={{ opacity: 0.5 }} />
          </MapOverlay>
        </MapPreview>

        <CardContent>
          <RideHeader>
            <RideDate>{item.date}</RideDate>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               {item.status !== 'Cancelado' && item.status !== 'Cancelada' && (
                 <RatingSmall style={{ marginRight: 10, backgroundColor: '#1B2740' }}>
                   <Icon name="star" size={14} color="#F59E0B" />
                   <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#F59E0B', marginLeft: 4 }}>{item.avaliacao || '5'}.0</Text>
                 </RatingSmall>
               )}
               <RideValue style={{ color: (item.status === 'Cancelado' || item.status === 'Cancelada') ? '#94a3b8' : '#F1F5F9' }}>
                 {(item.status === 'Cancelado' || item.status === 'Cancelada') ? 'CANCELADA' : (item.valor ? `R$ ${item.valor}` : 'R$ 0,00')}
               </RideValue>
            </View>
          </RideHeader>

          <AddressRow>
            <Icon name="circle" size={10} color={(item.status === 'Cancelado' || item.status === 'Cancelada') ? "#94A3B8" : "#22C55E"} />
            <AddressText numberOfLines={1}>{item.endereco_ini || 'Origem não definida'}</AddressText>
          </AddressRow>
          <AddressRow>
            <Icon name="location-on" size={12} color={(item.status === 'Cancelado' || item.status === 'Cancelada') ? "#94A3B8" : "#EF4444"} />
            <AddressText numberOfLines={1}>{item.endereco_fim || 'Destino não definido'}</AddressText>
          </AddressRow>

          {item.semDestino && (
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 8, backgroundColor: 'rgba(245, 158, 11, 0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)' }}>
              <Icon name="explore" size={13} color="#F59E0B" />
              <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '900', marginLeft: 4 }}>SEM DESTINO • TAXÍMETRO</Text>
            </View>
          )}

          <DriverSection>
            <DriverBadge onPress={onDriverPress} disabled={!item.motorista}>
              <DriverAvatar><Icon name="person" size={20} color="#94a3b8" /></DriverAvatar>
              <DriverName style={{ color: item.motorista ? colors.primary : '#94a3b8' }}>
                {item.motorista || 'Busca não finalizada'}
              </DriverName>
            </DriverBadge>
            
            {item.avaliacao > 0 ? (
              <RatingSmall>
                <Icon name="star" size={14} color="#F59E0B" />
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#F59E0B', marginLeft: 4 }}>{item.avaliacao}.0</Text>
              </RatingSmall>
            ) : (
              <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Não avaliado</Text>
            )}
            <Icon name="chevron-right" size={20} color="#94A3B8" style={{ marginLeft: 8 }} />
          </DriverSection>
        </CardContent>
      </RideCard>
    );
};

const HistoryScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState([]);
  const [selectedRide, setSelectedRide] = useState(null);

  const loadHistory = React.useCallback(async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) {
        navigation.navigate('PassengerLogin');
        return;
      }
      const response = await api.passenger.getHistory(session.telefone, session.senha);
      if (response.data && Array.isArray(response.data)) {
        const parsed = response.data.map(ride => {
          const latIni = parseFloat(String(ride.lat_ini).replace(',', '.'));
          const lngIni = parseFloat(String(ride.lng_ini).replace(',', '.'));
          const latFim = parseFloat(String(ride.lat_fim).replace(',', '.'));
          const lngFim = parseFloat(String(ride.lng_fim).replace(',', '.'));
          const rawFim = ride.endereco_fim ?? ride.endereco_fim_txt;
          const semDestino = isSemDestino(rawFim);
          return {
            ...ride,
            lat_ini: !isNaN(latIni) ? latIni : null,
            lng_ini: !isNaN(lngIni) ? lngIni : null,
            lat_fim: !isNaN(latFim) ? latFim : null,
            lng_fim: !isNaN(lngFim) ? lngFim : null,
            semDestino,
            endereco_fim: semDestino ? labelDestinoSemDestino(rawFim) : ride.endereco_fim,
          };
        });
        setRides(parsed);
      } else {
        setRides([]);
      }
    } catch (e) {
      console.error(e);
      setRides([]);
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useFocusEffect(
    React.useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  return (
    <Container>
      <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
      <Header>
        <BackButton onPress={() => navigation.goBack()}><Icon name="close" size={28} color="#F1F5F9" /></BackButton>
        <HeaderTitle>Suas Viagens</HeaderTitle>
      </Header>

      <FlatList
        data={rides}
        renderItem={({ item, index }) => (
            <RideItem 
                item={item} 
                index={index} 
                onPress={() => setSelectedRide(item)} 
                onDriverPress={() => item.motorista && navigation.navigate('DriverProfileScreen', { 
                    driver: { 
                        nome: item.motorista, 
                        foto: api.getImageUrl(item.foto_motorista),
                        rating: item.avaliacao || '5.0',
                        veiculo: item.veiculo || 'Carro Particular',
                        placa: item.placa || 'Individual'
                    } 
                })}
            />
        )}
        keyExtractor={(item, index) => item?.id ? String(item.id) : String(index)}
        onRefresh={loadHistory}
        refreshing={loading}
        contentContainerStyle={{ paddingVertical: 15 }}
        ListEmptyComponent={
          !loading && (
            <View style={{ flex: 1, alignItems: 'center', marginTop: 100 }}>
              <Icon name="history" size={80} color="#243049" />
              <Text style={{ color: '#94a3b8', marginTop: 15 }}>Sem viagens recentes</Text>
            </View>
          )
        }
      />

      <Modal visible={!!selectedRide} animationType="slide">
          <DetailModal>
            {/* Header com Mapa */}
            <View style={{ height: 250, width: '100%', position: 'relative' }}>
                {Platform.OS !== 'web' ? (
                  <MapView
                    style={{ flex: 1 }}
                    initialRegion={{
                      latitude: selectedRide?.lat_ini || -23.5617,
                      longitude: selectedRide?.lng_ini || -46.6623,
                      latitudeDelta: 0.05,
                      longitudeDelta: 0.05,
                    }}
                  >
                    {selectedRide?.lat_ini != null && selectedRide?.lng_ini != null && selectedRide?.lat_fim != null && selectedRide?.lng_fim != null && (
                        <>
                           <Marker coordinate={{ latitude: selectedRide.lat_ini, longitude: selectedRide.lng_ini }} title="Início" pinColor="green" />
                           <Marker coordinate={{ latitude: selectedRide.lat_fim, longitude: selectedRide.lng_fim }} title="Fim" />
                           <Polyline 
                             coordinates={
                               selectedRide.polyline ? decodePolyline(selectedRide.polyline) : [
                                 { latitude: selectedRide.lat_ini, longitude: selectedRide.lng_ini },
                                 { latitude: selectedRide.lat_fim, longitude: selectedRide.lng_fim }
                               ]
                             }
                             strokeWidth={3}
                             strokeColor={colors.primary}
                           />
                        </>
                    )}
                  </MapView>
                ) : (
                   <View style={{ flex: 1, backgroundColor: '#131C2E', justifyContent: 'center', alignItems: 'center' }}>
                      <Icon name="map" size={60} color="#94A3B8" />
                   </View>
                )}
                <TouchableOpacity 
                   onPress={() => setSelectedRide(null)} 
                   style={{ position: 'absolute', top: 20, left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', elevation: 5 }}>
                  <Icon name="close" size={28} />
                </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, padding: 25 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#F1F5F9' }}>
                          Viagem em {selectedRide?.date?.split(' ')[0]}
                        </Text>
                        <Text style={{
                          fontSize: 16,
                          fontWeight: '600',
                          color: (selectedRide?.status === 'Cancelado' || selectedRide?.status === 'Cancelada') ? '#EF4444' : '#94A3B8'
                        }}>
                          {(selectedRide?.status === 'Cancelado' || selectedRide?.status === 'Cancelada') ? 'CORRIDA CANCELADA' : selectedRide?.status}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <RideValue style={{ color: (selectedRide?.status === 'Cancelado' || selectedRide?.status === 'Cancelada') ? '#94a3b8' : '#F1F5F9' }}>
                          {selectedRide?.valor ? `R$ ${selectedRide.valor}` : '---'}
                        </RideValue>
                        {selectedRide?.status !== 'Cancelado' && (
                          <RatingSmall style={{ marginTop: 5 }}>
                              <Icon name="star" size={14} color="#F59E0B" />
                              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#F59E0B', marginLeft: 4 }}>
                                {selectedRide?.avaliacao}.0
                              </Text>
                          </RatingSmall>
                        )}
                    </View>
                </View>

                {selectedRide?.motorista ? (
                  <View style={{ backgroundColor: '#131C2E', padding: 20, borderRadius: 20, marginBottom: 25 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                          <SmartImage value={selectedRide?.foto_motorista} style={{ width: 44, height: 44, borderRadius: 22 }} fallbackIcon="person" fallbackSize={22} alignTop />
                          <View style={{ marginLeft: 15 }}>
                               <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#F1F5F9' }}>{selectedRide?.motorista}</Text>
                               <Text style={{ fontSize: 13, color: '#64748b' }}>Motorista Oficial</Text>
                          </View>
                      </View>
                      
                      {/* Veículo Details */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#243049', paddingTop: 15 }}>
                          <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase' }}>Veículo</Text>
                              <Text style={{ fontSize: 16, color: '#F1F5F9', fontWeight: '600' }}>{selectedRide?.veiculo || 'Veículo Atribuído'}</Text>
                          </View>
                          {selectedRide?.placa && (
                            <View style={{ alignItems: 'flex-end', backgroundColor: '#0B1220', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 10 }}>
                                 <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary, letterSpacing: 1 }}>{selectedRide.placa}</Text>
                            </View>
                          )}
                      </View>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#131C2E', padding: 20, borderRadius: 20, marginBottom: 25, borderDashArray: [5, 5], borderWidth: 1, borderColor: '#243049' }}>
                      <Text style={{ color: '#EF4444', fontWeight: 'bold', textAlign: 'center' }}>Nenhum motorista foi atribuído a esta corrida.</Text>
                  </View>
                )}
                
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#F1F5F9' }}>Caminho Percorrido</Text>
                <View style={{ paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#243049', marginLeft: 5 }}>
                    <View style={{ marginBottom: 20 }}>
                        <Text style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Origem</Text>
                        <Text style={{ fontSize: 16, color: '#F1F5F9', fontWeight: '500' }}>{selectedRide?.endereco_ini || 'Local de partida não registrado'}</Text>
                    </View>
                    <View>
                        <Text style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Destino</Text>
                        <Text style={{ fontSize: 16, color: '#F1F5F9', fontWeight: '500' }}>{selectedRide?.endereco_fim || 'Destino não registrado'}</Text>
                        {selectedRide?.semDestino && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 8, backgroundColor: 'rgba(245, 158, 11, 0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)' }}>
                                <Icon name="explore" size={13} color="#F59E0B" />
                                <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '900', marginLeft: 4 }}>SEM DESTINO • TAXÍMETRO</Text>
                            </View>
                        )}
                    </View>
                </View>

                <TouchableOpacity 
                   onPress={() => setSelectedRide(null)}
                   style={{ backgroundColor: colors.primary, height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 40, marginBottom: 50 }}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>OK, ENTENDI</Text>
                </TouchableOpacity>
            </ScrollView>
          </DetailModal>
      </Modal>
    </Container>
  );
};

export default HistoryScreen;
