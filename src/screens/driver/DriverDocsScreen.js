import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Platform, Alert, Image } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
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

const DocItem = styled.TouchableOpacity`
  background-color: #fff;
  padding: 15px;
  border-radius: 15px;
  flex-direction: row;
  align-items: center;
  margin-bottom: 12px;
  border-width: 1px;
  border-color: ${props => props.hasImage ? colors.primary : '#e2e8f0'};
`;

const SubmitButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  padding: 18px;
  border-radius: 15px;
  align-items: center;
  margin: 20px;
  opacity: ${props => props.disabled ? 0.5 : 1};
`;

const DriverDocsScreen = () => {
    const navigation = useNavigation();
    const [loading, setLoading] = useState(false);
    const [driverData, setDriverData] = useState(null);
    const [images, setImages] = useState({
        img_cnh: null,
        img_documento: null,
        img_lateral: null,
        img_frente: null,
        img_selfie: null,
        img_antecedentes: null
    });

    useEffect(() => {
        loadSession();
    }, []);

    const loadSession = async () => {
        const session = await getSession();
        if (session) setDriverData(session);
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
            Alert.alert('Atenção', 'Por favor, capture todas as 6 fotos solicitadas.');
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
                Alert.alert('Erro', response.data.message || 'Erro ao enviar documentos');
            }
        } catch (error) {
            console.error(error);
            Alert.alert('Erro', 'Falha na conexão com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    const docList = [
        { key: 'img_cnh', name: 'CNH (Carteira de Habilitação)', icon: 'assignment_ind' },
        { key: 'img_documento', name: 'CRLV (Documento do Veículo)', icon: 'directions_car' },
        { key: 'img_lateral', name: 'Foto Lateral do Veículo', icon: 'camera_alt' },
        { key: 'img_frente', name: 'Foto Frontal do Veículo', icon: 'camera_front' },
        { key: 'img_selfie', name: 'Sua Selfie (Rosto Visível)', icon: 'face' },
        { key: 'img_antecedentes', name: 'Antecedentes Criminais', icon: 'verified_user' },
    ];

    return (
        <Container>
            <StatusBar barStyle="dark-content" />
            <Header>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={28} color={colors.text} />
                </TouchableOpacity>
                <HeaderTitle>Enviar Documentos</HeaderTitle>
                <View style={{ width: 28 }} />
            </Header>

            <Content showsVerticalScrollIndicator={false}>
                <Text style={{ color: '#64748b', marginBottom: 20 }}>
                    Para sua segurança e dos passageiros, precisamos validar sua documentação.
                </Text>

                {docList.map((doc) => (
                    <DocItem 
                        key={doc.key} 
                        onPress={() => pickImage(doc.key)}
                        hasImage={!!images[doc.key]}
                    >
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                            <Icon name={doc.icon} size={24} color={images[doc.key] ? colors.primary : '#94a3b8'} />
                        </View>
                        <Text style={{ color: colors.text, flex: 1 }}>{doc.name}</Text>
                        {images[doc.key] ? (
                             <Icon name="check-circle" size={24} color={colors.primary} />
                        ) : (
                             <Icon name="add-a-photo" size={24} color="#94a3b8" />
                        )}
                    </DocItem>
                ))}
            </Content>

            <SubmitButton onPress={handleUpload} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#fff' }}>ENVIAR PARA ANÁLISE</Text>}
            </SubmitButton>
        </Container>
    );
};

export default DriverDocsScreen;
