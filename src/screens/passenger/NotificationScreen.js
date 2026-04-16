import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, StyleSheet, Platform, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import api from '../../services/api';
import { getSession } from '../../utils/session';

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
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const HeaderTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${colors.secondary};
`;

const NotificationItem = styled.TouchableOpacity`
  background-color: #fff;
  padding: 20px;
  margin-horizontal: 16px;
  margin-vertical: 8px;
  border-radius: 15px;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.05;
  shadow-radius: 4px;
  elevation: 2;
  flex-direction: row;
  align-items: center;
`;

const IconContainer = styled.View`
  width: 50px;
  height: 50px;
  border-radius: 25px;
  background-color: #f0f0f0;
  justify-content: center;
  align-items: center;
  margin-right: 15px;
`;

const ContentContainer = styled.View`
  flex: 1;
`;

const Message = styled.Text`
  font-size: 15px;
  color: #333;
  line-height: 20px;
`;

const DateText = styled.Text`
  font-size: 12px;
  color: #999;
  margin-top: 5px;
`;

const NotificationScreen = () => {
    const navigation = useNavigation();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async () => {
        try {
            const session = await getSession();
            if (!session) return;
            const response = await api.passenger.getNotifications(session.telefone, session.senha);
            if (response.data && response.data !== 'no') {
                setNotifications(response.data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadNotifications();
    };

    const renderItem = ({ item }) => (
        <NotificationItem activeOpacity={0.7}>
            <IconContainer>
                <Icon name="notifications" size={24} color={colors.primary} />
            </IconContainer>
            <ContentContainer>
                <Message numberOfLines={2}>{item.msg}</Message>
                <DateText>{item.hora}</DateText>
            </ContentContainer>
            <Icon name="chevron-right" size={20} color="#ccc" />
        </NotificationItem>
    );

    return (
        <Container>
            <StatusBar barStyle="dark-content" />
            <Header>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={28} color={colors.secondary} />
                </TouchableOpacity>
                <HeaderTitle>Mensagens</HeaderTitle>
                <TouchableOpacity onPress={onRefresh}>
                    <Icon name="refresh" size={24} color={colors.primary} />
                </TouchableOpacity>
            </Header>

            {loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    renderItem={renderItem}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={{ paddingVertical: 10 }}
                    ListEmptyComponent={
                        <View style={{ flex: 1, padding: 40, alignItems: 'center' }}>
                            <Icon name="mail-outline" size={80} color="#eee" />
                            <Text style={{ color: '#aaa', marginTop: 20 }}>Nenhuma mensagem nova.</Text>
                        </View>
                    }
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
                    }
                />
            )}
        </Container>
    );
};

export default NotificationScreen;
