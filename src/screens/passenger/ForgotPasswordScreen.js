import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StatusBar, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';

const Container = styled.View`
  flex: 1;
  background-color: #0c0d0d;
`;

const Header = styled.View`
  padding: ${spacing.md}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const Content = styled.View`
  flex: 1;
  padding: 30px;
  justify-content: center;
`;

const Title = styled.Text`
  color: #fff;
  font-size: 28px;
  font-weight: 900;
  margin-bottom: 10px;
`;

const Subtitle = styled.Text`
  color: #94a3b8;
  font-size: 16px;
  margin-bottom: 40px;
`;

const InputContainer = styled.View`
  background-color: #1a1c1e;
  border-radius: 18px;
  margin-bottom: 20px;
  padding: 5px 15px;
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  border-color: rgba(255, 255, 255, 0.05);
`;

const Input = styled.TextInput`
  flex: 1;
  height: 55px;
  color: #fff;
  font-size: 16px;
  margin-left: 10px;
`;

const Button = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 60px;
  border-radius: 18px;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  elevation: 8;
  shadow-color: ${colors.primary};
  shadow-opacity: 0.3;
  shadow-radius: 10px;
`;

const ButtonText = styled.Text`
  color: #000;
  font-size: 18px;
  font-weight: bold;
`;

const StepIndicator = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: 30px;
`;

const StepDot = styled.View`
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background-color: ${props => props.active ? colors.primary : '#334155'};
  margin-horizontal: 5px;
`;

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const [step, setStep] = useState(1); // 1: Phone, 2: OTP, 3: New Password
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOTP = async () => {
    if (phone.length < 10) {
      Alert.alert('Erro', 'Informe um telefone válido.');
      return;
    }
    setLoading(true);
    try {
      const resp = await api.passenger.sendOTP(phone);
      if (resp.data?.status === 'ok' || resp.data?.status === 'sucesso') {
        setStep(2);
      } else {
        Alert.alert('Erro', resp.data?.msg || 'Erro ao enviar código.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha na conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length < 4) {
      Alert.alert('Erro', 'Informe o código de verificação.');
      return;
    }
    setLoading(true);
    try {
      const resp = await api.passenger.verifyOTP(phone, otp);
      if (resp.data?.status === 'ok' || resp.data?.status === 'sucesso') {
        setStep(3);
      } else {
        Alert.alert('Erro', 'Código inválido.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Erro ao validar código.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (password.length < 6) {
      Alert.alert('Erro', 'A senha deve ter no menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const resp = await api.passenger.resetPassword(phone, password);
      if (resp.data?.status === 'sucesso') {
        Alert.alert('Sucesso', 'Sua senha foi alterada com sucesso!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('Erro', 'Não foi possível redefinir a senha.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Erro ao salvar nova senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <Header>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </Header>

        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : null}
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <Content>
              <StepIndicator>
                <StepDot active={step >= 1} />
                <StepDot active={step >= 2} />
                <StepDot active={step >= 3} />
              </StepIndicator>

              {step === 1 && (
                <>
                  <Title>Recuperar Senha</Title>
                  <Subtitle>Informe seu número de telefone para receber um código de verificação via SMS.</Subtitle>
                  
                  <InputContainer>
                    <Icon name="phone" size={24} color={colors.primary} />
                    <Input 
                      placeholder="Seu telefone (DDD + Número)" 
                      placeholderTextColor="#64748b"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={setPhone}
                    />
                  </InputContainer>

                  <Button onPress={handleSendOTP} disabled={loading}>
                    {loading ? <ActivityIndicator color="#000" /> : <ButtonText>ENVIAR CÓDIGO</ButtonText>}
                  </Button>
                </>
              )}

              {step === 2 && (
                <>
                  <Title>Validar Código</Title>
                  <Subtitle>Digite o código de 4 a 6 dígitos que enviamos para {phone}.</Subtitle>
                  
                  <InputContainer>
                    <Icon name="lock-outline" size={24} color={colors.primary} />
                    <Input 
                      placeholder="Código OTP" 
                      placeholderTextColor="#64748b"
                      keyboardType="number-pad"
                      value={otp}
                      onChangeText={setOtp}
                      maxLength={6}
                    />
                  </InputContainer>

                  <Button onPress={handleVerifyOTP} disabled={loading}>
                    {loading ? <ActivityIndicator color="#000" /> : <ButtonText>VERIFICAR</ButtonText>}
                  </Button>

                  <TouchableOpacity onPress={() => setStep(1)} style={{ marginTop: 20, alignSelf: 'center' }}>
                    <Text style={{ color: colors.primary }}>Alterar número de telefone</Text>
                  </TouchableOpacity>
                </>
              )}

              {step === 3 && (
                <>
                  <Title>Nova Senha</Title>
                  <Subtitle>Crie uma senha forte para sua segurança.</Subtitle>
                  
                  <InputContainer>
                    <Icon name="vpn-key" size={24} color={colors.primary} />
                    <Input 
                      placeholder="Nova senha" 
                      placeholderTextColor="#64748b"
                      secureTextEntry
                      value={password}
                      onChangeText={setPassword}
                    />
                  </InputContainer>

                  <InputContainer>
                    <Icon name="check-circle-outline" size={24} color={colors.primary} />
                    <Input 
                      placeholder="Confirmar nova senha" 
                      placeholderTextColor="#64748b"
                      secureTextEntry
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                  </InputContainer>

                  <Button onPress={handleResetPassword} disabled={loading}>
                    {loading ? <ActivityIndicator color="#000" /> : <ButtonText>ALTERAR SENHA</ButtonText>}
                  </Button>
                </>
              )}
            </Content>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Container>
  );
}
