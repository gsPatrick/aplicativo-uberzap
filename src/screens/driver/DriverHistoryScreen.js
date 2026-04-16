import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, TouchableOpacity, ActivityIndicator, Alert, Modal, Platform, FlatList, Dimensions, StyleSheet, Image } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { getSession } from '../../utils/session';

// Fallback for MapView
let MapView = View;
let Marker = View;
let Polyline = View;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
} catch (e) {}

const { width, height } = Dimensions.get('window');

const Container = styled.View`
  flex: 1;
  background-color: #0c0d0d;
`;

const Header = styled.View`
  background-color: #121212;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom-width: 1px;
  border-bottom-color: rgba(255, 255, 255, 0.05);
`;

const HeaderTitle = styled.Text`
  color: #fff;
  font-size: 18px;
  font-weight: bold;
`;

const DateSelector = styled.TouchableOpacity`
  background-color: #1f2120;
  margin: ${spacing.md}px;
  padding: 15px;
  border-radius: ${borderRadius.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.1);
`;

const DateText = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: 500;
`;

const RideCard = styled.TouchableOpacity`
  background-color: #1f2120;
  margin-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${borderRadius.lg}px;
  padding: 18px;
  border-width: 1px;
  border-color: ${props => props.active ? colors.primary : 'rgba(255, 255, 255, 0.05)'};
`;

const RideHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
`;

const RideTime = styled.Text`
  color: ${colors.primary};
  font-weight: bold;
  font-size: 14px;
`;

const RidePrice = styled.Text`
  color: #fff;
  font-weight: 900;
  font-size: 18px;
`;

const RouteContainer = styled.View`
  margin-vertical: 5px;
`;

const RouteItem = styled.View`
  flex-direction: row;
  align-items: center;
  margin-vertical: 4px;
`;

const RouteText = styled.Text`
  color: #94a3b8;
  font-size: 13px;
  margin-left: 12px;
  flex: 1;
`;

const Dot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${props => props.color || colors.primary};
`;

const PathLine = styled.View`
  width: 1px;
  height: 12px;
  background-color: rgba(255, 255, 255, 0.1);
  margin-left: 3.5px;
`;

// Modal Styles
const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0,0,0,0.8);
  justify-content: flex-end;
`;

const ModalContent = styled.View`
  background-color: #121212;
  border-top-left-radius: 30px;
  border-top-right-radius: 30px;
  height: ${height * 0.85}px;
  padding-bottom: 30px;
`;

const ModalHeader = styled.View`
  padding: 20px;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  border-bottom-width: 1px;
  border-bottom-color: rgba(255,255,255,0.05);
`;

const MapWrapper = styled.View`
  height: 250px;
  width: 100%;
  background-color: #1a1a1a;
  overflow: hidden;
`;

const DetailScroll = styled.ScrollView`
  padding: 20px;
`;

const MetricRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 25px;
`;

const MetricItem = styled.View`
  align-items: center;
  flex: 1;
`;

const MetricValue = styled.Text`
  color: #fff;
  font-size: 20px;
  font-weight: bold;
`;

const MetricLabel = styled.Text`
  color: #64748b;
  font-size: 12px;
  text-transform: uppercase;
  margin-top: 4px;
`;

const SectionTitle = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  margin-top: 10px;
`;

const DriverHistoryScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [rides, setRides] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedRide, setSelectedRide] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, [selectedDate]);

  const formatDateLabel = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatDateForApi = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const shiftDate = (days) => {
    setSelectedRide(null);
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + days);
      return d;
    });
  };

  const parseCoord = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.').trim();
      const n = Number(normalized);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const normalizeRide = (ride) => {
    const latIni = parseCoord(ride?.lat_ini);
    const lngIni = parseCoord(ride?.lng_ini);
    const latFim = parseCoord(ride?.lat_fim);
    const lngFim = parseCoord(ride?.lng_fim);
    return {
      ...ride,
      lat_ini: latIni,
      lng_ini: lngIni,
      lat_fim: latFim,
      lng_fim: lngFim,
      valor: ride?.valor ?? ride?.taxa ?? '0,00',
      endereco_ini: ride?.endereco_ini ?? ride?.endereco_ini_txt ?? '-',
      endereco_fim: ride?.endereco_fim ?? ride?.endereco_fim_txt ?? '-',
      metodo_pagamento: ride?.metodo_pagamento ?? ride?.f_pagamento ?? 'Viagem Particular',
    };
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) return;

      const dateParam = formatDateForApi(selectedDate);
      console.log(`Buscando histórico para Motorista ${session.id} na data ${dateParam}`);
      const response = await api.driver.getDriverHistory(session.id, dateParam);
      
      if (response.data && Array.isArray(response.data)) {
        setRides(response.data.map(normalizeRide));
      } else {
        setRides([]);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar o histórico.');
    } finally {
      setLoading(false);
    }
  };

  const renderRideItem = ({ item }) => (
    <RideCard activeOpacity={0.8} onPress={() => setSelectedRide(item)}>
      <RideHeader>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="access-time" size={16} color={colors.primary} />
          <RideTime style={{ marginLeft: 6 }}>{item.hora}</RideTime>
        </View>
        <RidePrice>R$ {item.valor}</RidePrice>
      </RideHeader>

      <RouteContainer>
        <RouteItem>
          <Dot color={colors.primary} />
          <RouteText numberOfLines={1}>{item.endereco_ini}</RouteText>
        </RouteItem>
        <PathLine />
        <RouteItem>
          <Dot color="#ef4444" />
          <RouteText numberOfLines={1}>{item.endereco_fim}</RouteText>
        </RouteItem>
      </RouteContainer>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 }}>
        <Text style={{ color: '#475569', fontSize: 11, fontWeight: 'bold' }}>ID: #{item.id}</Text>
        <View style={{ 
          backgroundColor: (item.status === '4' || item.status === 'Finalizada') ? 'rgba(58, 181, 107, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
          paddingHorizontal: 12, 
          paddingVertical: 5, 
          borderRadius: 20, 
          borderWidth: 1, 
          borderColor: (item.status === '4' || item.status === 'Finalizada') ? 'rgba(58, 181, 107, 0.2)' : 'rgba(239, 68, 68, 0.2)' 
        }}>
          <Text style={{ color: (item.status === '4' || item.status === 'Finalizada') ? colors.primary : '#ef4444', fontSize: 10, fontWeight: '900' }}>
            {(item.status_label || (item.status === '4' ? 'FINALIZADA' : 'CANCELADA')).toUpperCase()}
          </Text>
        </View>
      </View>
    </RideCard>
  );

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Header>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <HeaderTitle>Minhas Viagens</HeaderTitle>
        <TouchableOpacity onPress={fetchHistory}>
          <Icon name="refresh" size={24} color={colors.primary} />
        </TouchableOpacity>
      </Header>

      <DateSelector activeOpacity={0.8}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => shiftDate(-1)} style={{ padding: 4 }}>
            <Icon name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="event" size={20} color={colors.primary} />
            <DateText style={{ marginLeft: 12 }}>{formatDateLabel(selectedDate)}</DateText>
          </View>
          <TouchableOpacity onPress={() => shiftDate(1)} style={{ padding: 4 }}>
            <Icon name="chevron-right" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(58,181,107,0.12)', borderRadius: 12 }}>
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>HOJE</Text>
        </TouchableOpacity>
      </DateSelector>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
           <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={item => item.id.toString()}
          renderItem={renderRideItem}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 }}>
              <Icon name="history" size={70} color="rgba(255,255,255,0.05)" />
              <Text style={{ color: '#475569', marginTop: 20 }}>Nenhuma corrida encontrada.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {/* Modal de Detalhes da Corrida */}
      <Modal
        visible={!!selectedRide}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRide(null)}
      >
        <ModalOverlay>
          <ModalContent>
            <ModalHeader>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>Detalhes da Viagem</Text>
              <TouchableOpacity onPress={() => setSelectedRide(null)}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }}>
                    <Icon name="close" size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </ModalHeader>

            <MapWrapper>
              {selectedRide && (
                (Number.isFinite(selectedRide.lat_ini) &&
                Number.isFinite(selectedRide.lng_ini) &&
                Number.isFinite(selectedRide.lat_fim) &&
                Number.isFinite(selectedRide.lng_fim)) ? (
                  <MapView
                    style={StyleSheet.absoluteFillObject}
                    customMapStyle={darkMapStyle}
                    initialRegion={{
                      latitude: (selectedRide.lat_ini + selectedRide.lat_fim) / 2,
                      longitude: (selectedRide.lng_ini + selectedRide.lng_fim) / 2,
                      latitudeDelta: Math.max(Math.abs(selectedRide.lat_ini - selectedRide.lat_fim) * 2, 0.02),
                      longitudeDelta: Math.max(Math.abs(selectedRide.lng_ini - selectedRide.lng_fim) * 2, 0.02),
                    }}
                  >
                    <Marker coordinate={{ latitude: selectedRide.lat_ini, longitude: selectedRide.lng_ini }}>
                      <View style={{ backgroundColor: colors.primary, padding: 5, borderRadius: 20, borderWidth: 2, borderColor: '#fff' }} />
                    </Marker>
                    <Marker coordinate={{ latitude: selectedRide.lat_ini, longitude: selectedRide.lng_ini }} anchor={{ x: 0.5, y: 1.2 }}>
                      <View style={{ backgroundColor: '#1f2120', padding: 5, borderRadius: 5, borderWidth: 1, borderColor: colors.primary }}>
                        <Text style={{ color: '#fff', fontSize: 10 }}>Início</Text>
                      </View>
                    </Marker>

                    <Marker coordinate={{ latitude: selectedRide.lat_fim, longitude: selectedRide.lng_fim }}>
                      <View style={{ backgroundColor: '#ef4444', padding: 5, borderRadius: 20, borderWidth: 2, borderColor: '#fff' }} />
                    </Marker>
                    <Marker coordinate={{ latitude: selectedRide.lat_fim, longitude: selectedRide.lng_fim }} anchor={{ x: 0.5, y: 1.2 }}>
                      <View style={{ backgroundColor: '#1f2120', padding: 5, borderRadius: 5, borderWidth: 1, borderColor: '#ef4444' }}>
                        <Text style={{ color: '#fff', fontSize: 10 }}>Fim</Text>
                      </View>
                    </Marker>

                    <Polyline
                      coordinates={[
                        { latitude: selectedRide.lat_ini, longitude: selectedRide.lng_ini },
                        { latitude: selectedRide.lat_fim, longitude: selectedRide.lng_fim }
                      ]}
                      strokeWidth={3}
                      strokeColor={colors.primary}
                    />
                  </MapView>
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Icon name="map" size={30} color="#64748b" />
                    <Text style={{ color: '#94a3b8', marginTop: 8 }}>Coordenadas não disponíveis</Text>
                  </View>
                )
              )}
            </MapWrapper>

            <DetailScroll showsVerticalScrollIndicator={false}>
              <MetricRow>
                <MetricItem>
                  <MetricValue>R$ {selectedRide?.valor}</MetricValue>
                  <MetricLabel>Ganhos</MetricLabel>
                </MetricItem>
                {selectedRide?.km && (
                  <MetricItem>
                    <MetricValue>{selectedRide?.km} KM</MetricValue>
                    <MetricLabel>Distância</MetricLabel>
                  </MetricItem>
                )}
                {selectedRide?.tempo && (
                  <MetricItem>
                    <MetricValue>{selectedRide?.tempo} min</MetricValue>
                    <MetricLabel>Duração</MetricLabel>
                  </MetricItem>
                )}
              </MetricRow>

              <SectionTitle>Trajeto</SectionTitle>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 20, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
                  <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                    <Icon name="location-searching" size={20} color={colors.primary} />
                    <View style={{ marginLeft: 15, flex: 1 }}>
                        <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 'bold' }}>PARTIDA</Text>
                        <Text style={{ color: '#fff', fontSize: 14, marginTop: 2 }}>{selectedRide?.endereco_ini}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <Icon name="location-on" size={20} color="#ef4444" />
                    <View style={{ marginLeft: 15, flex: 1 }}>
                        <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 'bold' }}>DESTINO</Text>
                        <Text style={{ color: '#fff', fontSize: 14, marginTop: 2 }}>{selectedRide?.endereco_fim}</Text>
                    </View>
                  </View>
              </View>

              <SectionTitle style={{ marginTop: 30 }}>Passageiro</SectionTitle>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: 15, borderRadius: 20 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                      {selectedRide?.foto_cliente ? (
                          <Image source={{ uri: api.getImageUrl(selectedRide.foto_cliente) }} style={{ width: 44, height: 44 }} />
                      ) : (
                          <Icon name="person" size={24} color={colors.primary} />
                      )}
                  </View>
                  <View style={{ marginLeft: 15 }}>
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{selectedRide?.nome_cliente || 'Passageiro'}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>{selectedRide?.metodo_pagamento || 'Viagem Particular'}</Text>
                  </View>
              </View>

              {/* Seção de Avaliação (caso a API suporte futuramente) */}
              {selectedRide?.avaliacao && (
                <>
                  <SectionTitle style={{ marginTop: 30 }}>Avaliação</SectionTitle>
                  <View style={{ backgroundColor: 'rgba(58, 181, 107, 0.05)', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(58, 181, 107, 0.1)' }}>
                      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                          {[1,2,3,4,5].map(star => (
                              <Icon key={star} name="star" size={18} color={star <= selectedRide.avaliacao.nota ? '#fbbf24' : '#334155'} />
                          ))}
                      </View>
                      <Text style={{ color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>
                          "{selectedRide.avaliacao.comentario || 'Sem comentários'}"
                      </Text>
                  </View>
                </>
              )}
            </DetailScroll>
          </ModalContent>
        </ModalOverlay>
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

export default DriverHistoryScreen;
