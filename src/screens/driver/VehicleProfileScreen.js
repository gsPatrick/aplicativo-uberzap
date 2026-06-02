import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, TouchableOpacity, ScrollView, TextInput, Alert, StyleSheet, Platform, ActivityIndicator, Image } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import api from '../../services/api';
import { getSession } from '../../utils/session';

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
  background-color: #fff;
  border-bottom-width: 1px;
  border-bottom-color: #e2e8f0;
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
  background-color: #e2e8f0;
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
  border-color: #fff;
`;

const Section = styled.View`
  margin-bottom: 30px;
  background-color: #fff;
  padding: 20px;
  border-radius: 25px;
  border-width: 1px;
  border-color: #e2e8f0;
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
  background-color: #f8f9fa;
  color: ${colors.text};
  padding: 15px;
  border-radius: 12px;
  font-size: 16px;
  border-width: 1px;
  border-color: #e2e8f0;
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
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [driverData, setDriverData] = useState({
        nome: 'Carregando...',
        email: '',
        telefone: '',
        cpf: '',
        marca_modelo: '',
        placa: '',
        cor: '',
        categoria: '',
        img_frente: null,
        img_lateral: null,
        img_documento: null,
        nivel: 'Básico'
    });

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
            <StatusBar barStyle="dark-content" />
            <Header>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={28} color={colors.text} />
                </TouchableOpacity>
                <HeaderTitle>Meu Perfil e Veículo</HeaderTitle>
                <View style={{ width: 28 }} />
            </Header>

            <Content showsVerticalScrollIndicator={false}>
                <PhotoContainer>
                    <View>
                        <ProfilePhoto>
                            <Icon name="person" size={80} color="#64748b" />
                        </ProfilePhoto>
                        <EditPhotoBtn style={{ right: 0, bottom: 5 }}>
                            <Icon name="photo-camera" size={20} color="#fff" />
                        </EditPhotoBtn>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 24, fontWeight: 'bold', marginTop: 15 }}>{driverData.nome}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(58, 181, 107, 0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginTop: 5 }}>
                        <Icon name="verified" size={14} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '900', marginLeft: 5 }}>MOTORISTA {driverData.nivel.toUpperCase()}</Text>
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

                <Section>
                    <SectionTitle>Identidade do Veículo</SectionTitle>
                    <InputGroup>
                        <Label>MARCA E MODELO</Label>
                        <StyledInput value={driverData.marca_modelo} onChangeText={t => setDriverData({...driverData, marca_modelo: t})} placeholder="Ex: Toyota Corolla" />
                    </InputGroup>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <InputGroup style={{ width: '48%' }}>
                            <Label>PLACA OFICIAL</Label>
                            <StyledInput value={driverData.placa} autoCapitalize="characters" onChangeText={t => setDriverData({...driverData, placa: t})} placeholder="ABC-1234" />
                        </InputGroup>
                        <InputGroup style={{ width: '48%' }}>
                            <Label>COR</Label>
                            <StyledInput value={driverData.cor} onChangeText={t => setDriverData({...driverData, cor: t})} placeholder="Ex: Preto" />
                        </InputGroup>
                    </View>

                    <View style={{ marginTop: 20, marginBottom: 15 }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>Fotos do Veículo</Text>
                        <Text style={{ color: '#64748b', fontSize: 12 }}>Essas fotos serão visíveis para os passageiros.</Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <TouchableOpacity style={{ width: '48%' }} onPress={() => pickImage('img_frente')}>
                            <Label>VISTA FRONTAL</Label>
                            <View style={{ height: 110, backgroundColor: '#f8f9fa', borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#e2e8f0' }}>
                                <Image source={{ uri: driverData.img_frente }} style={{ flex: 1 }} resizeMode="cover" />
                                <View style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 5 }}>
                                    <Icon name="photo-camera" size={16} color="#fff" />
                                </View>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ width: '48%' }} onPress={() => pickImage('img_lateral')}>
                            <Label>VISTA LATERAL</Label>
                            <View style={{ height: 110, backgroundColor: '#f8f9fa', borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: '#e2e8f0' }}>
                                <Image source={{ uri: driverData.img_lateral }} style={{ flex: 1 }} resizeMode="cover" />
                                <View style={{ position: 'absolute', bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 5 }}>
                                    <Icon name="photo-camera" size={16} color="#fff" />
                                </View>
                            </View>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={{ marginTop: 25 }} onPress={() => pickImage('img_documento')}>
                        <Label>DOCUMENTO CRLV (CAPTURAR)</Label>
                        <View style={{ height: 140, backgroundColor: '#f8f9fa', borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: '#e2e8f0', justifyContent: 'center' }}>
                            <Image source={{ uri: driverData.img_documento }} style={{ flex: 1, opacity: 0.4 }} resizeMode="cover" />
                            <View style={{ position: 'absolute', alignSelf: 'center', backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 15, flexDirection: 'row', alignItems: 'center' }}>
                                <Icon name="document-scanner" size={22} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>ATUALIZAR DOCUMENTO</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Section>

                <SaveButton activeOpacity={0.8} onPress={handleSave} disabled={isSaving}>
                    {isSaving ? <ActivityIndicator color="#fff" /> : (
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 }}>SALVAR ALTERAÇÕES</Text>
                    )}
                </SaveButton>
            </Content>
        </Container>
    );
};

export default VehicleProfileScreen;
