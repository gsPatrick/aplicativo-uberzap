import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, TouchableOpacity, ActivityIndicator, Alert, Modal, Platform, FlatList, Dimensions, StyleSheet, Image } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { getSession } from '../../utils/session';
import { isSemDestino, labelDestinoSemDestino } from '../../utils/rideDestination';
import SmartImage from '../../components/SmartImage';

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

const { width, height } = Dimensions.get('window');

const Container = styled.View`
  flex: 1;
  background-color: #f8f9fa;
`;

const Header = styled.View`
  background-color: #fff;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom-width: 1px;
  border-bottom-color: #e2e8f0;
`;

const HeaderTitle = styled.Text`
  color: ${colors.text};
  font-size: 18px;
  font-weight: bold;
`;

const DateSelector = styled.TouchableOpacity`
  background-color: #fff;
  margin: ${spacing.md}px;
  padding: 15px;
  border-radius: ${borderRadius.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 1px;
  border-color: #e2e8f0;
  elevation: 2;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.05;
  shadow-radius: 4px;
`;

const DateText = styled.Text`
  color: ${colors.text};
  font-size: 16px;
  font-weight: 500;
`;

const RideCard = styled.TouchableOpacity`
  background-color: #fff;
  margin-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  border-radius: ${borderRadius.lg}px;
  padding: 18px;
  border-width: 1px;
  border-color: ${props => props.active ? colors.primary : '#e2e8f0'};
  elevation: 3;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.05;
  shadow-radius: 6px;
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
  color: ${colors.text};
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
  color: ${colors.textSecondary};
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
  background-color: #e2e8f0;
  margin-left: 3.5px;
`;

// Modal Styles
const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0,0,0,0.5);
  justify-content: flex-end;
`;

const ModalContent = styled.View`
  background-color: #fff;
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
  border-bottom-color: #e2e8f0;
`;

const MapWrapper = styled.View`
  height: 250px;
  width: 100%;
  background-color: #f1f5f9;
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
  color: ${colors.text};
  font-size: 20px;
  font-weight: bold;
`;

const MetricLabel = styled.Text`
  color: ${colors.textSecondary};
  font-size: 12px;
  text-transform: uppercase;
  margin-top: 4px;
`;

const SectionTitle = styled.Text`
  color: ${colors.text};
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
  const [viewMode, setViewMode] = useState('recent'); // 'recent' | 'date'
  const [selectedRide, setSelectedRide] = useState(null);

  useEffect(() => {
    fetchHistory();
  }, [selectedDate, viewMode]);

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
    setViewMode('date');
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
    const cleanAddr = (a) => {
      const s = (a ?? '').toString().trim();
      if (!s || s === '-' || /^no address available$/i.test(s)) return null;
      // descarta "endereço" que na verdade é só uma coordenada crua (lat,lng)
      if (/^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(s)) return null;
      return s;
    };
    const fallbackAddr = (lat, lng) =>
      (lat != null && lng != null && (lat !== 0 || lng !== 0))
        ? `Local aprox. (${lat.toFixed(5)}, ${lng.toFixed(5)})`
        : 'Endereço não disponível';
    const fmtPagamento = (v) => {
      const s = (v ?? '').toString().trim().toLowerCase();
      if (!s || s === '0' || s === 'undefined' || s === 'null') return 'Não informado';
      const map = {
        dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão', 'cartão': 'Cartão',
        credito: 'Cartão de crédito', debito: 'Cartão de débito', particular: 'Viagem particular',
      };
      return map[s] || v;
    };
    const rawFim = ride?.endereco_fim ?? ride?.endereco_fim_txt;
    const semDestino = isSemDestino(rawFim);
    return {
      ...ride,
      lat_ini: latIni,
      lng_ini: lngIni,
      lat_fim: latFim,
      lng_fim: lngFim,
      valor: ride?.valor ?? ride?.taxa ?? '0,00',
      semDestino,
      endereco_ini: cleanAddr(ride?.endereco_ini) ?? cleanAddr(ride?.endereco_ini_txt) ?? fallbackAddr(latIni, lngIni),
      endereco_fim: semDestino
        ? labelDestinoSemDestino(rawFim)
        : (cleanAddr(ride?.endereco_fim) ?? cleanAddr(ride?.endereco_fim_txt) ?? fallbackAddr(latFim, lngFim)),
      metodo_pagamento: fmtPagamento(ride?.metodo_pagamento ?? ride?.f_pagamento),
    };
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) return;

      const useRecent = viewMode === 'recent';
      const dateParam = formatDateForApi(selectedDate);
      console.log(
        useRecent
          ? `Buscando histórico recente — Motorista ${session.id}`
          : `Buscando histórico — Motorista ${session.id} na data ${dateParam}`
      );

      let response = await api.driver.getDriverHistory(
        session.id,
        useRecent ? null : dateParam,
        useRecent ? { modo: 'recent' } : {}
      );

      let items = Array.isArray(response.data) ? response.data.map(normalizeRide) : [];

      // Fallback: se filtro por data veio vazio, tenta viagens recentes
      if (!useRecent && items.length === 0) {
        const fallback = await api.driver.getDriverHistory(session.id, null, { modo: 'recent' });
        const allRecent = Array.isArray(fallback.data) ? fallback.data.map(normalizeRide) : [];
        const target = dateParam;
        items = allRecent.filter((ride) => {
          const raw = String(ride?.date || '');
          return raw.startsWith(target);
        });
      }

      setRides(items);
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
          <RideTime style={{ marginLeft: 6 }}>
            {viewMode === 'recent' && item.date
              ? `${String(item.date).slice(0, 10).split('-').reverse().join('/')} ${item.hora}`
              : item.hora}
          </RideTime>
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

      {item.semDestino && (
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 12, backgroundColor: 'rgba(245, 158, 11, 0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)' }}>
          <Icon name="explore" size={13} color="#d97706" />
          <Text style={{ color: '#b45309', fontSize: 10, fontWeight: '900', marginLeft: 4 }}>SEM DESTINO • TAXÍMETRO</Text>
        </View>
      )}

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
      <StatusBar barStyle="dark-content" />
      <Header>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <HeaderTitle>Minhas Viagens</HeaderTitle>
        <TouchableOpacity onPress={fetchHistory}>
          <Icon name="refresh" size={24} color={colors.primary} />
        </TouchableOpacity>
      </Header>

      <DateSelector activeOpacity={0.8}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={() => shiftDate(-1)} style={{ padding: 4 }}>
            <Icon name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Icon name="event" size={20} color={colors.primary} />
            <DateText style={{ marginLeft: 12 }}>{formatDateLabel(selectedDate)}</DateText>
          </View>
          <TouchableOpacity onPress={() => shiftDate(1)} style={{ padding: 4 }}>
            <Icon name="chevron-right" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => {
            setViewMode('recent');
            setSelectedRide(null);
          }}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: viewMode === 'recent' ? 'rgba(58,181,107,0.2)' : 'rgba(58,181,107,0.12)',
            borderRadius: 12,
            marginRight: 8,
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>RECENTES</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setViewMode('date');
            setSelectedDate(new Date());
            setSelectedRide(null);
          }}
          style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(58,181,107,0.12)', borderRadius: 12 }}
        >
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
              <Icon name="history" size={70} color="#cbd5e1" />
              <Text style={{ color: '#64748b', marginTop: 20, textAlign: 'center', paddingHorizontal: 30 }}>
                {viewMode === 'recent'
                  ? 'Nenhuma viagem finalizada ainda.'
                  : 'Nenhuma corrida nesta data.'}
              </Text>
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
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold' }}>Detalhes da Viagem</Text>
              <TouchableOpacity onPress={() => setSelectedRide(null)}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' }}>
                    <Icon name="close" size={24} color={colors.text} />
                </View>
              </TouchableOpacity>
            </ModalHeader>

            <DetailScroll showsVerticalScrollIndicator={false}>
              <MetricRow>
                <MetricItem>
                  <MetricValue>R$ {selectedRide?.valor}</MetricValue>
                  <MetricLabel>Ganhos</MetricLabel>
                </MetricItem>
                <MetricItem>
                  <MetricValue>{selectedRide?.km ? `${selectedRide.km} KM` : '—'}</MetricValue>
                  <MetricLabel>Distância</MetricLabel>
                </MetricItem>
                <MetricItem>
                  <MetricValue>{selectedRide?.tempo ? `${selectedRide.tempo} min` : '—'}</MetricValue>
                  <MetricLabel>Duração</MetricLabel>
                </MetricItem>
              </MetricRow>

              <SectionTitle>Trajeto</SectionTitle>
              {selectedRide?.semDestino && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)', marginBottom: 10 }}>
                  <Icon name="explore" size={18} color="#d97706" />
                  <Text style={{ color: '#b45309', fontSize: 12, fontWeight: 'bold', marginLeft: 8, flex: 1 }}>
                    Corrida sem destino (taxímetro) — destino definido no fim da corrida.
                  </Text>
                </View>
              )}
              <View style={{ backgroundColor: 'rgba(0,0,0,0.03)', padding: 20, borderRadius: 20, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
                  <View style={{ flexDirection: 'row', marginBottom: 20 }}>
                    <Icon name="location-searching" size={20} color={colors.primary} />
                    <View style={{ marginLeft: 15, flex: 1 }}>
                        <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 'bold' }}>PARTIDA</Text>
                        <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{selectedRide?.endereco_ini}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <Icon name="location-on" size={20} color="#ef4444" />
                    <View style={{ marginLeft: 15, flex: 1 }}>
                        <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 'bold' }}>DESTINO</Text>
                        <Text style={{ color: colors.text, fontSize: 14, marginTop: 2 }}>{selectedRide?.endereco_fim}</Text>
                    </View>
                  </View>
              </View>

              <SectionTitle style={{ marginTop: 30 }}>Passageiro</SectionTitle>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', padding: 15, borderRadius: 20 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                      <SmartImage value={selectedRide?.foto_cliente} style={{ width: 44, height: 44 }} fallbackIcon="person" fallbackSize={24} fallbackBg="transparent" alignTop />
                  </View>
                  <View style={{ marginLeft: 15, flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 16 }}>{(selectedRide?.nome_cliente || '').trim() || 'Passageiro não identificado'}</Text>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Pagamento: {selectedRide?.metodo_pagamento || 'Não informado'}</Text>
                  </View>
              </View>

              <SectionTitle style={{ marginTop: 30 }}>Avaliação</SectionTitle>
              {selectedRide?.avaliacao ? (
                  <View style={{ backgroundColor: 'rgba(58, 181, 107, 0.05)', padding: 15, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(58, 181, 107, 0.1)' }}>
                      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                          {[1,2,3,4,5].map(star => (
                              <Icon key={star} name="star" size={18} color={star <= selectedRide.avaliacao.nota ? '#fbbf24' : '#cbd5e1'} />
                          ))}
                      </View>
                      <Text style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
                          "{selectedRide.avaliacao.comentario || 'Sem comentários'}"
                      </Text>
                  </View>
              ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', padding: 15, borderRadius: 20 }}>
                      <Icon name="star-border" size={20} color="#94a3b8" />
                      <Text style={{ color: '#94a3b8', fontSize: 13, marginLeft: 8 }}>Esta corrida não foi avaliada.</Text>
                  </View>
              )}

              <View style={{ height: 20 }} />
            </DetailScroll>
          </ModalContent>
        </ModalOverlay>
      </Modal>
    </Container>
  );
};

const darkMapStyle = [];

export default DriverHistoryScreen;
