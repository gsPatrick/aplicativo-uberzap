import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import styled from 'styled-components/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing } from '../../theme/tokens';
import api from '../../services/api';
import { CONFIG } from '../../config';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const Container = styled.View`
  flex: 1;
  background-color: #0c0d0d;
`;

const Header = styled(LinearGradient)`
  padding: ${spacing.xl}px ${spacing.md}px ${spacing.md}px;
  border-bottom-left-radius: 30px;
  border-bottom-right-radius: 30px;
`;

const Content = styled.ScrollView`
  flex: 1;
  padding: ${spacing.md}px;
`;

const StepIndicator = styled.View`
  flex-direction: row;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
`;

const StepCircle = styled.View`
  width: 35px;
  height: 35px;
  border-radius: 20px;
  background-color: ${props => props.active ? colors.primary : props.completed ? colors.primary : '#334155'};
  justify-content: center;
  align-items: center;
  margin-horizontal: 10px;
  border-width: 2px;
  border-color: ${props => props.active ? '#fff' : 'transparent'};
`;

const StepLine = styled.View`
  width: 40px;
  height: 2px;
  background-color: ${props => props.completed ? colors.primary : '#334155'};
`;

const InputGroup = styled.View`
  margin-bottom: 20px;
`;

const Label = styled.Text`
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 8px;
  font-weight: 600;
`;

const Input = styled.TextInput`
  background-color: #1a1c1e;
  height: 55px;
  border-radius: 12px;
  padding-horizontal: 15px;
  color: #fff;
  font-size: 16px;
  border-width: 1px;
  border-color: #334155;
`;

const CitySelector = styled.TouchableOpacity`
  height: 55px;
  background-color: #1a1c1e;
  border-radius: 12px;
  padding-horizontal: 15px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-width: 1px;
  border-color: #334155;
`;

const DocCard = styled.TouchableOpacity`
  background-color: #1a1c1e;
  padding: 20px;
  border-radius: 15px;
  margin-bottom: 15px;
  border-width: 1px;
  border-style: dashed;
  border-color: ${props => props.filled ? colors.primary : '#475569'};
  flex-direction: row;
  align-items: center;
`;

const NextButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 60px;
  border-radius: 15px;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  margin-bottom: 40px;
  flex-direction: row;
  opacity: ${props => (props.disabled ? 0.55 : 1)};
`;

const ModalOverlay = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.65);
  justify-content: flex-end;
`;

const ModalContent = styled.View`
  background-color: #1a1c1e;
  border-top-left-radius: 25px;
  border-top-right-radius: 25px;
  padding: 24px;
  max-height: 80%;
`;

const CityItem = styled.TouchableOpacity`
  padding-vertical: 18px;
  border-bottom-width: 1px;
  border-bottom-color: #334155;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const digitsOnly = s => String(s || '').replace(/\D/g, '');

const isValidEmail = email => {
  const e = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
};

/** CPF com dígitos verificadores. */
const isValidCpf = cpf => {
  const d = digitsOnly(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  const calcDigit = (base, factor) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcDigit(d.slice(0, 9), 10);
  const d2 = calcDigit(d.slice(0, 10), 11);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
};

/** Telefone BR: 10 ou 11 dígitos */
const isValidPhone = phone => {
  const d = digitsOnly(phone);
  return d.length >= 10 && d.length <= 11;
};

/** Placa antiga ou Mercosul: 7 caracteres alfanuméricos */
const normalizePlaca = p =>
  String(p || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();

const isValidPlaca = placa => normalizePlaca(placa).length === 7;

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

  if (lower.includes('cpf já cadastrado') || lower.includes('cpf ja cadastrado')) {
    return 'Este CPF já está cadastrado como motorista.';
  }
  if (lower.includes('email') && lower.includes('duplic')) {
    return 'Este e-mail já está cadastrado.';
  }
  if (lower.includes('telefone') && lower.includes('duplic')) {
    return 'Este telefone já está cadastrado.';
  }
  if (lower.includes('placa') && lower.includes('duplic')) {
    return 'Esta placa já está vinculada a outro cadastro.';
  }
  if (lower.includes('autentica') || lower.includes('secret')) {
    return 'Falha de autenticação com o servidor. Verifique a configuração do app.';
  }

  // Nunca truncar: exibe texto completo retornado pelo backend
  return text;
};

const DriverRegisterScreen = () => {
  const navigation = useNavigation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    senha: '',
    telefone: '',
    veiculo: '',
    placa: '',
  });

  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [showCityModal, setShowCityModal] = useState(false);
  const [loadingCities, setLoadingCities] = useState(true);

  const [docs, setDocs] = useState({
    cnh: null,
    documento: null,
    lateral: null,
    frente: null,
    selfie: null,
    antecedentes: null,
  });

  const loadCities = useCallback(async () => {
    setLoadingCities(true);
    try {
      const response = await api.passenger.getCities();
      const list = response?.data;
      if (Array.isArray(list)) {
        setCities(list);
      } else {
        setCities([]);
      }
    } catch (e) {
      console.error('DriverRegister loadCities:', e);
      Alert.alert('Erro', 'Não foi possível carregar as cidades. Verifique a conexão.');
      setCities([]);
    } finally {
      setLoadingCities(false);
    }
  }, []);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  const updateForm = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const pickImage = async docKey => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setDocs(prev => ({ ...prev, [docKey]: result.assets[0] }));
    }
  };

  const validateStep1 = () => {
    const nome = formData.nome.trim();
    if (nome.length < 3) {
      Alert.alert('Campo obrigatório', 'Informe seu nome completo (mínimo 3 caracteres).');
      return false;
    }
    if (!isValidCpf(formData.cpf)) {
      Alert.alert('CPF inválido', 'Informe um CPF válido.');
      return false;
    }
    if (!isValidPhone(formData.telefone)) {
      Alert.alert('Telefone inválido', 'Informe um telefone com DDD (10 ou 11 dígitos).');
      return false;
    }
    if (!isValidEmail(formData.email)) {
      Alert.alert('E-mail inválido', 'Informe um e-mail válido.');
      return false;
    }
    if (!formData.senha || formData.senha.length < 6) {
      Alert.alert('Senha', 'A senha deve ter no mínimo 6 caracteres.');
      return false;
    }
    if (!selectedCity) {
      Alert.alert('Cidade', 'Selecione a cidade em que você vai atuar.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const veiculo = formData.veiculo.trim();
    if (veiculo.length < 3) {
      Alert.alert('Veículo', 'Informe marca e modelo do veículo.');
      return false;
    }
    if (!isValidPlaca(formData.placa)) {
      Alert.alert(
        'Placa',
        'Informe a placa completa (7 caracteres, ex.: ABC1D23 ou ABC1234).'
      );
      return false;
    }
    return true;
  };

  const goToStep2 = () => {
    if (validateStep1()) setStep(2);
  };

  const goToStep3 = () => {
    if (validateStep2()) setStep(3);
  };

  const handleRegister = async () => {
    if (!selectedCity) {
      Alert.alert('Cidade', 'Selecione a cidade na primeira etapa.');
      setStep(1);
      return;
    }
    const missingDocs = Object.keys(docs).filter(key => !docs[key]);
    if (missingDocs.length > 0) {
      Alert.alert('Documentos', 'Envie todas as fotos obrigatórias antes de finalizar.');
      return;
    }

    setLoading(true);
    try {
      const placaNorm = normalizePlaca(formData.placa);
      const payload = new FormData();
      payload.append('nome', formData.nome.trim());
      payload.append('email', formData.email.trim());
      payload.append('cpf', digitsOnly(formData.cpf));
      payload.append('senha', formData.senha);
      payload.append('telefone', digitsOnly(formData.telefone));
      payload.append('cidade_id', String(selectedCity.id));
      payload.append('veiculo', formData.veiculo.trim());
      payload.append('placa', placaNorm);
      payload.append('secret', CONFIG.SECRET_KEY);

      Object.keys(docs).forEach(key => {
        const img = docs[key];
        const name = `${key}_${Date.now()}.jpg`;
        payload.append(`img_${key}`, {
          uri: Platform.OS === 'ios' ? img.uri.replace('file://', '') : img.uri,
          name,
          type: 'image/jpeg',
        });
      });

      const response = await api.driver.register(payload);
      const data = response?.data;

      const ok =
        data?.status === 'sucesso' ||
        data?.status === 'ok' ||
        (typeof data === 'string' && data.includes('sucesso'));

      if (ok) {
        Alert.alert(
          'Sucesso',
          data?.message ||
            'Documentos enviados com sucesso! Aguarde a aprovação da nossa equipe.',
          [{ text: 'OK', onPress: () => navigation.navigate('DriverLogin') }]
        );
      } else {
        Alert.alert('Cadastro não concluído', mapRegisterErrorMessage(data));
      }
    } catch (e) {
      console.error(e);
      const backendPayload = e?.response?.data ?? e?.message ?? e;
      Alert.alert('Cadastro não concluído', mapRegisterErrorMessage(backendPayload));
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <View>
      <InputGroup>
        <Label>Nome completo *</Label>
        <Input
          placeholder="Como no documento"
          placeholderTextColor="#64748b"
          value={formData.nome}
          onChangeText={v => updateForm('nome', v)}
        />
      </InputGroup>
      <InputGroup>
        <Label>CPF *</Label>
        <Input
          placeholder="000.000.000-00"
          placeholderTextColor="#64748b"
          keyboardType="numeric"
          value={formData.cpf}
          onChangeText={v => updateForm('cpf', v)}
        />
      </InputGroup>
      <InputGroup>
        <Label>Telefone (com DDD) *</Label>
        <Input
          placeholder="(00) 00000-0000"
          placeholderTextColor="#64748b"
          keyboardType="phone-pad"
          value={formData.telefone}
          onChangeText={v => updateForm('telefone', v)}
        />
      </InputGroup>
      <InputGroup>
        <Label>E-mail *</Label>
        <Input
          placeholder="exemplo@gmail.com"
          placeholderTextColor="#64748b"
          keyboardType="email-address"
          autoCapitalize="none"
          value={formData.email}
          onChangeText={v => updateForm('email', v)}
        />
      </InputGroup>
      <InputGroup>
        <Label>Senha * (mín. 6 caracteres)</Label>
        <Input
          placeholder="••••••••"
          placeholderTextColor="#64748b"
          secureTextEntry
          value={formData.senha}
          onChangeText={v => updateForm('senha', v)}
        />
      </InputGroup>
      <InputGroup>
        <Label>Cidade de atuação *</Label>
        <CitySelector
          onPress={() => !loadingCities && cities.length > 0 && setShowCityModal(true)}
          disabled={loadingCities || cities.length === 0}
        >
          {loadingCities ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text
              style={{
                color: selectedCity ? '#fff' : '#64748b',
                fontSize: 16,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {selectedCity
                ? selectedCity.nome
                : cities.length === 0
                  ? 'Nenhuma cidade disponível'
                  : 'Toque para selecionar a cidade'}
            </Text>
          )}
          <MaterialIcons name="keyboard-arrow-down" size={24} color="#94a3b8" />
        </CitySelector>
      </InputGroup>
      <NextButton onPress={goToStep2}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>PRÓXIMO PASSO</Text>
        <MaterialIcons name="arrow-forward" size={24} color="#fff" style={{ marginLeft: 10 }} />
      </NextButton>
    </View>
  );

  const renderStep2 = () => (
    <View>
      <InputGroup>
        <Label>Veículo (marca e modelo) *</Label>
        <Input
          placeholder="Ex.: Fiat Argo 2023"
          placeholderTextColor="#64748b"
          value={formData.veiculo}
          onChangeText={v => updateForm('veiculo', v)}
        />
      </InputGroup>
      <InputGroup>
        <Label>Placa *</Label>
        <Input
          placeholder="ABC1D23 ou ABC1234"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
          value={formData.placa}
          onChangeText={v => updateForm('placa', v)}
        />
      </InputGroup>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => setStep(1)} style={{ padding: 20 }}>
          <Text style={{ color: '#94a3b8' }}>Voltar</Text>
        </TouchableOpacity>
        <NextButton onPress={goToStep3} style={{ flex: 1, maxWidth: width * 0.62, marginBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>CONTINUAR</Text>
        </NextButton>
      </View>
    </View>
  );

  const renderStep3 = () => {
    const docLabels = [
      { key: 'cnh', label: 'Foto da CNH', icon: 'badge' },
      { key: 'documento', label: 'Doc. do veículo (CRLV)', icon: 'description' },
      { key: 'lateral', label: 'Foto da lateral', icon: 'directions-car' },
      { key: 'frente', label: 'Foto da frente', icon: 'visibility' },
      { key: 'selfie', label: 'Sua selfie', icon: 'face' },
      { key: 'antecedentes', label: 'Antecedentes criminais', icon: 'security' },
    ];

    return (
      <View>
        <Text style={{ color: '#fff', fontSize: 13, marginBottom: 20, textAlign: 'center', opacity: 0.7 }}>
          Todas as fotos são obrigatórias. Use imagens nítidas e legíveis.
        </Text>

        {docLabels.map(doc => (
          <DocCard key={doc.key} filled={docs[doc.key]} onPress={() => pickImage(doc.key)}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: docs[doc.key] ? colors.primary : '#334155',
                justifyContent: 'center',
                alignItems: 'center',
                marginRight: 15,
              }}
            >
              <MaterialIcons name={docs[doc.key] ? 'check' : doc.icon} size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500' }}>{doc.label} *</Text>
              <Text style={{ color: docs[doc.key] ? colors.primary : '#64748b', fontSize: 12 }}>
                {docs[doc.key] ? 'Foto selecionada' : 'Toque para escolher'}
              </Text>
            </View>
            {docs[doc.key] && (
              <Image source={{ uri: docs[doc.key].uri }} style={{ width: 40, height: 40, borderRadius: 8 }} />
            )}
          </DocCard>
        ))}

        <TouchableOpacity onPress={() => setStep(2)} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}>
          <Text style={{ color: '#94a3b8' }}>← Voltar</Text>
        </TouchableOpacity>

        <NextButton onPress={handleRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>FINALIZAR CADASTRO</Text>
              <MaterialIcons name="check-circle" size={24} color="#fff" style={{ marginLeft: 10 }} />
            </>
          )}
        </NextButton>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Container>
        <Header colors={['#1a1c1e', '#0c0d0d']}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <Image
            source={require('../../../assets/images/logomotorista.jpeg')}
            style={{ width: 220, height: 80, resizeMode: 'contain', alignSelf: 'center', marginTop: 16 }}
            accessibilityLabel="UbeZap Motorista"
          />
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 15 }}>Bora trabalhar!</Text>
          <Text style={{ color: '#94a3b8', fontSize: 14 }}>Complete seu cadastro de motorista</Text>

          <StepIndicator>
            <StepCircle active={step === 1} completed={step > 1}>
              <Text style={{ color: '#fff' }}>1</Text>
            </StepCircle>
            <StepLine completed={step > 1} />
            <StepCircle active={step === 2} completed={step > 2}>
              <Text style={{ color: '#fff' }}>2</Text>
            </StepCircle>
            <StepLine completed={step > 2} />
            <StepCircle active={step === 3} completed={step > 3}>
              <Text style={{ color: '#fff' }}>3</Text>
            </StepCircle>
          </StepIndicator>
        </Header>

        <Content showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </Content>

        <Modal visible={showCityModal} transparent animationType="slide" onRequestClose={() => setShowCityModal(false)}>
          <ModalOverlay>
            <ModalContent>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>Sua cidade</Text>
                <TouchableOpacity onPress={() => setShowCityModal(false)}>
                  <MaterialIcons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={cities}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <CityItem
                    onPress={() => {
                      setSelectedCity(item);
                      setShowCityModal(false);
                    }}
                  >
                    <Text style={{ fontSize: 16, color: '#e2e8f0' }}>{item.nome}</Text>
                    {selectedCity?.id === item.id && (
                      <MaterialIcons name="check" size={20} color={colors.primary} />
                    )}
                  </CityItem>
                )}
                ListEmptyComponent={
                  <Text style={{ color: '#94a3b8', padding: 16 }}>Nenhuma cidade cadastrada no servidor.</Text>
                }
              />
            </ModalContent>
          </ModalOverlay>
        </Modal>
      </Container>
    </KeyboardAvoidingView>
  );
};

export default DriverRegisterScreen;
