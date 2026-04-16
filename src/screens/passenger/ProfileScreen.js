import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StatusBar, 
  SafeAreaView, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  Alert, 
  StyleSheet, 
  Platform, 
  Image, 
  ActivityIndicator 
} from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import api from '../../services/api';
import { getSession, clearSession } from '../../utils/session';

const Container = styled.View`
  flex: 1;
  background-color: #f8f9fa;
`;

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  background-color: #fff;
`;

const HeaderTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${colors.secondary};
`;

const ProfileSection = styled.View`
  align-items: center;
  padding: 30px;
  background-color: #fff;
`;

const AvatarContainer = styled.TouchableOpacity`
  width: 100px;
  height: 100px;
  border-radius: 50px;
  background-color: #f0f0f0;
  justify-content: center;
  align-items: center;
  margin-bottom: 15px;
  border-width: 2px;
  border-color: ${colors.primary};
`;

const EditInfoSection = styled.View`
  padding: 20px;
`;

const InputGroup = styled.View`
  margin-bottom: 20px;
`;

const Label = styled.Text`
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
  font-weight: 600;
`;

const StyledInput = styled.TextInput`
  height: 55px;
  background-color: #fff;
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 12px;
  padding-horizontal: 15px;
  font-size: 16px;
`;

const SaveButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 55px;
  border-radius: 12px;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
`;

const LogoutButton = styled.TouchableOpacity`
  background-color: #fff;
  height: 55px;
  border-radius: 12px;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  border-width: 1px;
  border-color: #ff4444;
`;

const ProfileScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileId, setProfileId] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) {
        navigation.navigate('PassengerLogin');
        return;
      }

      const response = await api.passenger.getProfile(session.telefone, session.senha);
      if (response.data) {
        setName(response.data.nome || '');
        setEmail(response.data.email || '');
        setPhone(response.data.telefone || '');
        setProfileId(response.data.id);
      }
    } catch (e) {
      console.error('Erro ao carregar perfil:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await api.passenger.updateProfile({ 
        cliente_id: profileId, 
        nome: name, 
        email, 
        telefone: phone 
      });
      if (response.data.status === 'sucesso') {
        Alert.alert('Sucesso', 'Perfil atualizado com sucesso!');
      } else {
        Alert.alert('Aviso', response.data.mensagem || 'Não foi possível atualizar o perfil');
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao atualizar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Deseja realmente sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { 
        text: 'Sair', 
        style: 'destructive', 
        onPress: async () => {
          await clearSession();
          navigation.navigate('PassengerLogin');
        } 
      }
    ]);
  };

  return (
    <Container>
      <StatusBar barStyle="dark-content" />
      <Header>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={28} color={colors.secondary} />
        </TouchableOpacity>
        <HeaderTitle>Configurações</HeaderTitle>
        <View style={{ width: 28 }} />
      </Header>

      <ScrollView showsVerticalScrollIndicator={false}>
        <ProfileSection style={{ backgroundColor: 'transparent' }}>
          <View style={{ alignItems: 'center', marginTop: 20 }}>
            <AvatarContainer>
              <Icon name="person" size={60} color="#cbd5e0" />
              <TouchableOpacity style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: colors.primary, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#f8f9fa' }}>
                <Icon name="photo-camera" size={16} color="#000" />
              </TouchableOpacity>
            </AvatarContainer>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.secondary }}>{name}</Text>
            <Text style={{ color: '#64748b', fontSize: 14 }}>{phone}</Text>
          </View>
        </ProfileSection>

        <EditInfoSection>
          <View style={{ backgroundColor: '#fff', padding: 25, borderRadius: 25, elevation: 2, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.05, shadowRadius: 10, marginBottom: 25 }}>
              <InputGroup>
                <Label>NOME COMPLETO</Label>
                <StyledInput 
                  value={name} 
                  onChangeText={setName} 
                  placeholder="Ex: João Silva" 
                  style={{ backgroundColor: '#f8fafc', borderWidth: 0 }} 
                />
              </InputGroup>

              <InputGroup>
                <Label>E-MAIL</Label>
                <StyledInput 
                  value={email} 
                  onChangeText={setEmail} 
                  keyboardType="email-address" 
                  placeholder="seu@email.com" 
                  style={{ backgroundColor: '#f8fafc', borderWidth: 0 }} 
                />
              </InputGroup>

              <InputGroup style={{ marginBottom: 10 }}>
                <Label>TELEFONE</Label>
                <StyledInput 
                  value={phone} 
                  onChangeText={setPhone} 
                  keyboardType="phone-pad" 
                  style={{ backgroundColor: '#f8fafc', borderWidth: 0 }} 
                />
              </InputGroup>

              <TouchableOpacity 
                onPress={() => navigation.navigate('ForgotPassword')}
                style={{ alignSelf: 'flex-end', paddingVertical: 10 }}>
                <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 13 }}>REDEFINIR SENHA SEGURA</Text>
              </TouchableOpacity>
          </View>

          <SaveButton activeOpacity={0.8} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={{ color: '#000', fontSize: 18, fontWeight: 'bold' }}>SALVAR ALTERAÇÕES</Text>}
          </SaveButton>

          <LogoutButton activeOpacity={0.7} onPress={handleLogout} style={{ borderStyle: 'dashed' }}>
            <Text style={{ color: '#ff4444', fontSize: 16, fontWeight: 'bold' }}>ENCERRAR SESSÃO</Text>
          </LogoutButton>

          <TouchableOpacity style={{ marginTop: 40, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="delete-forever" size={18} color="#94a3b8" />
                <Text style={{ color: '#94a3b8', fontSize: 13, marginLeft: 5 }}>Excluir conta definitivamente</Text>
            </View>
          </TouchableOpacity>
        </EditInfoSection>
      </ScrollView>
    </Container>
  );
};

export default ProfileScreen;
