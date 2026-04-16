import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, Image, Dimensions, Animated, Platform, ActivityIndicator, Linking } from 'react-native';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getSession, clearSession } from '../../utils/session';

const { width } = Dimensions.get('window');

// Fallback para MapView
let MapView = View;
let Marker = View;
let Polyline = View;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
} catch (e) {}

const Container = styled.View`
  flex: 1;
  background-color: #fff;
`;

const Content = styled.ScrollView`
  flex: 1;
  background-color: #f8fafc;
`;

const Header = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: ${spacing.md}px;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
`;

const UserGreeting = styled.View``;

const GreetingText = styled.Text`
  color: #64748b;
  font-size: 14px;
`;

const UserName = styled.Text`
  color: ${colors.secondary};
  font-size: 20px;
  font-weight: bold;
`;

const AvatarCircle = styled.TouchableOpacity`
  width: 45px;
  height: 45px;
  border-radius: 22.5px;
  background-color: #f1f5f9;
  justify-content: center;
  align-items: center;
  border-width: 1px;
  border-color: #e2e8f0;
`;

const WalletCard = styled(LinearGradient)`
  margin: ${spacing.md}px;
  padding: 20px;
  border-radius: 24px;
  height: 160px;
  justify-content: space-between;
`;

const WalletBalance = styled.View``;

const WalletLabel = styled.Text`
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const BalanceValue = styled.Text`
  color: #fff;
  font-size: 32px;
  font-weight: bold;
  margin-top: 5px;
`;

const WalletActions = styled.View`
  flex-direction: row;
  justify-content: flex-end;
`;

const AddFundsBtn = styled.TouchableOpacity`
  background-color: rgba(255,255,255,0.2);
  padding: 8px 15px;
  border-radius: 12px;
  flex-direction: row;
  align-items: center;
`;

const SearchAction = styled.TouchableOpacity`
  background-color: #fff;
  margin-horizontal: ${spacing.md}px;
  margin-vertical: 10px;
  height: 65px;
  border-radius: 18px;
  flex-direction: row;
  align-items: center;
  padding-horizontal: 20px;
  elevation: 4;
  shadow-color: #000;
  shadow-offset: 0px 2px;
  shadow-opacity: 0.05;
  shadow-radius: 10px;
`;

const SearchText = styled.Text`
  color: #1a1a1a;
  font-size: 18px;
  font-weight: 500;
  margin-left: 15px;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-horizontal: ${spacing.md}px;
  margin-top: 25px;
  margin-bottom: 15px;
`;

const SectionTitle = styled.Text`
  color: ${colors.secondary};
  font-size: 18px;
  font-weight: bold;
`;

const BannerContainer = styled.View`
  height: 140px;
  margin-vertical: 10px;
`;

const BannerImage = styled.Image`
  width: ${width - 40}px;
  height: 140px;
  border-radius: 8px;
  margin-horizontal: 20px;
`;

const CategoryGrid = styled.View`
  flex-direction: row;
  justify-content: space-between;
  padding-horizontal: ${spacing.md}px;
  margin-top: 10px;
`;

const CategoryItem = styled.TouchableOpacity`
  width: 30%;
  background-color: ${colors.primary};
  padding: 18px 25px;
  border-radius: 20px;
  align-items: center;
  elevation: 8;
  shadow-color: ${colors.primary};
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 12px;
`;

const IconCircle = styled.View`
  width: 50px;
  height: 50px;
  border-radius: 25px;
  background-color: rgba(255,255,255,0.2);
  justify-content: center;
  align-items: center;
`;

const CategoryLabel = styled.Text`
  color: ${colors.secondary};
  font-size: 12px;
  margin-top: 8px;
  font-weight: 600;
`;

const RecentRideCard = styled.TouchableOpacity`
  background-color: #fff;
  margin-horizontal: ${spacing.md}px;
  margin-bottom: 20px;
  border-radius: 20px;
  overflow: hidden;
  elevation: 4;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.08;
  shadow-radius: 12px;
`;

const RideMapPreview = styled.View`
  height: 120px;
  width: 100%;
  background-color: #f1f5f9;
`;

const RideDetails = styled.View`
  padding: 15px;
`;

const RideInfoRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const RideDateText = styled.Text`
  font-size: 12px;
  color: #64748b;
`;

const RidePriceText = styled.Text`
  font-size: 16px;
  font-weight: bold;
  color: ${colors.primary};
`;

const RidePath = styled.View`
  margin-top: 10px;
  border-left-width: 2px;
  border-left-color: #f1f5f9;
  padding-left: 10px;
`;

const PathPoint = styled.Text`
  font-size: 13px;
  color: ${colors.secondary};
  margin-vertical: 2px;
`;

// SIDE MENU COMPONENTS (Copiados e adaptados do HomeScreen)
const SideMenu = styled(Animated.View)`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 80%;
  background-color: #fff;
  z-index: 1000;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
  border-right-width: 1px;
  border-right-color: #f1f5f9;
`;

const MenuHeader = styled.View`
  padding: 20px;
  border-bottom-width: 1px;
  border-bottom-color: #f1f5f9;
  margin-bottom: 20px;
`;

const MenuItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: 15px 20px;
`;

const MenuText = styled.Text`
  color: ${colors.secondary};
  font-size: 16px;
  margin-left: 15px;
`;

const Overlay = styled.TouchableOpacity`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0,0,0,0.7);
  z-index: 999;
`;

const PrincipalScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const [banners, setBanners] = useState([]);
  const [recentRides, setRecentRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState('0,00');
  const [user, setUser] = useState({ nome: 'Passageiro' });
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(-width * 0.8)).current;
  const bannerScrollRef = useRef(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  /** true quando o hub foi aberto pelo menu com corrida ativa (não redirecionar de volta ao mapa) */
  const [hubOpenRide, setHubOpenRide] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Auto-slide para os Bancers
  useEffect(() => {
    if (banners.length > 1) {
      const interval = setInterval(() => {
        let nextIndex = currentBannerIndex + 1;
        if (nextIndex >= banners.length) nextIndex = 0;
        
        setCurrentBannerIndex(nextIndex);
        bannerScrollRef.current?.scrollTo({ x: nextIndex * width, animated: true });
      }, 5000); // 5 segundos por banner

      return () => clearInterval(interval);
    }
  }, [banners, currentBannerIndex]);

  const loadData = async () => {
    try {
      const session = await getSession();
      if (!session) {
        navigation.navigate('PassengerLogin');
        return;
      }

      try {
        const openRes = await api.passenger.hasOpenRide(session.telefone, session.senha);
        if (openRes.data === true) {
          const stayOnHub = route.params?.preferDashboard === true;
          if (stayOnHub) {
            navigation.setParams({ preferDashboard: undefined });
            setHubOpenRide(true);
          } else {
            setHubOpenRide(false);
            navigation.navigate('PassengerHome', { resumeActiveRide: true });
            return;
          }
        } else {
          setHubOpenRide(false);
        }
      } catch (e) {
        console.warn('busca_inicio:', e);
      }

      const profileRes = await api.passenger.getProfile(session.telefone, session.senha);
      let cityId = 1;

      if (profileRes.data && profileRes.data.nome) {
        setUser({
          nome: profileRes.data.nome || 'Passageiro'
        });
        cityId = profileRes.data.cidade_id || 1;
      }

      const bannerRes = await api.passenger.getBanners(cityId);
      if (bannerRes.data && Array.isArray(bannerRes.data)) {
        setBanners(bannerRes.data);
      } else {
        setBanners([]);
      }
      
      const walletRes = await api.passenger.getWallet(session.telefone, session.senha);
      if (walletRes.data && walletRes.data.saldo !== undefined) {
        setBalance(walletRes.data.saldo);
      }

      const historyRes = await api.passenger.getHistory(session.telefone, session.senha);
      if (historyRes.data && Array.isArray(historyRes.data)) {
        setRecentRides(historyRes.data.slice(0, 1));
      } else {
        setRecentRides([]);
      }
    } catch (e) {
      console.error(e);
      navigation.navigate('PassengerLogin');
    } finally {
      setLoading(false);
    }
  };

  const toggleMenu = () => {
    const toValue = isMenuOpen ? -width * 0.8 : 0;
    Animated.spring(menuAnim, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 40
    }).start();
    setIsMenuOpen(!isMenuOpen);
  };

  const menuItems = [
    { title: 'Início', icon: 'home', screen: 'PassengerPrincipal' },
    { title: 'Pedir Corrida', icon: 'map', screen: 'PassengerHome' },
    { title: 'Carteira', icon: 'account-balance-wallet', screen: 'WalletScreen' },
    { title: 'Histórico', icon: 'history', screen: 'HistoryScreen' },
    { title: 'Notificações', icon: 'notifications', screen: 'NotificationScreen' },
    { title: 'Ajuda', icon: 'help-outline', screen: 'SupportScreen' },
    { title: 'Configurações', icon: 'settings', screen: 'ProfileScreen' },
  ];

  return (
    <Container>
      <StatusBar barStyle="light-content" />
      
      {isMenuOpen && <Overlay activeOpacity={1} onPress={toggleMenu} />}
      
      <SideMenu style={{ transform: [{ translateX: menuAnim }] }}>
        <MenuHeader>
          <AvatarCircle style={{ width: 60, height: 60, borderRadius: 30, marginBottom: 15 }}>
            <Icon name="person" size={40} color={colors.primary} />
          </AvatarCircle>
          <UserName>{user.nome}</UserName>
        </MenuHeader>
        
        {menuItems.map((item, idx) => (
          <MenuItem key={idx} onPress={() => {
              toggleMenu();
              if (item.screen) navigation.navigate(item.screen);
          }}>
            <Icon name={item.icon} size={24} color={colors.primary} />
            <MenuText>{item.title}</MenuText>
          </MenuItem>
        ))}

        <MenuItem style={{ marginTop: 'auto', marginBottom: 20 }} onPress={async () => {
           await clearSession();
           navigation.navigate('PassengerLogin');
        }}>
           <Icon name="exit-to-app" size={24} color="#f44" />
           <MenuText style={{ color: '#f44' }}>Sair</MenuText>
        </MenuItem>
      </SideMenu>

      <Content showsVerticalScrollIndicator={false}>
        <StatusBar barStyle="dark-content" />
        <Header>
          <TouchableOpacity onPress={toggleMenu}>
            <Icon name="menu" size={30} color={colors.secondary} />
          </TouchableOpacity>
          <UserGreeting>
            <GreetingText>Bem-vindo de volta,</GreetingText>
            <UserName>{user.nome.split(' ')[0]}</UserName>
          </UserGreeting>
          <AvatarCircle onPress={() => navigation.navigate('ProfileScreen')}>
            <Icon name="person" size={28} color={colors.secondary} />
          </AvatarCircle>
        </Header>

        {hubOpenRide ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('PassengerHome', { resumeActiveRide: true })}
            style={{
              marginHorizontal: spacing.md,
              marginBottom: 10,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 14,
              backgroundColor: colors.primary,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Icon name="directions-car" size={22} color="#fff" style={{ marginRight: 10 }} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 }}>
                Corrida em andamento — toque para voltar ao mapa
              </Text>
            </View>
            <Icon name="chevron-right" size={24} color="#fff" />
          </TouchableOpacity>
        ) : null}

        <WalletCard colors={[colors.secondary, '#334155']} start={{x:0, y:0}} end={{x:1, y:1}}>
          <WalletBalance>
            <WalletLabel>Crédito Uberzap</WalletLabel>
            <BalanceValue>R$ {balance}</BalanceValue>
          </WalletBalance>
          <WalletActions>
            <AddFundsBtn onPress={() => navigation.navigate('WalletScreen')}>
              <Icon name="add" size={20} color={colors.primary} />
              <Text style={{ color: '#fff', marginLeft: 8, fontWeight: 'bold' }}>RECARREGAR</Text>
            </AddFundsBtn>
          </WalletActions>
        </WalletCard>

        <SearchAction activeOpacity={0.8} onPress={() => navigation.navigate('PassengerHome')}>
           <Icon name="search" size={28} color={colors.primary} />
           <SearchText>Para onde vamos hoje?</SearchText>
        </SearchAction>

        <CategoryGrid>
          <CategoryItem style={{ width: '100%', height: 85 }} onPress={() => navigation.navigate('PassengerHome', { type: 'ride' })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <IconCircle>
                 <Icon name="directions-car" size={32} color="#fff" />
              </IconCircle>
              <View style={{ marginLeft: 15, flex: 1 }}>
                 <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 }}>Fazer uma viagem</Text>
                 <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 }}>Solicite um motorista agora</Text>
              </View>
              <Icon name="chevron-right" size={30} color="#fff" style={{ opacity: 0.9 }} />
            </View>
          </CategoryItem>
        </CategoryGrid>

        <SectionHeader>
          <SectionTitle>Ofertas para você</SectionTitle>
        </SectionHeader>
        
        <BannerContainer>
          <ScrollView 
            ref={bannerScrollRef}
            horizontal 
            showsHorizontalScrollIndicator={false} 
            pagingEnabled
            onMomentumScrollEnd={(e) => {
               const index = Math.round(e.nativeEvent.contentOffset.x / width);
               setCurrentBannerIndex(index);
            }}
          >
            {banners && banners.length > 0 ? banners.map(banner => {
              // Constrói a URL da imagem. Se já for uma URL completa (como no Mock), usa ela.
              // Caso contrário, anexa o caminho de uploads do servidor.
              const imageUrl = (banner?.img && banner.img.startsWith('http'))
                ? banner.img 
                : `https://geral-uberzap-api.r954jc.easypanel.host/_/admin/uploads/${banner?.img || ''}`;
                
              return (
                <TouchableOpacity key={banner?.id || Math.random()} activeOpacity={0.9} onPress={() => {
                  if (banner?.link) Linking.openURL(banner.link);
                }}>
                  <BannerImage source={{ uri: imageUrl }} />
                </TouchableOpacity>
              );
            }) : (
              <View style={{ width: width - 40, marginHorizontal: 20, height: 140, backgroundColor: '#fff', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e0' }}>
                 {loading ? (
                   <ActivityIndicator color={colors.primary} />
                 ) : (
                   <>
                     <Icon name="local-offer" size={32} color="#cbd5e0" />
                     <Text style={{ color: '#94a3b8', marginTop: 10, fontWeight: '500' }}>Sem ofertas no momento</Text>
                   </>
                 )}
              </View>
            )}
          </ScrollView>
        </BannerContainer>

        <SectionHeader>
          <SectionTitle>Viagens Recentes</SectionTitle>
          <TouchableOpacity onPress={() => navigation.navigate('HistoryScreen')}><Text style={{ color: colors.primary }}>Ver histórico</Text></TouchableOpacity>
        </SectionHeader>

        {recentRides.length > 0 ? recentRides.map((ride, index) => (
          <RecentRideCard key={ride.id || index} onPress={() => navigation.navigate('HistoryScreen', { selectedRide: ride })}>
             <RideMapPreview pointerEvents="none">
                 {Platform.OS !== 'web' ? (
                    <MapView
                      liteMode={true}
                      style={{ flex: 1 }}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      rotateEnabled={false}
                      initialRegion={{
                        latitude: ride.lat_ini || -23.5617,
                        longitude: ride.lng_ini || -46.6623,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                      }}
                    >
                      {ride.lat_ini && (
                         <>
                            <Marker coordinate={{ latitude: ride.lat_ini, longitude: ride.lng_ini }} pinColor="green" />
                            <Marker coordinate={{ latitude: ride.lat_fim, longitude: ride.lng_fim }} />
                            <Polyline 
                              coordinates={[
                                { latitude: ride.lat_ini, longitude: ride.lng_ini },
                                { latitude: ride.lat_fim, longitude: ride.lng_fim }
                              ]}
                              strokeWidth={3}
                              strokeColor={colors.primary}
                            />
                         </>
                      )}
                    </MapView>
                 ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                       <Icon name="map" size={40} color="#cbd5e0" />
                    </View>
                 )}
             </RideMapPreview>
             <RideDetails>
                 <RideInfoRow>
                    <RideDateText>{ride.date}</RideDateText>
                    <RidePriceText>R$ {ride.valor}</RidePriceText>
                 </RideInfoRow>
                 <RidePath>
                    <PathPoint numberOfLines={1}><Text style={{ fontWeight: 'bold' }}>• </Text>{ride.endereco_ini}</PathPoint>
                    <PathPoint numberOfLines={1}><Text style={{ fontWeight: 'bold', color: '#f44' }}>• </Text>{ride.endereco_fim}</PathPoint>
                 </RidePath>
             </RideDetails>
          </RecentRideCard>
        )) : (
          <View style={{ padding: 20, alignItems: 'center' }}>
             <Text style={{ color: '#94a3b8' }}>Sem viagens recentes</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </Content>
    </Container>
  );
};

export default PrincipalScreen;
