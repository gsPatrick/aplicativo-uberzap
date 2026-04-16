import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, FlatList, StyleSheet, Modal, Clipboard, Animated, Dimensions, Platform, Linking } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { getSession } from '../../utils/session';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const Container = styled.View`
  flex: 1;
  background-color: #f8f9fa;
`;

const Content = styled.ScrollView`
  flex: 1;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  background-color: transparent;
`;

const BackButton = styled.TouchableOpacity`
  width: 45px;
  height: 45px;
  border-radius: 22.5px;
  background-color: #fff;
  justify-content: center;
  align-items: center;
  elevation: 4;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.1;
  shadow-radius: 4px;
`;

const HeaderTitle = styled.Text`
  font-size: 22px;
  font-weight: bold;
  color: ${colors.secondary};
`;

const CardContainer = styled(Animated.View)`
  margin: ${spacing.md}px;
  border-radius: 24px;
  overflow: hidden;
  elevation: 15;
  shadow-color: ${colors.primary};
  shadow-offset: 0px 10px;
  shadow-opacity: 0.3;
  shadow-radius: 15px;
`;

const CardGradient = styled(LinearGradient)`
  padding: 30px;
  min-height: 200px;
`;

const CardHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
`;

const ChipIcon = styled.View`
  width: 50px;
  height: 35px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.3);
`;

const BalanceLabel = styled.Text`
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const BalanceValue = styled.Text`
  color: #fff;
  font-size: 42px;
  font-weight: bold;
  margin-top: 5px;
`;

const CardFooter = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 40px;
`;

const UserName = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
`;

const QuickActions = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-top: 10px;
  padding-horizontal: ${spacing.md}px;
`;

const ActionButton = styled.TouchableOpacity`
  align-items: center;
  width: 25%;
`;

const ActionIcon = styled.View`
  width: 55px;
  height: 55px;
  border-radius: 18px;
  background-color: #fff;
  justify-content: center;
  align-items: center;
  elevation: 5;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.1;
  shadow-radius: 6px;
  margin-bottom: 8px;
`;

const ActionText = styled.Text`
  font-size: 12px;
  color: ${colors.secondary};
  font-weight: 600;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-horizontal: ${spacing.md}px;
  margin-top: 30px;
  margin-bottom: 15px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: ${colors.secondary};
`;

const TransactionItem = styled(Animated.View)`
  flex-direction: row;
  align-items: center;
  background-color: ${props => {
    const s = props.status?.toLowerCase() || '';
    if (s.includes('conclui') || s.includes('aprov') || s.includes('valid')) return '#e8f5e9'; // Verde suave
    if (s.includes('pend') || s.includes('aguard')) return '#fff9c4'; // Amarelo suave
    if (s.includes('canc')) return '#ffebee'; // Vermelho suave
    return '#fff';
  }};
  padding: 16px;
  margin-horizontal: ${spacing.md}px;
  margin-vertical: 6px;
  border-radius: 20px;
  border-width: 1px;
  border-color: ${props => {
    const s = props.status?.toLowerCase() || '';
    if (s.includes('conclui') || s.includes('aprov') || s.includes('valid')) return '#c8e6c9';
    if (s.includes('pend') || s.includes('aguard')) return '#fff176';
    if (s.includes('canc')) return '#ffcdd2';
    return '#f0f0f0';
  }};
`;

const IconBox = styled.View`
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background-color: ${props => props.type === 'Entrada' ? '#e8f5e9' : '#fef2f2'};
  justify-content: center;
  align-items: center;
  margin-right: 15px;
`;

const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0,0,0,0.5);
  justify-content: flex-end;
`;

const ModalContent = styled.View`
  background-color: #fff;
  border-top-left-radius: 30px;
  border-top-right-radius: 30px;
  padding: 30px;
  min-height: 400px;
`;

const AmountOption = styled.TouchableOpacity`
  flex: 1;
  height: 60px;
  background-color: ${props => props.selected ? colors.primary : '#f5f5f5'};
  border-radius: 15px;
  justify-content: center;
  align-items: center;
  margin: 5px;
`;

const AmountText = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: ${props => props.selected ? '#fff' : '#333'};
`;

const TransactionItemComp = ({ item, index }) => {
    const itemAnim = useRef(new Animated.Value(0)).current;
    
    // Cores baseadas no status
    const getStatusColors = (status) => {
        const s = status?.toLowerCase() || '';
        if (s.includes('conclui') || s.includes('aprov') || s.includes('valid')) {
            return { bg: '#e8f5e9', border: '#c8e6c9', main: '#2e7d32', muted: '#66bb6a' };
        }
        if (s.includes('pend') || s.includes('aguard')) {
            return { bg: '#fff9c4', border: '#fff176', main: '#f57f17', muted: '#fbc02d' };
        }
        if (s.includes('canc')) {
            return { bg: '#ffebee', border: '#ffcdd2', main: '#c62828', muted: '#ef5350' };
        }
        return { bg: '#fff', border: '#f0f0f0', main: colors.secondary, muted: '#94a3b8' };
    };

    const stC = getStatusColors(item.status);

    useEffect(() => {
      Animated.timing(itemAnim, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: true }).start();
    }, []);

    return (
      <TransactionItem 
        status={item.status}
        style={{ 
          opacity: itemAnim, 
          transform: [{ translateY: itemAnim.interpolate({ inputRange:[0,1], outputRange:[20,0] }) }] 
        }}
      >
        <IconBox style={{ backgroundColor: 'transparent' }}>
          <Icon 
            name={item.tipo === 'Entrada' ? 'north-east' : 'south-west'} 
            size={24} 
            color={stC.main} 
          />
        </IconBox>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: stC.main }}>{item.descricao}</Text>
          <Text style={{ fontSize: 12, color: stC.muted, marginTop: 2 }}>{item.date}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 17, fontWeight: 'bold', color: stC.main }}>
            {item.tipo === 'Entrada' ? '+' : '-'} R$ {item.valor}
          </Text>
          <Text style={{ fontSize: 11, color: stC.main, fontWeight: '800', marginTop: 2 }}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </TransactionItem>
    );
};

const WalletScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ saldo: '0,00', transacoes: [] });
  const [userName, setUserName] = useState('Passageiro');
  const [rechargeModal, setRechargeModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(50);
  const [pixStep, setPixStep] = useState(1); // 1: Select Amount, 2: Show Code

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    loadData();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true })
    ]).start();
  }, []);

  // Polling para verificar se o PIX caiu (Confirmação Automática)
  useEffect(() => {
    let pollInterval;
    const checkPayment = async () => {
      try {
        const session = await getSession();
        if (!session) return;
        
        const profileRes = await api.passenger.getProfile(session.telefone, session.senha);
        const user = profileRes.data;
        if (!user || !user.id) return;

        const response = await api.passenger.checkTransactionStatus(user.cidade_id || 1, user.id);
        if (response.data && response.data.status === 'ok') {
          // Pagamento confirmado! Recarrega os dados.
          loadData();
          alert('Recarga confirmada com sucesso! Seu saldo foi atualizado.');
          clearInterval(pollInterval);
        }
      } catch (e) {
        console.log('Erro ao verificar status do PIX:', e);
      }
    };

    // Só começa o polling se houver chance de recarga pendente (opcionalmente podemos deixar rodando enquanto a tela está aberta)
    pollInterval = setInterval(checkPayment, 10000); // 10 segundos
    
    return () => clearInterval(pollInterval);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) {
        navigation.navigate('PassengerLogin');
        return;
      }
      
      const response = await api.passenger.getWallet(session.telefone, session.senha);
      if (response.data) {
        const mappedTransactions = (response.data.transacoes || []).map(t => {
          const isNegative = parseFloat(t.valor) < 0;
          const valorFormatado = Math.abs(parseFloat(t.valor)).toFixed(2).replace('.', ',');
          let descricao = '';
          
          if (isNegative) {
            descricao = 'Pagamento de Corrida';
          } else {
            descricao = `Recarga R$ ${valorFormatado}`;
          }

          return {
            ...t,
            tipo: isNegative ? 'Saída' : 'Entrada',
            descricao: descricao,
            valor: valorFormatado,
            status: t.status || 'Concluído'
          };
        });

        setData({
          saldo: response.data.saldo || '0,00',
          transacoes: mappedTransactions
        });
      }

      const profileRes = await api.passenger.getProfile(session.telefone, session.senha);
      if (profileRes.data && profileRes.data.nome) {
        setUserName(profileRes.data.nome);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = () => {
    alert('Ao clicar em "GERAR PIX", abriremos a página oficial de pagamento para você concluir a recarga.');
  };

  const handleRecharge = async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) return;

      // 1. Get profile to have city_id
      const profileRes = await api.passenger.getProfile(session.telefone, session.senha);
      const user = profileRes.data;
      if (!user || !user.id) throw new Error('User not found');

      // 2. Get city configuration (including token_mp)
      const cidade_id = user.cidade_id || 1;
      const cityRes = await api.passenger.getCityData(cidade_id);
      const token_mp = cityRes.data?.token;

      if (!token_mp) {
        alert('Configuração de pagamento não disponível para a cidade: ' + (cityRes.data?.cidade || cidade_id));
        setLoading(false);
        return;
      }

      // 3. Call PagMP API to get real link (Exactly like monolith's carteira.js)
      const pagResponse = await fetch('https://api.pagmp.com/api/get_link.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: token_mp,
          descricao: 'Recarga Saldo Uberzap',
          valor: selectedAmount.toFixed(2),
          nome: user.nome || 'Cliente Uberzap',
          email: user.email || 'contato@uberzap.app.br',
          url_sucesso: 'https://top.uberzap.app.br',
          url_falha: 'https://top.uberzap.app.br',
          url_pendente: 'https://top.uberzap.app.br'
        }).toString()
      });

      const pagJson = await pagResponse.json();

      if (pagJson.status === 'successo') {
        const link_pagamento = pagJson.url;
        const referencia_pagamento = pagJson.ref;

        // 4. Record transaction in monolith (insere_transacao.php)
        const transPayload = {
          cidade_id: cidade_id,
          user_id: user.id,
          ref: referencia_pagamento,
          valor: selectedAmount.toFixed(2).replace('.', ','),
          link: link_pagamento
        };

        await api.passenger.addTransaction(transPayload);

        // 5. Open payment URL
        Linking.openURL(link_pagamento);
        setRechargeModal(false);
        setPixStep(1);
        setTimeout(loadData, 2000);
      } else {
        alert('Erro ao gerar link de pagamento: ' + (pagJson.mensagem || 'Erro desconhecido'));
      }
    } catch (e) {
      console.error('Recharge Error:', e);
      alert('Erro ao processar recarga. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const renderTransaction = ({ item, index }) => (
    <TransactionItemComp item={item} index={index} />
  );

  return (
    <Container>
      <StatusBar barStyle="dark-content" />
      <Header>
        <BackButton onPress={() => navigation.goBack()}>
          <Icon name="chevron-left" size={32} color={colors.secondary} />
        </BackButton>
        <HeaderTitle>Carteira</HeaderTitle>
        <View style={{ width: 45 }} />
      </Header>

      <Content showsVerticalScrollIndicator={false}>
        <CardContainer style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <CardGradient colors={['#1a1a1a', '#333']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <CardHeader>
              <View>
                <BalanceLabel>Saldo Total</BalanceLabel>
                <BalanceValue>R$ {data.saldo}</BalanceValue>
              </View>
              <ChipIcon />
            </CardHeader>
            <CardFooter>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginBottom: 5 }}>USERNAME</Text>
                <UserName>{userName.toUpperCase()}</UserName>
              </View>
              <Icon name="contactless" size={32} color="rgba(255,255,255,0.3)" />
            </CardFooter>
          </CardGradient>
        </CardContainer>

        <QuickActions>
          <ActionButton onPress={() => { setPixStep(1); setRechargeModal(true); }}>
            <ActionIcon><Icon name="add" size={28} color={colors.primary} /></ActionIcon>
            <ActionText>Recarregar</ActionText>
          </ActionButton>
          <ActionButton onPress={() => navigation.navigate('HistoryScreen')}>
            <ActionIcon><Icon name="history" size={28} color="#3b82f6" /></ActionIcon>
            <ActionText>Histórico</ActionText>
          </ActionButton>
          <ActionButton onPress={() => navigation.navigate('SupportScreen')}>
            <ActionIcon><Icon name="help-outline" size={28} color="#8b5cf6" /></ActionIcon>
            <ActionText>Suporte</ActionText>
          </ActionButton>
        </QuickActions>

        <SectionHeader>
          <SectionTitle>Atividades Recentes</SectionTitle>
          <TouchableOpacity><Text style={{ color: colors.primary, fontWeight: '600' }}>Ver tudo</Text></TouchableOpacity>
        </SectionHeader>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={data.transacoes}
            renderItem={renderTransaction}
            keyExtractor={item => item.id.toString()}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#999', marginTop: 30 }}>Sem histórico.</Text>}
          />
        )}
      </Content>

      <Modal visible={rechargeModal} transparent animationType="slide">
        <ModalOverlay>
          <ModalContent>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold' }}>Quanto deseja recarregar?</Text>
              <TouchableOpacity onPress={() => setRechargeModal(false)}><Icon name="close" size={28} color="#000" /></TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              {[20, 50, 100, 200, 500].map(amt => (
                <AmountOption key={amt} selected={selectedAmount === amt} onPress={() => setSelectedAmount(amt)}>
                  <AmountText selected={selectedAmount === amt}>R$ {amt}</AmountText>
                </AmountOption>
              ))}
            </View>

            <View style={{ backgroundColor: '#f9fafb', padding: 15, borderRadius: 12, marginBottom: 25, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
               <Text style={{ fontSize: 14, color: '#4b5563', lineHeight: 20 }}>
                 Ao clicar em **GERAR PIX**, você será redirecionado para o ambiente seguro de pagamento da **PagMP** para concluir sua recarga.
               </Text>
            </View>

            <TouchableOpacity 
               onPress={handleRecharge}
               disabled={loading}
               style={{ backgroundColor: colors.primary, height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', opacity: loading ? 0.7 : 1 }}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="qr-code-scanner" size={24} color="#fff" style={{ marginRight: 10 }} />
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>GERAR PIX DE R$ {selectedAmount}</Text>
                </>
              )}
            </TouchableOpacity>
          </ModalContent>
        </ModalOverlay>
      </Modal>
    </Container>
  );
};

export default WalletScreen;
