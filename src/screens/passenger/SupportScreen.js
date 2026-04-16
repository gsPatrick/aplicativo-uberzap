import React, { useState } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, TextInput, Alert, StyleSheet, Platform, ActivityIndicator, Linking } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import api from '../../services/api';
import { getSession } from '../../utils/session';

const Container = styled.View`
  flex: 1;
  background-color: #fff;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const HeaderTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${colors.secondary};
`;

const Content = styled.ScrollView`
  flex: 1;
  padding: 20px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 15px;
  color: ${colors.secondary};
`;

const FAQItem = styled.TouchableOpacity`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-vertical: 15px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const FAQText = styled.Text`
  font-size: 16px;
  color: #444;
`;

const ContactForm = styled.View`
  margin-top: 30px;
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 20px;
  margin-bottom: 50px;
`;

const StyledInput = styled.TextInput`
  height: 120px;
  background-color: #fff;
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 12px;
  padding: 15px;
  font-size: 16px;
  margin-bottom: 15px;
`;

const SubmitButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 55px;
  border-radius: 12px;
  justify-content: center;
  align-items: center;
`;

const SupportScreen = () => {
  const navigation = useNavigation();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [supportPhone, setSupportPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');

  React.useEffect(() => {
    loadSupportInfo();
  }, []);

  const loadSupportInfo = async () => {
    try {
      const session = await getSession();
      if (!session) return;
      const profileRes = await api.passenger.getProfile(session.telefone, session.senha);
      const cityRes = await api.passenger.getCityData(profileRes.data?.cidade_id || 1);
      if (cityRes.data) {
        setSupportPhone(cityRes.data.telefone);
        setSupportEmail(cityRes.data.email);
      }
    } catch (e) {
      console.log('Error loading support info:', e);
    }
  };

  const openWhatsApp = () => {
    if (!supportPhone) {
        Alert.alert('Erro', 'O suporte desta cidade ainda não possui um WhatsApp cadastrado.');
        return;
    }
    const cleanPhone = supportPhone.replace(/\D/g, '');
    const url = `whatsapp://send?phone=55${cleanPhone}&text=Olá, sou usuário do Uberzap e preciso de suporte.`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Erro', 'WhatsApp não instalado no dispositivo.');
    });
  };

  const handleSubmit = async () => {
    if (!message) return;
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) throw new Error('Sessão não encontrada');
      const response = await api.passenger.sendSupportMessage({ 
        telefone: session.telefone,
        senha: session.senha,
        msg: message 
      });
      if (response.data === 'ok') {
        Alert.alert('Enviado', 'Sua mensagem foi recebida por nossa equipe.');
        setMessage('');
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  };

  const faqData = [
    { id: 1, q: 'Como atualizar meu cartão de crédito?' },
    { id: 2, q: 'Problemas com a última viagem' },
    { id: 3, q: 'Minha conta está bloqueada' },
    { id: 4, q: 'Como funciona o sistema de saldo?' }
  ];

  return (
    <Container>
      <StatusBar barStyle="dark-content" />
      <Header>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color={colors.secondary} />
        </TouchableOpacity>
        <HeaderTitle>Ajuda e Suporte</HeaderTitle>
        <View style={{ width: 28 }} />
      </Header>

      <Content showsVerticalScrollIndicator={false}>
        <SectionTitle>Fale com a gente agora</SectionTitle>
        <TouchableOpacity 
            onPress={openWhatsApp}
            style={{ 
                backgroundColor: '#25D366', 
                flexDirection: 'row', 
                alignItems: 'center', 
                padding: 18, 
                borderRadius: 16, 
                marginBottom: 25,
                elevation: 5,
                shadowColor: '#25D366',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 6
            }}>
            <Icon name="chat" size={26} color="#fff" />
            <View style={{ marginLeft: 15 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Suporte via WhatsApp</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>Atendimento oficial franqueado</Text>
            </View>
        </TouchableOpacity>

        <SectionTitle>Perguntas Frequentes</SectionTitle>
        {faqData.map(item => (
          <FAQItem key={item.id} onPress={() => Alert.alert('FAQ', 'Em breve detalhamento desta dúvida')}>
            <FAQText>{item.q}</FAQText>
            <Icon name="chevron-right" size={24} color="#ccc" />
          </FAQItem>
        ))}

        <ContactForm>
          <SectionTitle>Ainda precisa de ajuda?</SectionTitle>
          <Text style={{ color: '#666', marginBottom: 15 }}>Envie-nos uma mensagem e responderemos o mais rápido possível.</Text>
          <StyledInput 
            placeholder="Descreva seu problema..." 
            multiline 
            numberOfLines={5}
            textAlignVertical="top"
            value={message}
            onChangeText={setMessage}
          />
          <SubmitButton onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>ENVIAR MENSAGEM</Text>
            )}
          </SubmitButton>
        </ContactForm>
      </Content>
    </Container>
  );
};

export default SupportScreen;
