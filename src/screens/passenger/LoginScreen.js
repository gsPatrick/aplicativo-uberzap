import React, { useState } from 'react';
import { Text, TouchableOpacity, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import styled from 'styled-components/native';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { getStoredPushToken, registerForPushNotificationsAsync } from '../../utils/notifications';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { saveSession } from '../../utils/session';
import { formatPhoneBr, normalizePhoneForApi, isValidPhoneDigits } from '../../utils/inputMasks';

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

const logoImageStyle = { width: 280, height: 120, marginBottom: spacing.md };

const Title = styled.Text`
  font-size: 28px;
  font-weight: bold;
  color: ${colors.text};
  text-align: center;
`;

const Subtitle = styled.Text`
  font-size: 16px;
  color: ${colors.textSecondary};
  text-align: center;
  margin-top: ${spacing.xs}px;
`;

const Form = styled.View`
  width: 100%;
`;

const Label = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.text};
  margin-bottom: ${spacing.xs}px;
`;

const Input = styled.TextInput`
  height: 55px;
  background-color: ${colors.surface};
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.md}px;
  font-size: 16px;
  border-width: 1px;
  border-color: ${colors.border};
  margin-bottom: ${spacing.md}px;
`;

const Button = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 55px;
  border-radius: ${borderRadius.md}px;
  justify-content: center;
  align-items: center;
  margin-top: ${spacing.md}px;
  opacity: ${props => props.disabled ? 0.6 : 1};
`;

const ButtonText = styled.Text`
  color: ${colors.white};
  font-size: 18px;
  font-weight: bold;
`;

const Footer = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-top: ${spacing.xl}px;
`;

const FooterText = styled.Text`
  color: ${colors.textSecondary};
  font-size: 14px;
`;

const FooterLink = styled.TouchableOpacity``;

const FooterLinkText = styled.Text`
  color: ${colors.primary};
  font-size: 14px;
  font-weight: bold;
`;

const LoginScreen = () => {
  const navigation = useNavigation();
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const telefoneNorm = normalizePhoneForApi(telefone);
    if (!telefoneNorm || !senha) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }
    if (!isValidPhoneDigits(telefoneNorm)) {
      Alert.alert('Telefone inválido', 'Informe o DDD + número (10 ou 11 dígitos).');
      return;
    }

    setLoading(true);
    try {
      let id_signal = (await getStoredPushToken()) || '';
      if (!id_signal) {
        id_signal = (await registerForPushNotificationsAsync()) || '';
      }
      const response = await api.passenger.login(telefoneNorm, senha, id_signal);
      const raw = response.data || {};
      const nested = raw.usuario || {};
      const payload = {
        ...nested,
        ...raw,
        id: raw.id ?? nested.id,
        nome: raw.nome ?? nested.nome,
        email: raw.email ?? nested.email,
        cidade_id: raw.cidade_id ?? nested.cidade_id,
      };

      const statusOk =
        payload.status === 'sucesso' ||
        payload.status === 'success' ||
        String(payload.status || '').toLowerCase() === 'sucesso';
      const hasUserId = Boolean(payload.id);

      if (statusOk || hasUserId) {
        if (payload.ativo != null && Number(payload.ativo) !== 1) {
          Alert.alert('Conta bloqueada', 'Entre em contato com o suporte.');
          return;
        }
        await saveSession({
          userType: 'passenger',
          telefone: telefoneNorm,
          senha,
          id: payload.id,
          nome: payload.nome,
          email: payload.email,
          cidade_id: payload.cidade_id ?? 1,
        });
        navigation.reset({
          index: 0,
          routes: [{ name: 'PassengerPrincipal' }],
        });
      } else {
        Alert.alert('Erro', 'Credenciais inválidas. Verifique seu telefone e senha.');
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
          <Image
            source={require('../../../assets/images/logopassageiro.jpeg')}
            style={logoImageStyle}
            resizeMode="contain"
            accessibilityLabel="UbeZap"
          />
          <Title>UbeZap Passageiro</Title>
          <Subtitle>Mobilidade Urbana</Subtitle>
        </Header>

        <Form>
          <Label>Telefone</Label>
          <Input
            placeholder="(00) 00000-0000"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={telefone}
            onChangeText={(text) => setTelefone(formatPhoneBr(text))}
            maxLength={16}
          />

          <Label>Senha</Label>
          <Input
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />

          <Button activeOpacity={0.8} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.white} /> : <ButtonText>Entrar</ButtonText>}
          </Button>

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={{ marginTop: 15, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textSecondary }}>Esqueceu a senha?</Text>
          </TouchableOpacity>
        </Form>

        <Footer>
          <FooterText>Ainda não tem conta? </FooterText>
          <FooterLink onPress={() => navigation.navigate('PassengerRegister')}>
            <FooterLinkText>Cadastre-se</FooterLinkText>
          </FooterLink>
        </Footer>
      </Content>
    </Container>
  );
};

export default LoginScreen;
