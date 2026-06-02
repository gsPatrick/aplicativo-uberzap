import React, { useState } from 'react';
import { Text, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styled from 'styled-components/native';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { getStoredPushToken, registerForPushNotificationsAsync } from '../../utils/notifications';
import { syncPushTokenWithServer } from '../../services/pushSync';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { saveSession } from '../../utils/session';
import { formatCpf, normalizeCpfForApi, isValidCpfDigits } from '../../utils/inputMasks';
import DriverLogo from '../../components/DriverLogo';

const Container = styled.KeyboardAvoidingView`
  flex: 1;
  background-color: ${colors.background};
`;

const Content = styled.ScrollView.attrs({
  contentContainerStyle: { flexGrow: 1, padding: 24, justifyContent: 'center' }
})``;

const Header = styled.View`
  align-items: center;
  margin-bottom: ${spacing.xl + spacing.md}px;
`;

const logoImageStyle = { marginBottom: spacing.md };

const Title = styled.Text`
  font-size: 30px;
  font-weight: 900;
  color: ${colors.text};
  text-align: center;
`;

const Subtitle = styled.Text`
  font-size: 14px;
  color: #94a3b8;
  text-align: center;
  margin-top: ${spacing.xs}px;
`;

const Form = styled.View`
  width: 100%;
`;

const Label = styled.Text`
  font-size: 13px;
  font-weight: 700;
  color: #94a3b8;
  margin-bottom: 8px;
`;

const Input = styled.TextInput`
  height: 56px;
  background-color: ${colors.surface};
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.md}px;
  font-size: 16px;
  color: ${colors.text};
  border-width: 1px;
  border-color: ${colors.border};
  margin-bottom: ${spacing.md}px;
`;

const Button = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 56px;
  border-radius: ${borderRadius.md}px;
  justify-content: center;
  align-items: center;
  margin-top: ${spacing.md}px;
  opacity: ${props => props.disabled ? 0.6 : 1};
`;

const ButtonText = styled.Text`
  color: ${colors.white};
  font-size: 18px;
  font-weight: 900;
`;

const Footer = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-top: ${spacing.xl}px;
`;

const FooterText = styled.Text`
  color: #94a3b8;
  font-size: 14px;
`;

const FooterLink = styled.TouchableOpacity``;

const FooterLinkText = styled.Text`
  color: ${colors.primary};
  font-size: 14px;
  font-weight: 900;
`;

const DriverLoginScreen = () => {
  const navigation = useNavigation();
  const [cpf, setCpf] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const cpfNorm = normalizeCpfForApi(cpf);
    if (!cpfNorm || !senha) {
      Alert.alert('Erro', 'Preencha CPF e senha.');
      return;
    }
    if (!isValidCpfDigits(cpfNorm)) {
      Alert.alert('CPF inválido', 'Informe os 11 dígitos do CPF.');
      return;
    }

    setLoading(true);
    try {
      let id_signal = (await getStoredPushToken()) || '';
      if (!id_signal) {
        id_signal = (await registerForPushNotificationsAsync()) || '';
      }
      const response = await api.driver.login(cpfNorm, senha, id_signal);
      if (response.data && response.data.id) {
        const id = response.data.id;
        await AsyncStorage.setItem('driverId', String(id));
        await saveSession({
          telefone: cpfNorm,
          senha,
          id,
          userType: 'driver',
          cidade_id: response.data.cidade_id || 1,
        });
        await syncPushTokenWithServer().catch(() => {});
        navigation.reset({
          index: 0,
          routes: [{ name: 'DriverHome' }],
        });
      } else {
        const errorMsg = typeof response.data === 'string' ? response.data : 'Credenciais inválidas.';
        Alert.alert('Erro', errorMsg);
      }
    } catch (error) {
      console.error(error);
      const serverMessage =
        error?.response?.data?.erro ||
        error?.response?.data?.mensagem ||
        error?.response?.data?.message ||
        (typeof error?.response?.data === 'string' ? error.response.data : '');

      if (serverMessage) {
        Alert.alert('Erro', String(serverMessage));
      } else if (error?.code === 'ECONNABORTED') {
        Alert.alert('Conexao', 'A API demorou para responder. Tente novamente.');
      } else {
        Alert.alert('Erro', 'Sem conexao com a API. Verifique internet/VPN e tente de novo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Content showsVerticalScrollIndicator={false}>
        <Header>
          <DriverLogo width={280} style={logoImageStyle} />
          <Title>UbeZap Motorista</Title>
          <Subtitle>Acesse seu painel e fique online</Subtitle>
        </Header>

        <Form>
          <Label>CPF</Label>
          <Input
            placeholder="000.000.000-00"
            placeholderTextColor="#64748b"
            keyboardType="number-pad"
            value={cpf}
            onChangeText={(text) => setCpf(formatCpf(text))}
            maxLength={14}
          />

          <Label>Senha</Label>
          <Input
            placeholder="••••••••"
            placeholderTextColor="#64748b"
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />

          <Button activeOpacity={0.8} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <ButtonText>Entrar como motorista</ButtonText>}
          </Button>
        </Form>

        <Footer>
          <FooterText>Ainda não tem cadastro? </FooterText>
          <FooterLink onPress={() => navigation.navigate('DriverRegister')}>
            <FooterLinkText>Quero ser motorista</FooterLinkText>
          </FooterLink>
        </Footer>
      </Content>
    </Container>
  );
};

export default DriverLoginScreen;
