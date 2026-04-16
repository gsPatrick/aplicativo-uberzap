import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StatusBar, Animated } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getSession } from '../../utils/session';

const Container = styled.View`
  flex: 1;
  background-color: #0c0d0d;
`;

const Header = styled.View`
  padding: 50px 20px 20px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const BalanceCard = styled(LinearGradient)`
  margin: 20px;
  padding: 30px;
  border-radius: 35px;
  align-items: center;
  elevation: 15;
  shadow-color: ${colors.primary};
  shadow-offset: 0px 8px;
  shadow-opacity: 0.3;
  shadow-radius: 15px;
`;

const BalanceLabel = styled.Text`
  color: rgba(255,255,255,0.7);
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-weight: bold;
`;

const BalanceValue = styled.Text`
  color: #fff;
  font-size: 44px;
  font-weight: 900;
  margin-vertical: 10px;
`;

const WithdrawButton = styled.TouchableOpacity`
  background-color: #fff;
  padding: 15px 35px;
  border-radius: 20px;
  margin-top: 15px;
`;

const HistoryContainer = styled.View`
  flex: 1;
  background-color: #1a1c1e;
  border-top-left-radius: 40px;
  border-top-right-radius: 40px;
  padding: 30px 20px;
  margin-top: 20px;
`;

const TransactionItem = styled.View`
  flex-direction: row;
  align-items: center;
  padding-vertical: 18px;
  border-bottom-width: 1px;
  border-bottom-color: rgba(255,255,255,0.05);
`;

const IconBox = styled.View`
  width: 48px;
  height: 48px;
  border-radius: 15px;
  background-color: ${props => props.type === 'Saque' ? 'rgba(244, 67, 54, 0.1)' : 'rgba(58, 181, 107, 0.1)'};
  justify-content: center;
  align-items: center;
  margin-right: 15px;
`;

const DriverWalletScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState('0,00');

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      const session = await getSession();
      if (!session) return;
      
      const resp = await api.driver.getDriverTransactions(session.id);
      if (resp.data) {
        setTransactions(resp.data.transacoes || []);
        setBalance(resp.data.saldo || '0,00');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <Header>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Minha Carteira</Text>
        <TouchableOpacity>
          <Icon name="help-outline" size={24} color="#64748b" />
        </TouchableOpacity>
      </Header>

      <BalanceCard colors={[colors.primary, '#1a1c1e']} start={{x:0, y:0}} end={{x:1, y:1}}>
        <BalanceLabel>Saldo Disponível</BalanceLabel>
        <BalanceValue>R$ {balance}</BalanceValue>
        <WithdrawButton 
          activeOpacity={0.8} 
          onPress={() => navigation.navigate('DriverSupport', { 
            prefill: `Olá! Gostaria de solicitar o saque do meu saldo disponível de R$ ${balance}.` 
          })}
        >
          <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 16 }}>SOLICITAR SAQUE</Text>
        </WithdrawButton>
      </BalanceCard>

      <HistoryContainer>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>Extrato de Lançamentos</Text>
        
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 50 }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {transactions.map((item) => (
              <TransactionItem key={item.id}>
                <IconBox type={item.tipo}>
                  <Icon 
                    name={item.tipo === 'Saque' ? 'call-made' : 'call-received'} 
                    size={24} 
                    color={item.tipo === 'Saque' ? '#f44336' : colors.primary} 
                  />
                </IconBox>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{item.descricao}</Text>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>{item.date}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: item.tipo === 'Saque' ? '#f44336' : colors.primary, fontSize: 18, fontWeight: '900' }}>
                    {item.tipo === 'Saque' ? '-' : '+'} R$ {item.valor}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 10, fontWeight: 'bold' }}>{item.status.toUpperCase()}</Text>
                </View>
              </TransactionItem>
            ))}
            <View style={{ height: 30 }} />
          </ScrollView>
        )}
      </HistoryContainer>
    </Container>
  );
};

export default DriverWalletScreen;
