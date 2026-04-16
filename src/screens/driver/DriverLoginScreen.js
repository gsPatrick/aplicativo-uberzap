import React, { useState } from 'react';
import { Text, TouchableOpacity, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import styled from 'styled-components/native';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation } from '@react-navigation/native';
import { saveSession } from '../../utils/session';

const Container = styled.KeyboardAvoidingView`
  flex: 1;
  background-color: #0c0d0d;
`;

const Content = styled.ScrollView.attrs({
  contentContainerStyle: { flexGrow: 1, padding: 24, justifyContent: 'center' }
})``;

const Header = styled.View`
  align-items: center;
  margin-bottom: ${spacing.xl + spacing.md}px;
`;

const logoImageStyle = { width: 260, height: 100, marginBottom: spacing.md };

const Title = styled.Text`
  font-size: 30px;
  font-weight: 900;
  color: #fff;
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
  background-color: #1a1c1e;
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.md}px;
  font-size: 16px;
  color: #fff;
  border-width: 1px;
  border-color: #334155;
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
    if (!cpf || !senha) {
      Alert.alert('Erro', 'Preencha CPF e senha.');
      return;
    }

    setLoading(true);
    try {
      const id_signal = '';
      const response = await api.driver.login(cpf, senha, id_signal);
      if (response.data && response.data.id) {
        const id = response.data.id;
        await AsyncStorage.setItem('driverId', String(id));
        await saveSession({
          telefone: cpf,
          senha,
          id,
          userType: 'driver',
          cidade_id: response.data.cidade_id || 1,
        });
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
      Alert.alert('Erro', 'Falha na conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Content showsVerticalScrollIndicator={false}>
        <Header>
          <Image
            source={require('../../../assets/images/logomotorista.jpeg')}
            style={logoImageStyle}
            resizeMode="contain"
            accessibilityLabel="UbeZap Motorista"
          />
          <Title>UbeZap Driver</Title>
          <Subtitle>Acesse seu painel e fique online</Subtitle>
        </Header>

        <Form>
          <Label>CPF</Label>
          <Input
            placeholder="000.000.000-00"
            placeholderTextColor="#64748b"
            keyboardType="numeric"
            value={cpf}
            onChangeText={setCpf}
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
