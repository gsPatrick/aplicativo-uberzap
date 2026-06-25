import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Platform, Alert, Image, Modal } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import SmartImage from '../../components/SmartImage';
import { getSession } from '../../utils/session';
import { CONFIG } from '../../config';

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

const DocItem = styled.TouchableOpacity`
  background-color: #131C2E;
  padding: 12px;
  border-radius: 15px;
  flex-direction: row;
  align-items: center;
  margin-bottom: 12px;
  border-width: 1px;
  border-color: ${props => props.hasImage ? colors.primary : '#243049'};
`;

const SubmitButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  padding: 18px;
  border-radius: 15px;
  align-items: center;
  margin: 20px;
  opacity: ${props => props.disabled ? 0.5 : 1};
`;

// Mapeia a chave do app -> nome do campo retornado pelo get_perfil (antecedente é singular no banco)
const docList = [
    { key: 'img_cnh', server: 'img_cnh', name: 'CNH (Carteira de Habilitação)', icon: 'assignment-ind' },
    { key: 'img_documento', server: 'img_documento', name: 'CRLV (Documento do Veículo)', icon: 'directions-car' },
    { key: 'img_lateral', server: 'img_lateral', name: 'Foto Lateral do Veículo', icon: 'camera-alt' },
    { key: 'img_frente', server: 'img_frente', name: 'Foto Frontal do Veículo', icon: 'camera-front' },
    { key: 'img_selfie', server: 'img_selfie', name: 'Sua Selfie (Rosto Visível)', icon: 'face' },
    { key: 'img_antecedentes', server: 'img_antecedente', name: 'Antecedentes Criminais', icon: 'verified-user' },
];

const isValidFile = (f) => !!f && f !== 'sem_imagem.png' && f !== 'sem_imagem' && String(f).trim() !== '';

const DriverDocsScreen = () => {
    const navigation = useNavigation();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [driverData, setDriverData] = useState(null);
    const [existingDocs, setExistingDocs] = useState({});
    const [preview, setPreview] = useState(null); // { value, name } da imagem em tela cheia
    const [images, setImages] = useState({
        img_cnh: null,
        img_documento: null,
        img_lateral: null,
        img_frente: null,
        img_selfie: null,
        img_antecedentes: null
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const session = await getSession();
            if (!session) { setFetching(false); return; }
            setDriverData(session);

            const res = await api.driver.getDriverProfile(session.id);
            const data = res?.data;
            if (data && typeof data === 'object') {
                setExistingDocs({
                    img_cnh: data.img_cnh || '',
                    img_documento: data.img_documento || '',
                    img_lateral: data.img_lateral || '',
                    img_frente: data.img_frente || '',
                    img_selfie: data.img_selfie || '',
                    img_antecedente: data.img_antecedente || '',
                });
                // Completa dados de identidade/veículo (usados num eventual envio)
                setDriverData(prev => ({
                    ...prev,
                    nome: data.nome || prev?.nome,
                    email: data.email || prev?.email,
                    cpf: data.cpf || prev?.cpf,
                    telefone: data.telefone || prev?.telefone,
                    cidade_id: data.cidade_id || prev?.cidade_id,
                    veiculo: data.veiculo || prev?.veiculo,
                    placa: data.placa || prev?.placa,
                }));
            }
        } catch (e) {
            console.warn('Erro ao carregar documentos:', e);
        } finally {
            setFetching(false);
        }
    };

    const pickImage = async (key) => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permissão necessária', 'Precisamos de acesso à sua câmera para capturar os documentos.');
            return;
        }

        let result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
        });

        if (!result.canceled) {
            setImages(prev => ({ ...prev, [key]: result.assets[0].uri }));
        }
    };

    const handleUpload = async () => {
        const missing = Object.values(images).some(img => img === null);
        if (missing) {
            Alert.alert('Atenção', 'Para enviar/atualizar, capture as 6 fotos solicitadas.');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('secret', CONFIG.SECRET_KEY);
            formData.append('nome', driverData.nome || '');
            formData.append('email', driverData.email || '');
            formData.append('cpf', driverData.cpf || '');
            formData.append('telefone', driverData.telefone || '');
            formData.append('cidade_id', driverData.cidade_id || '1');
            formData.append('veiculo', driverData.veiculo || 'Não informado');
            formData.append('placa', driverData.placa || 'N/A');

            Object.keys(images).forEach(key => {
                const uri = images[key];
                const filename = uri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image`;
                formData.append(key, { uri, name: filename, type });
            });

            const response = await api.driver.uploadDriverDocs(formData);

            if (response.data.status === 'ok') {
                Alert.alert('Sucesso', 'Documentos enviados! Aguarde a aprovação da nossa equipe.', [
                    { text: 'OK', onPress: () => navigation.navigate('DriverHome') }
                ]);
            } else {
                Alert.alert('Aviso', response.data.message || 'Não foi possível enviar os documentos.');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Erro', 'Falha na conexão com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    // Um doc é "existente" se já veio do servidor; "novo" se foi recapturado agora
    const serverFileFor = (doc) => existingDocs[doc.server];
    const hasServer = (doc) => isValidFile(serverFileFor(doc));
    const allServerPresent = docList.every(hasServer);

    if (fetching) {
        return (
            <Container>
                <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
                <Header>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Icon name="arrow-back" size={28} color={colors.text} />
                    </TouchableOpacity>
                    <HeaderTitle>Meus Documentos</HeaderTitle>
                    <View style={{ width: 28 }} />
                </Header>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={{ color: '#94a3b8', marginTop: 12 }}>Carregando seus documentos...</Text>
                </View>
            </Container>
        );
    }

    return (
        <Container>
            <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
            <Header>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={28} color={colors.text} />
                </TouchableOpacity>
                <HeaderTitle>{allServerPresent ? 'Meus Documentos' : 'Enviar Documentos'}</HeaderTitle>
                <View style={{ width: 28 }} />
            </Header>

            <Content showsVerticalScrollIndicator={false}>
                {allServerPresent ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#131C2E', borderRadius: 12, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: 'rgba(58,181,107,0.3)' }}>
                        <Icon name="verified-user" size={22} color={colors.primary} />
                        <Text style={{ color: '#22C55E', marginLeft: 10, flex: 1, fontSize: 13 }}>
                            Seus documentos foram enviados. Toque em qualquer um para visualizar.
                        </Text>
                    </View>
                ) : (
                    <Text style={{ color: '#64748b', marginBottom: 20 }}>
                        Para sua segurança e dos passageiros, precisamos validar sua documentação.
                    </Text>
                )}

                {docList.map((doc) => {
                    const localUri = images[doc.key];
                    const serverFile = serverFileFor(doc);
                    const onServer = isValidFile(serverFile);
                    const hasAny = !!localUri || onServer;
                    const onPress = () => {
                        if (localUri) { setPreview({ local: localUri, name: doc.name }); }
                        else if (onServer) { setPreview({ value: serverFile, name: doc.name }); }
                        else { pickImage(doc.key); }
                    };
                    return (
                        <DocItem key={doc.key} onPress={onPress} hasImage={hasAny} activeOpacity={0.8}>
                            <View style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
                                {localUri ? (
                                    <Image source={{ uri: localUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                ) : onServer ? (
                                    <SmartImage value={serverFile} style={{ width: '100%', height: '100%' }} resizeMode="cover" fallbackIcon={doc.icon} fallbackSize={24} fallbackBg="transparent" />
                                ) : (
                                    <Icon name={doc.icon} size={24} color="#94a3b8" />
                                )}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{doc.name}</Text>
                                <Text style={{ color: localUri ? '#F59E0B' : onServer ? colors.primary : '#94a3b8', fontSize: 12, marginTop: 3, fontWeight: '600' }}>
                                    {localUri ? 'Nova foto (não enviada)' : onServer ? 'Enviado' : 'Pendente'}
                                </Text>
                            </View>
                            {hasAny ? (
                                <Icon name={localUri ? 'edit' : 'visibility'} size={22} color={localUri ? '#F59E0B' : colors.primary} />
                            ) : (
                                <Icon name="add-a-photo" size={22} color="#94a3b8" />
                            )}
                        </DocItem>
                    );
                })}

                <View style={{ height: 20 }} />
            </Content>

            {/* O envio só faz sentido pra novo cadastro (o backend bloqueia CPF já cadastrado) */}
            {!allServerPresent && (
                <SubmitButton onPress={handleUpload} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#fff' }}>ENVIAR PARA ANÁLISE</Text>}
                </SubmitButton>
            )}

            {/* Preview em tela cheia */}
            <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <TouchableOpacity style={{ position: 'absolute', top: Platform.OS === 'ios' ? 60 : 40, right: 20, zIndex: 5, padding: 8 }} onPress={() => setPreview(null)}>
                        <Icon name="close" size={32} color="#fff" />
                    </TouchableOpacity>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' }}>{preview?.name}</Text>
                    {preview?.local ? (
                        <Image source={{ uri: preview.local }} style={{ width: '100%', height: '70%', borderRadius: 14 }} resizeMode="contain" />
                    ) : preview?.value ? (
                        <SmartImage value={preview.value} style={{ width: '100%', height: '70%', borderRadius: 14 }} resizeMode="contain" fallbackIcon="image" fallbackBg="#1f2937" />
                    ) : null}
                    {preview?.value && !preview?.local && (
                        <TouchableOpacity
                            onPress={() => {
                                const doc = docList.find(d => d.name === preview.name);
                                setPreview(null);
                                if (doc) pickImage(doc.key);
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 }}
                        >
                            <Icon name="photo-camera" size={20} color="#fff" />
                            <Text style={{ color: '#fff', marginLeft: 8, fontWeight: '700' }}>Refazer foto</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Modal>
        </Container>
    );
};

export default DriverDocsScreen;
