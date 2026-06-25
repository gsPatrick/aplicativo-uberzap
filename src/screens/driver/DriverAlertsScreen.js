import React, { useState, useEffect } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, FlatList, Platform, StyleSheet } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import alertsService from '../../services/alertsService';
import { getSession } from '../../utils/session';

const Container = styled.View`
  flex: 1;
  background-color: ${colors.background};
`;

const Header = styled.View`
  background-color: #131C2E;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom-width: 1px;
  border-bottom-color: #243049;
`;

const HeaderTitle = styled.Text`
  color: ${colors.text};
  font-size: 18px;
  font-weight: bold;
`;

const AlertCard = styled.View`
  background-color: #131C2E;
  margin-horizontal: ${spacing.md}px;
  margin-top: ${spacing.md}px;
  padding: 20px;
  border-radius: ${borderRadius.lg}px;
  border-left-width: 4px;
  border-left-color: ${colors.primary};
  border-width: 1px;
  border-color: #243049;
`;

const AlertDate = styled.Text`
  color: ${colors.primary};
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 8px;
`;

const AlertMsg = styled.Text`
  color: ${colors.text};
  font-size: 15px;
  line-height: 22px;
`;

const EmptyContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
  margin-top: 100px;
`;

const EmptyText = styled.Text`
  color: #64748b;
  font-size: 16px;
  margin-top: 20px;
  text-align: center;
  padding-horizontal: 40px;
`;

const DriverAlertsScreen = () => {
    const navigation = useNavigation();
    const [alerts, setAlerts] = useState(alertsService.getAlerts());

    useEffect(() => {
        // Busca alertas do servidor ao montar a tela
        const loadAlerts = async () => {
            const session = await getSession();
            if (session) {
                await alertsService.fetchAlerts(session.id);
            }
        };
        loadAlerts();

        // Se inscreve para atualizações
        const unsubscribe = alertsService.subscribe((newAlerts) => {
            setAlerts(newAlerts);
        });
        return () => unsubscribe();
    }, []);

    const renderItem = ({ item }) => (
        <AlertCard>
            <AlertDate>{item.date}</AlertDate>
            <AlertMsg>{item.msg}</AlertMsg>
        </AlertCard>
    );

    return (
        <Container>
            <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
            <Header>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Icon name="arrow-back" size={28} color={colors.text} />
                </TouchableOpacity>
                <HeaderTitle>Central de Alertas</HeaderTitle>
                <TouchableOpacity onPress={() => alertsService.clearAlerts()}>
                    <Icon name="delete-sweep" size={24} color="#64748b" />
                </TouchableOpacity>
            </Header>

            <FlatList
                data={alerts}
                keyExtractor={item => item.id.toString()}
                renderItem={renderItem}
                ListEmptyComponent={
                    <EmptyContainer>
                        <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' }}>
                            <Icon name="notifications-none" size={50} color="#94a3b8" />
                        </View>
                        <EmptyText>Sua central de alertas está vazia. Você receberá avisos importantes aqui.</EmptyText>
                    </EmptyContainer>
                }
                contentContainerStyle={{ paddingBottom: 40 }}
            />
        </Container>
    );
};

export default DriverAlertsScreen;
