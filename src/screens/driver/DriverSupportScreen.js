import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, TouchableOpacity, ScrollView, TextInput, Alert, StyleSheet, Platform, ActivityIndicator, FlatList } from 'react-native';
import styled from 'styled-components/native';
import Icon from '../../components/AppIcon';
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
  background-color: #131C2E;
  border-bottom-width: 1px;
  border-bottom-color: #243049;
`;

const HeaderTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${colors.text};
`;

const Section = styled.View`
  padding: 20px;
  margin-top: 10px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: ${colors.text};
  margin-bottom: 15px;
`;

const MessageCard = styled.View`
  background-color: #131C2E;
  padding: 15px;
  border-radius: 15px;
  margin-bottom: 12px;
  border-width: 1px;
  border-color: #243049;
  border-left-width: 4px;
  border-left-color: ${props => props.isUser ? colors.primary : '#3b82f6'};
`;

const MessageText = styled.Text`
  color: ${colors.text};
  font-size: 15px;
`;

const MessageDate = styled.Text`
  color: #94a3b8;
  font-size: 11px;
  margin-top: 5px;
  text-align: right;
`;

const InputContainer = styled.View`
  padding: 20px;
  padding-bottom: ${Platform.OS === 'ios' ? 40 : 20}px;
  background-color: #131C2E;
  border-top-width: 1px;
  border-top-color: #243049;
`;

const StyledInput = styled.TextInput`
  background-color: #1B2740;
  color: ${colors.text};
  padding: 15px;
  border-radius: 15px;
  font-size: 16px;
  min-height: 50px;
  max-height: 120px;
`;

const SendButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  width: 50px;
  height: 50px;
  border-radius: 25px;
  justify-content: center;
  align-items: center;
  margin-left: 10px;
`;

const DriverSupportScreen = () => {
    const navigation = useNavigation();
    const route = useNavigation().getState().routes.find(r => r.name === 'DriverSupport');
    const prefill = route?.params?.prefill;

    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newMessage, setNewMessage] = useState(prefill || '');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        loadMessages();
        if (prefill) {
            setNewMessage(prefill);
        }
    }, [prefill]);

    const loadMessages = async () => {
        try {
            const session = await getSession();
            if (!session) return;
            const rideId = session.activeRideId;
            if (!rideId) {
                setMessages([]);
                return;
            }
            const resp = await api.driver.getDriverMessages(rideId);
            if (resp.data && Array.isArray(resp.data)) setMessages(resp.data);
            else setMessages([]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!newMessage.trim()) return;
        setIsSending(true);
        try {
            const session = await getSession();
            if (!session) return;
            if (!session.activeRideId) {
                Alert.alert('Atenção', 'O chat com a central usa a corrida em andamento. Inicie ou aceite uma corrida para enviar mensagens aqui, ou use o WhatsApp da cidade.');
                return;
            }
            const resp = await api.driver.sendDriverMessage({
                id_corrida: session.activeRideId,
                msg: newMessage,
                sender: '1',
            });
            if (resp.data === 'ok') {
                setNewMessage('');
                loadMessages();
            }
        } catch (e) {
            Alert.alert('Erro', 'Falha ao enviar mensagem');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Container>
            <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
            <Header>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={28} color={colors.text} />
                </TouchableOpacity>
                <HeaderTitle>Suporte Motorista</HeaderTitle>
                <TouchableOpacity onPress={loadMessages}>
                    <Icon name="refresh" size={24} color={colors.primary} />
                </TouchableOpacity>
            </Header>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                <Section>
                    <SectionTitle>Status dos seus Chamados</SectionTitle>
                    {loading ? (
                        <ActivityIndicator color={colors.primary} />
                    ) : messages.length === 0 ? (
                        <MessageText style={{ color: '#64748b', paddingVertical: 12 }}>
                            Sem mensagens nesta corrida. Durante uma corrida ativa, use o campo abaixo para falar com o passageiro/sistema. Fora de corrida, use o WhatsApp da central.
                        </MessageText>
                    ) : (
                        messages.map((item, idx) => (
                            <MessageCard key={item.id || idx} isUser={String(item.sender) === '1'}>
                                <MessageText>{item.msg}</MessageText>
                                <MessageDate>{item.hora || item.date || ''}</MessageDate>
                            </MessageCard>
                        ))
                    )}
                </Section>
            </ScrollView>

            <InputContainer>
               <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                    <View style={{ flex: 1 }}>
                         <StyledInput 
                            placeholder="Descreva sua dúvida ou problema..."
                            placeholderTextColor="#64748B"
                            multiline
                            value={newMessage}
                            onChangeText={setNewMessage}
                         />
                    </View>
                    <SendButton onPress={handleSend} disabled={isSending}>
                        {isSending ? <ActivityIndicator color="#fff" size="small" /> : (
                            <Icon name="send" size={24} color="#fff" />
                        )}
                    </SendButton>
               </View>
            </InputContainer>
        </Container>
    );
};

export default DriverSupportScreen;
