import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, TouchableOpacity, ScrollView, TextInput, Alert, StyleSheet, Platform, ActivityIndicator, Image } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation, useRoute } from '@react-navigation/native';
import api from '../../services/api';
import { getSession } from '../../utils/session';
import SmartImage from '../../components/SmartImage';

const Container = styled.View`
  flex: 1;
  background-color: ${colors.background};
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  background-color: #131C2E;
  border-bottom-width: 1px;
  border-bottom-color: #243049;
`;

const HeaderTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${colors.text};
`;

const Content = styled.ScrollView`
  flex: 1;
  padding: 20px;
`;

const PhotoContainer = styled.View`
  align-items: center;
  margin-bottom: 30px;
`;

const ProfilePhoto = styled.View`
  width: 120px;
  height: 120px;
  border-radius: 60px;
  background-color: #243049;
  justify-content: center;
  align-items: center;
  border-width: 2px;
  border-color: ${colors.primary};
  overflow: hidden;
`;

const EditPhotoBtn = styled.TouchableOpacity`
  position: absolute;
  bottom: 0;
  right: ${width / 2 - 60}px; // Tentativa de centrar o botão
  background-color: ${colors.primary};
  width: 36px;
  height: 36px;
  border-radius: 18px;
  justify-content: center;
  align-items: center;
  border-width: 3px;
  border-color: #0B1220;
`;

const Section = styled.View`
  margin-bottom: 30px;
  background-color: #131C2E;
  padding: 20px;
  border-radius: 25px;
  border-width: 1px;
  border-color: #243049;
`;

const SectionTitle = styled.Text`
  font-size: 14px;
  font-weight: 900;
  color: ${colors.primary};
  letter-spacing: 2px;
  margin-bottom: 20px;
  text-transform: uppercase;
`;

const InputGroup = styled.View`
  margin-bottom: 20px;
`;

const Label = styled.Text`
  color: #64748b;
  font-size: 12px;
  margin-bottom: 8px;
  font-weight: bold;
`;

const StyledInput = styled.TextInput`
  background-color: #1B2740;
  color: ${colors.text};
  padding: 15px;
  border-radius: 12px;
  font-size: 16px;
  border-width: 1px;
  border-color: #243049;
`;

const SaveButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 70px;
  border-radius: 20px;
  justify-content: center;
  align-items: center;
  margin-bottom: 50px;
  elevation: 5;
  shadow-color: ${colors.primary};
  shadow-opacity: 0.3;
  shadow-radius: 10px;
`;

import { Dimensions } from 'react-native';
const { width } = Dimensions.get('window');

const VehicleProfileScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [tab, setTab] = useState(route.params?.initialTab === 'veiculo' ? 'veiculo' : 'perfil'); // 'perfil' | 'veiculo' | 'seguranca'

    // Troca de senha
    const [pwd, setPwd] = useState({ atual: '', nova: '', confirma: '' });
    const [showPwd, setShowPwd] = useState(false);
    const [isChangingPwd, setIsChangingPwd] = useState(false);

    const [driverData, setDriverData] = useState({
        nome: 'Carregando...',
        email: '',
        telefone: '',
        cpf: '',
        veiculo: '',
        placa: '',
        img: null,
        img_frente: null,
        img_lateral: null,
        img_documento: null,
        img_cnh: null,
        img_selfie: null,
        nivel: 'Ouro'
    });

    // Resolve o valor de uma foto: URI local (file://), URL http, nome de
    // arquivo do servidor (vira URL completa) ou null/placeholder.
    const photoUri = (val) => {
        const s = String(val ?? '').trim();
        if (!s || s === 'sem_imagem.png') return null;
        if (/^(https?:|file:|content:|data:)/i.test(s)) return s;
        return api.getImageUrl(s);
    };

    useEffect(() => {
        loadProfile();
    }, []);

    const pickImage = async (field) => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Erro', 'Permissão de câmera necessária!');
            return;
        }

        let result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.7,
        });

        if (!result.canceled) {
            setDriverData({ ...driverData, [field]: result.assets[0].uri });
        }
    };

    const loadProfile = async () => {
        try {
            const session = await getSession();
            if (!session) return;

            const resp = await api.driver.getDriverProfile(session.id);
            if (resp.data) {
                setDriverData({
                    ...driverData,
                    ...resp.data,
                    nome: resp.data.nome || 'Motorista',
                    nivel: resp.data.nivel || 'Ouro'
                });
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async () => {
        const atual = pwd.atual.trim();
        const nova = pwd.nova.trim();
        const confirma = pwd.confirma.trim();

        if (!atual || !nova || !confirma) {
            Alert.alert('Atenção', 'Preencha todos os campos de senha.');
            return;
        }
        if (nova.length < 4) {
            Alert.alert('Atenção', 'A nova senha deve ter pelo menos 4 caracteres.');
            return;
        }
        if (nova !== confirma) {
            Alert.alert('Atenção', 'A confirmação não confere com a nova senha.');
            return;
        }
        if (nova === atual) {
            Alert.alert('Atenção', 'A nova senha deve ser diferente da atual.');
            return;
        }

        setIsChangingPwd(true);
        try {
            const session = await getSession();
            if (!session?.id) {
                Alert.alert('Erro', 'Sessão expirada. Entre novamente.');
                return;
            }
            const resp = await api.driver.changePassword(session.id, atual, nova);
            const data = resp?.data || {};
            if (data.status === 'sucesso') {
                setPwd({ atual: '', nova: '', confirma: '' });
                Alert.alert('Pronto', data.mensagem || 'Senha alterada com sucesso.');
            } else {
                Alert.alert('Erro', data.mensagem || 'Não foi possível alterar a senha.');
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Erro', 'Falha de conexão ao alterar a senha.');
        } finally {
            setIsChangingPwd(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Simulando o salvamento via API
            setTimeout(() => {
                Alert.alert('Sucesso', 'Perfil atualizado com sucesso!');
                setIsSaving(false);
            }, 1000);
        } catch (e) {
            Alert.alert('Erro', 'Falha ao atualizar perfil');
            setIsSaving(false);
        }
    };

    return (
        <Container>
            <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
            <Header>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={28} color={colors.text} />
                </TouchableOpacity>
                <HeaderTitle>Meu Perfil e Veículo</HeaderTitle>
                <View style={{ width: 28 }} />
            </Header>

            {/* Tabs: Perfil | Veículo */}
            <View style={{ flexDirection: 'row', marginHorizontal: 20, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 4 }}>
                {[{ k: 'perfil', label: 'Perfil', icon: 'person' }, { k: 'veiculo', label: 'Veículo', icon: 'directions-car' }, { k: 'seguranca', label: 'Senha', icon: 'lock' }].map(t => (
                    <TouchableOpacity key={t.k} onPress={() => setTab(t.k)} activeOpacity={0.8}
                        style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: tab === t.k ? '#243049' : 'transparent' }}>
                        <Icon name={t.icon} size={18} color={tab === t.k ? colors.primary : '#94a3b8'} />
                        <Text style={{ marginLeft: 6, fontWeight: '900', fontSize: 13, color: tab === t.k ? colors.text : '#94a3b8' }}>{t.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Content showsVerticalScrollIndicator={false}>
                {tab === 'perfil' ? (
                  <>
                    <PhotoContainer>
                        <View>
                            <ProfilePhoto>
                                <SmartImage value={driverData.img} style={{ width: '100%', height: '100%' }} fallbackIcon="person" fallbackSize={80} fallbackBg="transparent" alignTop />
                            </ProfilePhoto>
                            <EditPhotoBtn style={{ right: 0, bottom: 5 }}>
                                <Icon name="photo-camera" size={20} color="#fff" />
                            </EditPhotoBtn>
                        </View>
                        <Text style={{ color: colors.text, fontSize: 24, fontWeight: 'bold', marginTop: 15 }}>{(driverData.nome || '').trim() || 'Motorista'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(58, 181, 107, 0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 5 }}>
                            <Icon name="verified" size={14} color={colors.primary} />
                            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '900', marginLeft: 5 }}>MOTORISTA {String(driverData.nivel || 'Ouro').toUpperCase()}</Text>
                        </View>
                    </PhotoContainer>

                    <Section>
                        <SectionTitle>Dados Pessoais</SectionTitle>
                        <InputGroup>
                            <Label>NOME COMPLETO</Label>
                            <StyledInput value={driverData.nome} onChangeText={t => setDriverData({...driverData, nome: t})} placeholder="Seu nome" />
                        </InputGroup>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <InputGroup style={{ width: '48%' }}>
                                <Label>TELEFONE</Label>
                                <StyledInput value={driverData.telefone} keyboardType="phone-pad" onChangeText={t => setDriverData({...driverData, telefone: t})} placeholder="(00) 00000-0000" />
                            </InputGroup>
                            <InputGroup style={{ width: '48%' }}>
                                <Label>CPF</Label>
                                <StyledInput value={driverData.cpf} editable={false} style={{ opacity: 0.6 }} />
                            </InputGroup>
                        </View>
                        <InputGroup>
                            <Label>EMAIL</Label>
                            <StyledInput value={driverData.email} keyboardType="email-address" onChangeText={t => setDriverData({...driverData, email: t})} placeholder="seu@email.com" />
                        </InputGroup>
                    </Section>
                  </>
                ) : tab === 'veiculo' ? (
                  <>
                    <Section>
                        <SectionTitle>Identidade do Veículo</SectionTitle>
                        <InputGroup>
                            <Label>VEÍCULO (MODELO)</Label>
                            <StyledInput value={driverData.veiculo} onChangeText={t => setDriverData({...driverData, veiculo: t})} placeholder="Ex: Ônix Sedan branco" />
                        </InputGroup>
                        <InputGroup>
                            <Label>PLACA OFICIAL</Label>
                            <StyledInput value={driverData.placa} autoCapitalize="characters" onChangeText={t => setDriverData({...driverData, placa: t})} placeholder="ABC-1234" />
                        </InputGroup>

                        <View style={{ marginTop: 20, marginBottom: 15 }}>
                            <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>Fotos do Veículo</Text>
                            <Text style={{ color: '#64748b', fontSize: 12 }}>Essas fotos serão visíveis para os passageiros.</Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            {[{ f: 'img_frente', l: 'VISTA FRONTAL' }, { f: 'img_lateral', l: 'VISTA LATERAL' }].map(p => (
                                <TouchableOpacity key={p.f} style={{ width: '48%' }} onPress={() => pickImage(p.f)}>
                                    <Label>{p.l}</Label>
                                    <View style={{ height: 110, backgroundColor: '#131C2E', borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#243049', justifyContent: 'center', alignItems: 'center' }}>
                                        <SmartImage value={driverData[p.f]} style={{ width: '100%', height: '100%' }} fallbackBg="transparent" />
                                        <View style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 5 }}>
                                            <Icon name="photo-camera" size={16} color="#fff" />
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={{ marginTop: 25 }} onPress={() => pickImage('img_documento')}>
                            <Label>DOCUMENTO CRLV</Label>
                            <View style={{ height: 140, backgroundColor: '#131C2E', borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: '#243049', justifyContent: 'center', alignItems: 'center' }}>
                                {!!String(driverData.img_documento || '').trim() && (
                                    <SmartImage value={driverData.img_documento} style={{ width: '100%', height: '100%', opacity: 0.5 }} fallbackBg="transparent" fallbackIcon="picture-as-pdf" />
                                )}
                                <View style={{ position: 'absolute', alignSelf: 'center', backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, flexDirection: 'row', alignItems: 'center' }}>
                                    <Icon name="document-scanner" size={22} color="#fff" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>{String(driverData.img_documento || '').trim() ? 'ATUALIZAR DOCUMENTO' : 'ADICIONAR DOCUMENTO'}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </Section>
                  </>
                ) : (
                  <>
                    <Section>
                        <SectionTitle>Alterar Senha</SectionTitle>
                        <Text style={{ color: '#64748b', fontSize: 13, marginTop: -10, marginBottom: 20 }}>
                            Para sua segurança, confirme a senha atual antes de definir uma nova.
                        </Text>

                        <InputGroup>
                            <Label>SENHA ATUAL</Label>
                            <StyledInput
                                value={pwd.atual}
                                onChangeText={t => setPwd({ ...pwd, atual: t })}
                                placeholder="Sua senha atual"
                                secureTextEntry={!showPwd}
                                autoCapitalize="none"
                            />
                        </InputGroup>
                        <InputGroup>
                            <Label>NOVA SENHA</Label>
                            <StyledInput
                                value={pwd.nova}
                                onChangeText={t => setPwd({ ...pwd, nova: t })}
                                placeholder="Mínimo 4 caracteres"
                                secureTextEntry={!showPwd}
                                autoCapitalize="none"
                            />
                        </InputGroup>
                        <InputGroup>
                            <Label>CONFIRMAR NOVA SENHA</Label>
                            <StyledInput
                                value={pwd.confirma}
                                onChangeText={t => setPwd({ ...pwd, confirma: t })}
                                placeholder="Repita a nova senha"
                                secureTextEntry={!showPwd}
                                autoCapitalize="none"
                            />
                        </InputGroup>

                        <TouchableOpacity onPress={() => setShowPwd(v => !v)} activeOpacity={0.7}
                            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon name={showPwd ? 'visibility-off' : 'visibility'} size={18} color={colors.primary} />
                            <Text style={{ marginLeft: 6, color: colors.primary, fontWeight: 'bold', fontSize: 13 }}>
                                {showPwd ? 'Ocultar senhas' : 'Mostrar senhas'}
                            </Text>
                        </TouchableOpacity>
                    </Section>

                    <SaveButton activeOpacity={0.8} onPress={handleChangePassword} disabled={isChangingPwd}>
                        {isChangingPwd ? <ActivityIndicator color="#fff" /> : (
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 }}>ALTERAR SENHA</Text>
                        )}
                    </SaveButton>
                  </>
                )}

                {tab !== 'seguranca' && (
                  <SaveButton activeOpacity={0.8} onPress={handleSave} disabled={isSaving}>
                    {isSaving ? <ActivityIndicator color="#fff" /> : (
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 }}>SALVAR ALTERAÇÕES</Text>
                    )}
                  </SaveButton>
                )}
            </Content>
        </Container>
    );
};

export default VehicleProfileScreen;
