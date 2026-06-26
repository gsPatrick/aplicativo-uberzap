import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, Dimensions, ActivityIndicator, StatusBar, Platform } from 'react-native';
import styled from 'styled-components/native';
import Icon from '../../components/AppIcon';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getSession } from '../../utils/session';

const { width } = Dimensions.get('window');

const Container = styled.View`
  flex: 1;
  background-color: ${colors.background};
`;

const Header = styled(LinearGradient)`
  padding: 50px 20px 30px;
  border-bottom-left-radius: 40px;
  border-bottom-right-radius: 40px;
`;

const Content = styled.ScrollView`
  flex: 1;
  padding: 20px;
`;

const Title = styled.Text`
  color: ${colors.text};
  font-size: 24px;
  font-weight: 900;
  margin-bottom: 5px;
`;

const Subtitle = styled.Text`
  color: #64748b;
  font-size: 14px;
`;

const SummaryRow = styled.ScrollView.attrs({
  horizontal: true,
  showsHorizontalScrollIndicator: false,
})`
  margin-top: 25px;
`;

const SummaryCard = styled.View`
  width: ${width * 0.4}px;
  background-color: ${props => props.active ? colors.primary : '#131C2E'};
  padding: 20px;
  border-radius: 25px;
  margin-right: 15px;
  border-width: 1px;
  border-color: ${props => props.active ? 'transparent' : '#243049'};
`;

const ChartContainer = styled.View`
  background-color: #131C2E;
  border-radius: 30px;
  padding: 25px;
  margin-top: 30px;
  border-width: 1px;
  border-color: #243049;
`;

const BarRow = styled.View`
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
  height: 150px;
  margin-top: 20px;
`;

const BarCol = styled.View`
  align-items: center;
`;

const Bar = styled.View`
  width: 15px;
  height: ${props => props.height}%;
  background-color: ${props => props.active ? colors.primary : '#243049'};
  border-radius: 10px;
  margin-bottom: 10px;
`;

const DayText = styled.Text`
  color: ${props => props.active ? colors.primary : '#64748b'};
  font-size: 10px;
  font-weight: bold;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: 30px;
  margin-bottom: 15px;
`;

const TripCard = styled.TouchableOpacity`
  background-color: #131C2E;
  padding: 20px;
  border-radius: 20px;
  flex-direction: row;
  align-items: center;
  margin-bottom: 12px;
  border-width: 1px;
  border-color: #243049;
  border-left-width: 4px;
  border-left-color: ${colors.primary};
`;

const DriverEarningsScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [activeTab, setActiveTab] = useState('hoje');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const session = await getSession();
      if (!session) return;

      // Busca relatório financeiro real
      const resp = await api.driver.getDriverReport(session.id);
      if (resp.data) setReport(resp.data);

      // Busca histórico recente para a seção de Atividade
      const today = new Date().toLocaleDateString('pt-BR');
      const historyResp = await api.driver.getDriverHistory(session.id, today);
      if (historyResp.data && Array.isArray(historyResp.data)) {
        setRecentTrips(historyResp.data.slice(0, 3));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Container>
    );
  }

  const days = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

  return (
    <Container>
      <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
      <Header colors={['#0B1220', '#131C2E']}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 15 }}>
          <Icon name="arrow-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Title>Seus Ganhos</Title>
        <Subtitle>Acompanhe seu desempenho financeiro</Subtitle>

        <SummaryRow>
          {[
            { id: 'hoje', label: 'Hoje', val: report?.lucro_hoje || '0,00' },
            { id: 'semanal', label: 'Semana', val: report?.lucro_semana || '0,00' },
            { id: 'mensal', label: 'Mês', val: report?.lucro_mes || '0,00' },
          ].map(tab => (
            <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)}>
              <SummaryCard active={activeTab === tab.id}>
                <Text style={{ color: activeTab === tab.id ? '#fff' : '#64748b', fontSize: 12, fontWeight: 'bold' }}>{tab.label.toUpperCase()}</Text>
                <Text style={{ color: activeTab === tab.id ? '#fff' : colors.text, fontSize: 22, fontWeight: '900', marginTop: 5 }}>R$ {tab.val}</Text>
              </SummaryCard>
            </TouchableOpacity>
          ))}
        </SummaryRow>
      </Header>

      <Content showsVerticalScrollIndicator={false}>
        <ChartContainer>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>Tendência Semanal</Text>
            <View style={{ backgroundColor: 'rgba(58, 181, 107, 0.1)', padding: 5, borderRadius: 8 }}>
               <Text style={{ color: colors.primary, fontSize: 12 }}>Atualizado hoje</Text>
            </View>
          </View>
          
          <BarRow>
            {(report?.grafico || [20, 30, 45, 25, 60, 40, 50]).map((h, i) => (
              <BarCol key={i}>
                <Bar height={h} active={i === 6} />
                <DayText active={i === 6}>{days[i]}</DayText>
              </BarCol>
            ))}
          </BarRow>
        </ChartContainer>

        <SectionHeader>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: 'bold' }}>Atividade Recente</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DriverHistory')}>
            <Text style={{ color: colors.primary, fontWeight: 'bold' }}>Ver Tudo</Text>
          </TouchableOpacity>
        </SectionHeader>

        {recentTrips.length > 0 ? (
          recentTrips.map((item, idx) => (
            <TripCard key={idx} activeOpacity={0.8} onPress={() => navigation.navigate('DriverHistory')}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                <Icon name="directions-car" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 15 }}>Viagem #{item.id}</Text>
                <Text style={{ color: '#64748b', fontSize: 11 }}>{item.hora} • {item.nome_cliente || 'Passageiro'}</Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>R$ {item.valor}</Text>
            </TripCard>
          ))
        ) : (
          <View style={{ padding: 30, alignItems: 'center', backgroundColor: '#131C2E', borderRadius: 20, borderWidth: 1, borderColor: '#243049' }}>
              <Icon name="history" size={40} color="#94a3b8" />
              <Text style={{ color: '#64748b', marginTop: 10 }}>Nenhuma atividade hoje.</Text>
          </View>
        )}
        
        <View style={{ height: 40 }} />
      </Content>
    </Container>
  );
};

export default DriverEarningsScreen;
