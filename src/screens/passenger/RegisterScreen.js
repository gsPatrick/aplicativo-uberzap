import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Modal, FlatList, Image } from 'react-native';
import styled from 'styled-components/native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';

const Container = styled.KeyboardAvoidingView`
  flex: 1;
  background-color: ${colors.white};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 50 : spacing.md}px;
`;

const Content = styled.ScrollView.attrs({
  contentContainerStyle: { padding: 24, paddingTop: 8 }
})``;

const logoImageStyle = { width: 280, height: 100, alignSelf: 'center', marginBottom: spacing.md };

const Title = styled.Text`
  font-size: 28px;
  font-weight: bold;
  color: ${colors.secondary};
  margin-bottom: ${spacing.xs}px;
`;

const Subtitle = styled.Text`
  font-size: 16px;
  color: ${colors.textSecondary};
  margin-bottom: ${spacing.xl}px;
`;

const Form = styled.View`
  width: 100%;
`;

const Label = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text};
  margin-bottom: ${spacing.xs}px;
  margin-top: ${spacing.sm}px;
`;

const Input = styled.TextInput`
  height: 55px;
  background-color: ${colors.surface};
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.md}px;
  font-size: 16px;
  border-width: 1px;
  border-color: ${colors.border};
`;

const CitySelector = styled.TouchableOpacity`
  height: 55px;
  background-color: ${colors.surface};
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 1px;
  border-color: ${colors.border};
  margin-bottom: ${spacing.sm}px;
`;

const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0,0,0,0.5);
  justify-content: flex-end;
`;

const ModalContent = styled.View`
  background-color: ${colors.white};
  border-top-left-radius: 25px;
  border-top-right-radius: 25px;
  padding: 24px;
  max-height: 80%;
`;

const CityItem = styled.TouchableOpacity`
  padding-vertical: 18px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const Button = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 55px;
  border-radius: ${borderRadius.md}px;
  justify-content: center;
  align-items: center;
  margin-top: ${spacing.xl}px;
  opacity: ${props => props.disabled ? 0.6 : 1};
`;

const ButtonText = styled.Text`
  color: ${colors.white};
  font-size: 18px;
  font-weight: bold;
`;

const digitsOnly = s => String(s || '').replace(/\D/g, '');
const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
const isValidPhone = phone => {
  const d = digitsOnly(phone);
  return d.length >= 10 && d.length <= 11;
};

const pickServerText = payload => {
  if (payload == null) return '';
  if (typeof payload === 'string') return payload.trim();
  if (typeof payload === 'number' || typeof payload === 'boolean') return String(payload);
  if (Array.isArray(payload)) {
    return payload.map(item => pickServerText(item)).filter(Boolean).join('\n').trim();
  }
  if (typeof payload === 'object') {
    const priority = ['message', 'mensagem', 'status', 'error', 'erro'];
    for (const key of priority) {
      if (payload[key] != null) {
        const value = pickServerText(payload[key]);
        if (value) return value;
      }
    }
    const parts = Object.values(payload)
      .map(value => pickServerText(value))
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
    try {
      return JSON.stringify(payload);
    } catch {
      return '';
    }
  }
  return '';
};

const mapRegisterErrorMessage = payload => {
  const raw = pickServerText(payload);
  const text = raw || 'Cadastro não concluído.';
  const lower = text.toLowerCase();

  if (lower.includes('telefone já cadastrado') || lower.includes('telefone ja cadastrado')) {
    return 'Este telefone já está cadastrado. Tente entrar com ele ou use outro número.';
  }
  if (lower.includes('cpf já cadastrado') || lower.includes('cpf ja cadastrado')) {
    return 'Este CPF já está cadastrado.';
  }
  if (lower.includes('email') && lower.includes('duplic')) {
    return 'Este e-mail já está cadastrado.';
  }
  if (lower.includes('telefone') && lower.includes('duplic')) {
    return 'Este telefone já está cadastrado.';
  }
  if (lower.includes('cidade')) {
    return `Problema com cidade selecionada: ${text}`;
  }

  // Nunca truncar: exibe texto completo retornado pelo backend
  return text;
};

const RegisterScreen = () => {
  const navigation = useNavigation();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [showCityModal, setShowCityModal] = useState(false);

  useEffect(() => {
    loadCities();
  }, []);

  const loadCities = async () => {
    try {
      const response = await api.passenger.getCities();
      if (response && response.data) {
        setCities(response.data);
        // Se houver apenas uma cidade ou quisermos um padrão
        if (response.data.length > 0) {
          // Opcional: pré-selecionar a primeira
          // setSelectedCity(response.data[0]);
        }
      }
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const handleRegister = async () => {
    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim();
    const telefoneLimpo = digitsOnly(telefone);

    if (nomeLimpo.length < 3) {
      Alert.alert('Campo obrigatório', 'Informe seu nome completo.');
      return;
    }
    if (!isValidEmail(emailLimpo)) {
      Alert.alert('E-mail inválido', 'Informe um e-mail válido.');
      return;
    }
    if (!isValidPhone(telefone)) {
      Alert.alert('Telefone inválido', 'Informe um telefone com DDD (10 ou 11 dígitos).');
      return;
    }
    if (!senha || senha.length < 6) {
      Alert.alert('Senha', 'A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (!selectedCity) {
      Alert.alert('Erro', 'Por favor, selecione sua cidade.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.passenger.register({ 
        nome: nomeLimpo, 
        email: emailLimpo, 
        telefone: telefoneLimpo, 
        senha,
        cidade_id: String(selectedCity.id),
        latitude: '0', 
        longitude: '0' 
      });
      
      if (response.data.status === 'sucesso') {
        Alert.alert('Sucesso', 'Cadastro realizado! Agora você já pode entrar.');
        navigation.navigate('PassengerLogin');
      } else {
        Alert.alert('Cadastro não concluído', mapRegisterErrorMessage(response.data));
      }
    } catch (error) {
      console.error(error);
      const backendPayload = error?.response?.data ?? error?.message ?? error;
      Alert.alert('Cadastro não concluído', mapRegisterErrorMessage(backendPayload));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Header>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={28} color={colors.secondary} />
        </TouchableOpacity>
      </Header>
      
      <Content showsVerticalScrollIndicator={false}>
        <Image
          source={require('../../../assets/images/logopassageiro.jpeg')}
          style={logoImageStyle}
          resizeMode="contain"
          accessibilityLabel="UbeZap"
        />
        <Title>Crie sua conta</Title>
        <Subtitle>Cadastre-se para começar a viajar com a UbeZap.</Subtitle>

        <Form>
          <Label>Nome Completo</Label>
          <Input 
            placeholder="Ex: João Silva"
            value={nome}
            onChangeText={setNome}
          />

          <Label>E-mail</Label>
          <Input 
            placeholder="seuemail@exemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Label>Telefone</Label>
          <Input 
            placeholder="(00) 00000-0000"
            keyboardType="phone-pad"
            value={telefone}
            onChangeText={setTelefone}
          />

          <Label>Cidade</Label>
          <CitySelector onPress={() => setShowCityModal(true)}>
             <Text style={{ color: selectedCity ? colors.secondary : '#999', fontSize: 16 }}>
               {selectedCity ? selectedCity.nome : 'Selecione sua cidade'}
             </Text>
             <MaterialIcons name="keyboard-arrow-down" size={24} color="#666" />
          </CitySelector>

          <Label>Senha</Label>
          <Input 
            placeholder="Mínimo 6 caracteres"
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />

          <Button activeOpacity={0.8} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <ButtonText>Cadastrar</ButtonText>
            )}
          </Button>
        </Form>
      </Content>
      <Modal visible={showCityModal} transparent animationType="slide">
        <ModalOverlay>
          <ModalContent>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Selecione sua cidade</Text>
              <TouchableOpacity onPress={() => setShowCityModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={cities}
              keyExtractor={item => item.id.toString()}
              renderItem={({ item }) => (
                <CityItem onPress={() => { setSelectedCity(item); setShowCityModal(false); }}>
                  <Text style={{ fontSize: 16, color: colors.secondary }}>{item.nome}</Text>
                  {selectedCity?.id === item.id && <MaterialIcons name="check" size={20} color={colors.primary} />}
                </CityItem>
              )}
            />
          </ModalContent>
        </ModalOverlay>
      </Modal>
    </Container>
  );
};

export default RegisterScreen;
