import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { Audio } from 'expo-av';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors, spacing } from '../../theme/tokens';
import api from '../../services/api';
import SmartImage from '../../components/SmartImage';
import { getSession } from '../../utils/session';

const Header = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${colors.secondary};
  padding: 15px ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 50 : 30}px;
  elevation: 5;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.2;
  shadow-radius: 4px;
`;

const ProfileImage = styled.Image`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  margin-left: 15px;
  margin-right: 15px;
  border-width: 2px;
  border-color: ${colors.primary};
`;

const UserInfo = styled.View`
  flex: 1;
`;

const UserName = styled.Text`
  color: #fff;
  font-size: 16px;
  font-weight: bold;
`;

const UserSub = styled.Text`
  color: #aaa;
  font-size: 12px;
  margin-top: 2px;
`;

const Container = styled.View`
  flex: 1;
  background-color: #0B1220;
`;

const MessageBubble = styled.View`
  max-width: 75%;
  padding: 12px 16px;
  border-radius: 20px;
  margin-bottom: 10px;
  background-color: ${props => props.isMine ? '#16A34A' : '#131C2E'};
  align-self: ${props => props.isMine ? 'flex-end' : 'flex-start'};
  border-bottom-right-radius: ${props => props.isMine ? 0 : 20}px;
  border-bottom-left-radius: ${props => !props.isMine ? 0 : 20}px;
  elevation: 1;
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.1;
  shadow-radius: 1px;
`;

const MessageText = styled.Text`
  color: #F1F5F9;
  font-size: 15px;
`;

const MessageTime = styled.Text`
  color: #94A3B8;
  font-size: 10px;
  align-self: flex-end;
  margin-top: 4px;
`;

const InputArea = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 10px ${spacing.md}px;
  background-color: #131C2E;
  border-top-width: 1px;
  border-top-color: #243049;
  padding-bottom: ${Platform.OS === 'ios' ? 25 : 10}px;
`;

const InputField = styled.TextInput`
  flex: 1;
  background-color: #1B2740;
  border-radius: 25px;
  padding: 12px 20px;
  font-size: 15px;
  max-height: 100px;
  margin-right: 10px;
  color: #F1F5F9;
`;

const SendButton = styled.TouchableOpacity`
  width: 46px;
  height: 46px;
  border-radius: 23px;
  background-color: ${props => props.disabled ? '#243049' : colors.primary};
  justify-content: center;
  align-items: center;
`;

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { rideId, isDriver, otherUser } = route.params || {};
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef();

  const [session, setSession] = useState(null);

  useEffect(() => {
    const initSession = async () => {
      const s = await getSession();
      setSession(s);
    };
    initSession();
  }, []);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [session]);

  const playMessageSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../../assets/sounds/messenger.mp3')
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };

  const PRESET_MESSAGES = [
    "Estou no local!",
    "Pode me aguardar?",
    "Estou saindo agora.",
    "Já estou te vendo!",
    "OK, obrigado!"
  ];

  const handleSendPreset = async (text) => {
    try {
      if (isDriver) {
        await api.driver.sendChat(rideId, text, '1');
      } else {
        if (!session) return;
        await api.passenger.sendChat(session.telefone, session.senha, text);
      }
      loadMessages();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    }
  };

  const loadMessages = async () => {
    try {
      let resp;
      if (isDriver) {
        resp = await api.driver.getChat(rideId);
      } else {
        if (!session) return;
        resp = await api.passenger.getChat(session.telefone, session.senha);
      }

      if (resp.data && Array.isArray(resp.data)) {
        const formatted = resp.data.map(m => ({
          id: m.id,
          text: m.msg,
          isMine: isDriver ? m.sender === '1' : m.sender === '2',
          time: m.hora
        }));
        
        // Verifica se chegou mensagem nova de outra pessoa
        if (formatted.length > messages.length) {
            const lastMsg = formatted[formatted.length - 1];
            if (!lastMsg.isMine) {
                playMessageSound();
            }
        }
        
        setMessages(formatted);
      }
    } catch (e) {
      console.warn('Erro ao carregar mensagens:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (inputText.trim() === '') return;
    
    const textToSend = inputText.trim();
    setInputText('');

    try {
      if (isDriver) {
        await api.driver.sendChat(rideId, textToSend, '1'); // sender 1 = motorista
      } else {
        if (!session) return;
        await api.passenger.sendChat(session.telefone, session.senha, textToSend);
      }
      loadMessages(); // Atualiza na hora
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível enviar a mensagem.');
    }
  };

  return (
    <Container>
      <StatusBar barStyle="light-content" backgroundColor={colors.secondary} />
      <Header>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }} activeOpacity={0.7}>
          <Icon name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <SmartImage
          value={otherUser?.img || otherUser?.foto}
          fallbackIcon="person" fallbackSize={24} fallbackBg="rgba(255,255,255,0.2)" alignTop
          style={{ width: 44, height: 44, borderRadius: 22, marginLeft: 15, marginRight: 15, borderWidth: 2, borderColor: colors.primary }}
        />
        <UserInfo>
          <UserName numberOfLines={1}>{otherUser?.nome || 'Chat'}</UserName>
          <UserSub numberOfLines={1}>
              {isDriver ? 'Passageiro Ubezap' : `${otherUser?.veiculo || 'Veículo'} • ${otherUser?.placa || 'Placa'}`}
          </UserSub>
        </UserInfo>
        <View style={{ width: 10 }} />
      </Header>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : null}
      >
        {loading ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        ) : (
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id.toString()}
                contentContainerStyle={{ padding: spacing.md, paddingBottom: 20 }}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => (
                    <MessageBubble isMine={item.isMine}>
                        <MessageText>{item.text}</MessageText>
                        <MessageTime>{item.time}</MessageTime>
                    </MessageBubble>
                )}
                ListEmptyComponent={() => (
                    <Text style={{ textAlign: 'center', color: '#94A3B8', marginTop: 50 }}>Inicie uma conversa com seu {isDriver ? 'passageiro' : 'motorista'}.</Text>
                )}
            />
        )}

        {/* Mensagens Rápidas */}
        <View style={{ backgroundColor: '#131C2E', borderTopWidth: 1, borderTopColor: '#243049' }}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={PRESET_MESSAGES}
              keyExtractor={(item) => item}
              style={{ paddingVertical: 10 }}
              contentContainerStyle={{ paddingHorizontal: 15 }}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  onPress={() => handleSendPreset(item)}
                  style={{
                    backgroundColor: '#1B2740',
                    paddingHorizontal: 15,
                    paddingVertical: 8,
                    borderRadius: 20,
                    marginRight: 8,
                    borderWidth: 1,
                    borderColor: '#243049'
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
        </View>

        <InputArea>
          <InputField
            placeholder="Digite uma mensagem..."
            placeholderTextColor="#64748B"
            value={inputText}
            onChangeText={setInputText}
            multiline
          />
          <SendButton 
            disabled={inputText.trim() === ''} 
            onPress={handleSend}
            activeOpacity={0.8}
          >
            <Icon name="send" size={20} color="#fff" style={{ marginLeft: 3 }} />
          </SendButton>
        </InputArea>
      </KeyboardAvoidingView>
    </Container>
  );
}
