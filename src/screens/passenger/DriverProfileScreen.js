import React from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, Image, Platform, StyleSheet } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView from 'react-native-maps';
import { colors, spacing } from '../../theme/tokens';
import api from '../../services/api';

const BackwardButton = styled.TouchableOpacity`
  position: absolute;
  top: ${Platform.OS === 'ios' ? 50 : 30}px;
  left: 20px;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: rgba(255,255,255,0.9);
  justify-content: center;
  align-items: center;
  z-index: 10;
  elevation: 5;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.3;
  shadow-radius: 3px;
`;

const ContentCard = styled.View`
  background-color: #fff;
  border-top-left-radius: 35px;
  border-top-right-radius: 35px;
  margin-top: -60px;
  padding-horizontal: 25px;
  padding-top: 10px;
  padding-bottom: 50px;
  min-height: 100%;
`;

const ProfileHeader = styled.View`
  align-items: center;
  margin-top: -65px;
`;

const LargeProfileImage = styled.Image`
  width: 120px;
  height: 120px;
  border-radius: 60px;
  border-width: 5px;
  border-color: #fff;
  background-color: #f0f0f0;
`;

const DriverNameTitle = styled.Text`
  font-size: 26px;
  font-weight: 800;
  color: #1f2120;
  margin-top: 15px;
  letter-spacing: -0.5px;
`;

const DriverSubtitle = styled.Text`
  font-size: 15px;
  color: #777;
  margin-top: 4px;
  font-weight: 500;
`;

const StatsGrid = styled.View`
  flex-direction: row;
  justify-content: space-around;
  margin-top: 30px;
  padding-vertical: 20px;
  border-top-width: 1px;
  border-bottom-width: 1px;
  border-color: #f0f0f0;
`;

const StatItem = styled.View`
  align-items: center;
`;

const StatHeader = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 5px;
`;

const StatValue = styled.Text`
  font-size: 22px;
  font-weight: 800;
  color: #1f2120;
`;

const StatLabel = styled.Text`
  font-size: 12px;
  color: #888;
  font-weight: 600;
  text-transform: uppercase;
  margin-top: 2px;
`;

const SectionTitle = styled.Text`
  font-size: 19px;
  font-weight: 700;
  color: #1f2120;
  margin-top: 30px;
  margin-bottom: 15px;
`;

const BadgesScroll = styled.ScrollView`
  flex-direction: row;
  margin-horizontal: -25px;
  padding-horizontal: 25px;
`;

const Badge = styled.View`
  background-color: #f4fbf6;
  padding-horizontal: 16px;
  padding-vertical: 12px;
  border-radius: 12px;
  margin-right: 12px;
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  border-color: rgba(58, 181, 107, 0.2);
`;

const BadgeText = styled.Text`
  color: ${colors.primary};
  font-weight: 700;
  margin-left: 8px;
  font-size: 14px;
`;

const CarInfoContainer = styled.View`
  background-color: #1f2120;
  padding: 20px;
  border-radius: 20px;
  flex-direction: row;
  align-items: center;
  margin-top: 10px;
  margin-bottom: 40px;
  elevation: 5;
  shadow-color: ${colors.primary};
  shadow-offset: 0px 4px;
  shadow-opacity: 0.2;
  shadow-radius: 8px;
`;

export default function DriverProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  
  const driver = route.params?.driver || {
    nome: 'Motorista',
    veiculo: 'Veículo',
    placa: 'AAA-0000',
    foto: 'https://randomuser.me/api/portraits/men/32.jpg',
    img: 'https://randomuser.me/api/portraits/men/32.jpg',
    rating: '5.0',
    coords: { latitude: -23.5617, longitude: -46.6623 }
  };

  const driverPhoto = api.getImageUrl(driver.img || driver.foto) || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {/* Map Background Header */}
      <View style={{ height: 260, width: '100%', backgroundColor: '#e0e0e0' }}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: driver.coords?.latitude || -23.5617,
            longitude: driver.coords?.longitude || -46.6623,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
        />
        {/* Magic Overlay Gradient equivalent */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(58, 181, 107, 0.2)' }]} />
        
        <BackwardButton onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Icon name="close" size={24} color="#1f2120" />
        </BackwardButton>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        style={{ flex: 1, zIndex: 5 }}
        contentContainerStyle={{ paddingTop: 200 }} // Deixa o mapa visível por baixo
      >
        <ContentCard style={{ marginTop: 0 }}>
          <ProfileHeader style={{ zIndex: 10, elevation: 10 }}>
            <LargeProfileImage 
              source={{ uri: driverPhoto }} 
              style={{ zIndex: 15, elevation: 15, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.3, shadowRadius: 5 }}
            />
            <DriverNameTitle>{driver.nome}</DriverNameTitle>
            <DriverSubtitle>Motorista Parceiro Ubezap</DriverSubtitle>
          </ProfileHeader>

          <StatsGrid>
             <StatItem>
               <StatHeader>
                 <Icon name="star" size={22} color="#f5b041" style={{ marginRight: 4 }} />
                 <StatValue>{driver.rating}</StatValue>
               </StatHeader>
               <StatLabel>Avaliação</StatLabel>
             </StatItem>
             <StatItem>
               <StatHeader>
                  <Icon name="insights" size={22} color={colors.primary} style={{ marginRight: 4 }} />
                  <StatValue>1.4k</StatValue>
               </StatHeader>
               <StatLabel>Corridas</StatLabel>
             </StatItem>
             <StatItem>
               <StatHeader>
                 <Icon name="schedule" size={22} color="#777" style={{ marginRight: 4 }} />
                 <StatValue>1.5</StatValue>
               </StatHeader>
               <StatLabel>Anos</StatLabel>
             </StatItem>
          </StatsGrid>

          <SectionTitle>Reconhecimentos</SectionTitle>
          <BadgesScroll horizontal showsHorizontalScrollIndicator={false}>
            <Badge><Icon name="thumb-up" size={18} color={colors.primary} /><BadgeText>Muito Educado</BadgeText></Badge>
            <Badge><Icon name="mood" size={18} color={colors.primary} /><BadgeText>Ótimo Papo</BadgeText></Badge>
            <Badge><Icon name="map" size={18} color={colors.primary} /><BadgeText>Mestre da Rota</BadgeText></Badge>
            <Badge><Icon name="local-car-wash" size={18} color={colors.primary} /><BadgeText>Carro Impecável</BadgeText></Badge>
          </BadgesScroll>

          <SectionTitle>Veículo Destaque</SectionTitle>
          <CarInfoContainer>
             <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 18 }}>
               <Icon name={(driver.veiculo || '').toLowerCase().includes('moto') || (driver.veiculo || '').toLowerCase().includes('honda') ? 'motorcycle' : 'directions-car'} size={34} color={colors.primary} />
             </View>
             <View>
               <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 1 }}>{driver.placa}</Text>
               <Text style={{ fontSize: 15, color: '#aaa', marginTop: 2, fontWeight: '500' }}>{driver.veiculo}</Text>
             </View>
          </CarInfoContainer>
        </ContentCard>
      </ScrollView>
    </View>
  );
}
