import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Platform, ImageBackground, Animated, PanResponder, Image, StyleSheet, LayoutAnimation, UIManager, Dimensions, AppState } from 'react-native';
import * as Location from 'expo-location';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import SmartImage from '../../components/SmartImage';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getSession, clearSession } from '../../utils/session';
import { triggerLocalNotification, TRIP_STATUS_CHANNEL_ID, ensureNotificationPermissions } from '../../utils/notifications';
import { ensureOverlayPermission, wakeScreenForRideAlert } from '../../utils/androidOverlay';
import {
  reverseGeocodeLocation,
  searchAddressesNearUser,
  resolvePickupAddressForRide,
  isPickupPlaceholder,
  formatCoordsFallback,
  DEFAULT_SEARCH_RADIUS_METERS,
} from '../../utils/geocoding';
import passengerRideMonitor from '../../services/passengerRideMonitor';
import { startRideForegroundService, stopRideForegroundService } from '../../services/rideForegroundService';
import { getFreshPassengerLocation, safeRemoveLocationSubscription } from '../../utils/locationSubscription';
import { playStatusSoundOnce, stopStatusSound } from '../../utils/statusSound';
import {
  extractPendingRating,
  isRatingSkipped,
  markRatingSkipped,
  clearRatingSkipped,
} from '../../utils/ratingPrompt';

const parseMoneyToApi = (val) => {
  if (val == null || val === '') return '';
  const s = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n.toFixed(2) : String(val).replace(',', '.');
};

const coordsChanged = (a, b, epsilon = 0.00015) => {
  if (!a || !b) return true;
  return (
    Math.abs(a.latitude - b.latitude) > epsilon ||
    Math.abs(a.longitude - b.longitude) > epsilon
  );
};

const { width } = Dimensions.get('window');

/** Centro padrão (SP) — usado se GPS falhar ou permissão for negada */
const DEFAULT_PICKUP_COORDS = { latitude: -23.5617, longitude: -46.6623 };

// Função de segurança robusta para evitar rotas SP-MT por tolerância de floats do GPS
const isSameAsDefault = (coords, def) => {
  if (!coords || !def) return false;
  return Math.abs(coords.latitude - def.latitude) < 0.001 &&
         Math.abs(coords.longitude - def.longitude) < 0.001;
};

/** Nominatim exige User-Agent identificável (política de uso). */
const NOMINATIM_USER_AGENT = 'UbeZapPassenger/1.0 (contato: suporte@ubezap.com)';

/** Nominatim: resposta pode ser array ou `{ error: ... }` (ex. viewbox inválido). */
const parseNominatimJson = text => {
  try {
    const json = JSON.parse(text);
    if (json && json.error) return [];
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
};

async function nominatimSearchQuery(q, pickupCoords, { useViewbox, bounded }) {
  let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    q
  )}&limit=10&countrycodes=br&addressdetails=1`;
  if (
    useViewbox &&
    pickupCoords?.latitude != null &&
    pickupCoords?.longitude != null
  ) {
    const d = 0.5;
    const minLon = pickupCoords.longitude - d;
    const minLat = pickupCoords.latitude - d;
    const maxLon = pickupCoords.longitude + d;
    const maxLat = pickupCoords.latitude + d;
    if (
      [minLon, minLat, maxLon, maxLat].every(Number.isFinite) &&
      minLon < maxLon &&
      minLat < maxLat
    ) {
      url += `&viewbox=${minLon},${minLat},${maxLon},${maxLat}&bounded=${bounded ? 1 : 0}`;
    }
  }
  const res = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  return parseNominatimJson(text);
}

// Fallback para MapView no Web
let MapView = View;
let Marker = View;
let Polyline = View;
let PROVIDER_GOOGLE = null;

try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  Marker = Maps.Marker || View;
  Polyline = Maps.Polyline || View;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
} catch (e) {
  console.warn("Maps not available, using fallback");
}

const Container = styled.View`
  flex: 1;
  background-color: ${colors.background};
`;

const DestinationOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${colors.background};
  z-index: 1000;
  padding-top: ${Platform.OS === 'ios' ? 60 : 40}px;
`;

const Overlay = styled.TouchableOpacity`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0,0,0,0.5);
  z-index: 10000;
`;

const SearchHeaderScroll = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
`;

const SearchInput = styled.TextInput`
  flex: 1;
  height: 50px;
  background-color: #1B2740;
  color: ${colors.text};
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.md}px;
  margin-left: ${spacing.md}px;
  font-size: 16px;
`;

const SearchResultList = styled.ScrollView`
  flex: 1;
`;

const SearchResultItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding: ${spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: #243049;
`;

const ResultIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: #1B2740;
  justify-content: center;
  align-items: center;
  margin-right: ${spacing.md}px;
`;

const ResultTextContainer = styled.View`
  flex: 1;
`;

const SearchPlaceholder = styled.Text`
  color: #94A3B8;
  font-size: 18px;
  font-weight: 500;
  margin-left: 12px;
`;

const FavoritesRow = styled.View`
  flex-direction: row;
  justify-content: space-around;
  padding: 10px;
  margin-top: 10px;
`;

const FavoriteItem = styled.TouchableOpacity`
  align-items: center;
  width: 25%;
`;

const FavoriteIcon = styled.View`
  width: 50px;
  height: 50px;
  border-radius: 25px;
  background-color: ${props => props.bg || '#1B2740'};
  justify-content: center;
  align-items: center;
  margin-bottom: 5px;
`;

const CategorySection = styled.View`
  padding-vertical: 10px;
`;

const ResultTitle = styled.Text`
  font-size: 16px;
  font-weight: 500;
  color: ${colors.text};
`;

const ResultSubtitle = styled.Text`
  font-size: 14px;
  color: ${colors.textSecondary};
`;

const HeaderContainer = styled.SafeAreaView`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background-color: transparent;
  z-index: 100;
`;

const TopBar = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-horizontal: ${spacing.md}px;
  margin-top: ${Platform.OS === 'android' ? 40 : 10}px;
`;

const IconButton = styled.TouchableOpacity`
  width: 45px;
  height: 45px;
  border-radius: ${borderRadius.full}px;
  background-color: ${colors.surface};
  justify-content: center;
  align-items: center;
  elevation: 8;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.2;
  shadow-radius: 5px;
`;

const SelectionHeader = styled.TouchableOpacity`
  background-color: ${colors.surface};
  margin-horizontal: ${spacing.md}px;
  margin-top: ${spacing.sm}px;
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.md}px;
  elevation: 10;
  shadow-color: #000;
  shadow-offset: 0px 5px;
  shadow-opacity: 0.1;
  shadow-radius: 8px;
`;

const MapLabel = styled.TouchableOpacity`
  background-color: ${colors.surface};
  padding: 8px 12px;
  border-radius: 12px;
  elevation: 8;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 5px;
  border-width: 1px;
  border-color: #243049;
  flex-direction: row;
  align-items: center;
`;

const LabelText = styled.Text`
  font-size: 11px;
  font-weight: bold;
  color: ${colors.text};
`;

const AddressLabelText = styled.Text`
  font-size: 10px;
  color: ${colors.textSecondary};
  margin-top: 2px;
`;

const SearchRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const DotContainer = styled.View`
  align-items: center;
  margin-right: ${spacing.sm}px;
`;

const Dot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background-color: ${props => props.color || colors.primary};
`;

const Line = styled.View`
  width: 1px;
  height: 20px;
  background-color: #243049;
  margin-vertical: 2px;
`;

const SearchInputRow = styled.View`
  flex: 1;
`;

const AddressText = styled.Text`
  font-size: 14px;
  color: ${props => props.placeholder ? colors.textSecondary : colors.text};
  font-weight: ${props => props.placeholder ? '400' : '500'};
`;

const Divider = styled.View`
  height: 1px;
  background-color: #243049;
  margin-vertical: 6px;
`;

const CategoryItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding-vertical: ${spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: #243049;
  background-color: ${props => props.selected ? '#1B2740' : 'transparent'};
`;

const CategoryInfo = styled.View`
  flex: 1;
  margin-horizontal: ${spacing.sm}px;
`;

const CategoryName = styled.Text`
  font-size: 16px;
  font-weight: bold;
`;

const CategoryPrice = styled.Text`
  font-size: 17px;
  font-weight: 800;
  color: ${colors.text};
`;

const TimeLineContainer = styled.View`
  margin-vertical: 15px;
  padding-horizontal: 10px;
`;

const TimeLineStep = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: 2px;
`;

const StepDot = styled.View`
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background-color: ${props => props.active ? colors.primary : '#243049'};
  border-width: 2px;
  border-color: ${props => props.active ? colors.primary : '#243049'};
  z-index: 2;
`;

const StepLine = styled.View`
  width: 2px;
  height: 25px;
  background-color: ${props => props.active ? colors.primary : '#243049'};
  margin-left: 5px;
  margin-top: -2px;
  margin-bottom: -2px;
`;

const StepText = styled.Text`
  margin-left: 15px;
  font-size: 14px;
  font-weight: ${props => props.active ? 'bold' : 'normal'};
  color: ${props => props.active ? colors.text : '#94a3b8'};
`;

const BottomSheet = styled.View`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${props => props.isDark ? colors.secondary : colors.surface};
  border-top-left-radius: 25px;
  border-top-right-radius: 25px;
  padding-top: ${spacing.sm}px;
  padding-bottom: ${Platform.OS === 'ios' ? 40 : 20}px;
  elevation: 30;
  shadow-color: #000;
  shadow-offset: 0px -10px;
  shadow-opacity: 0.1;
  shadow-radius: 15px;
  z-index: 50;
`;

const AnimatedBottomSheet = Animated.createAnimatedComponent(BottomSheet);

const Handle = styled.View`
  width: 40px;
  height: 5px;
  background-color: ${props => props.isDark ? '#333' : '#243049'};
  border-radius: 3px;
  align-self: center;
  margin-vertical: ${spacing.sm}px;
`;

const ContentPadding = styled.View`
  padding-horizontal: ${spacing.lg}px;
`;

const Greeting = styled.Text`
  font-size: 20px;
  font-weight: bold;
  color: ${colors.text};
  margin-bottom: 4px;
`;

const MainSearchButton = styled.TouchableOpacity`
  background-color: ${colors.background};
  border-radius: ${borderRadius.lg}px;
  height: 55px;
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${spacing.md}px;
  margin-top: ${spacing.md}px;
  border-width: 1px;
  border-color: ${colors.border};
`;

const ConfirmButton = styled.TouchableOpacity`
  background-color: ${colors.primary};
  height: 55px;
  border-radius: 30px;
  justify-content: center;
  align-items: center;
  margin-top: ${spacing.sm}px;
  elevation: 5;
  shadow-color: ${colors.primary};
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 5px;
`;

const PulseCircle = styled(Animated.View)`
  position: absolute;
  width: 120px;
  height: 120px;
  border-radius: 60px;
  background-color: ${colors.primary};
`;

const decodePolyline = (t, e) => {
    for (var n, o, u = 0, l = 0, r = 0, d = [], h = 0, i = 0, a = null, c = Math.pow(10, e || 5); u < t.length; ) {
        a = null, h = 0, i = 0;
        do a = t.charCodeAt(u++) - 63, i |= (31 & a) << h, h += 5; while (a >= 32);
        n = 1 & i ? ~(i >> 1) : i >> 1, h = i = 0;
        do a = t.charCodeAt(u++) - 63, i |= (31 & a) << h, h += 5; while (a >= 32);
        o = 1 & i ? ~(i >> 1) : i >> 1, l += n, r += o, d.push({ latitude: l / c, longitude: r / c });
    }
    return d;
};

const HomeScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [lastDriversFetch, setLastDriversFetch] = useState(0);
  const [isChoosingDestination, setIsChoosingDestination] = useState(false);
  /** Painel inferior de escolha de categoria / confirmação de corrida */
  const [isSelecting, setIsSelecting] = useState(false);
  const [isSelectingPayment, setIsSelectingPayment] = useState(false);
  const [isSearchingDriver, setIsSearchingDriver] = useState(false);
  const [driverDetails, setDriverDetails] = useState(null);
  const driverDetailsRef = useRef(null);
  const [carouselW, setCarouselW] = useState(0); // largura medida do carrossel de fotos do carro
  const [carIndex, setCarIndex] = useState(0);   // foto atual do carrossel (bolinhas)

  const updateDriverDetails = (value) => {
    if (typeof value === 'function') {
      setDriverDetails((prev) => {
        const next = value(prev);
        driverDetailsRef.current = next;
        return next;
      });
    } else {
      setDriverDetails(value);
      driverDetailsRef.current = value;
    }
  };

  // Ao atribuir um motorista, busca o perfil completo pra trazer as FOTOS DO CARRO
  // (o status_chamado não traz img_frente/img_lateral).
  useEffect(() => {
    const id = driverDetails?.id;
    if (!id || driverDetails?.img_frente) return;
    let active = true;
    (async () => {
      try {
        const res = await api.driver.getDriverProfile(id);
        const p = res?.data;
        if (active && p && typeof p === 'object') {
          updateDriverDetails((prev) => (prev && prev.id === id ? {
            ...prev,
            img_frente: p.img_frente || prev.img_frente,
            img_lateral: p.img_lateral || prev.img_lateral,
            img: p.img || prev.img,
            foto: prev.foto || p.img,
            veiculo: prev.veiculo || p.veiculo,
            placa: prev.placa || p.placa,
          } : prev));
        }
      } catch (e) {}
    })();
    return () => { active = false; };
  }, [driverDetails?.id]);

  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [discountedPrice, setDiscountedPrice] = useState(null);

  const [showRating, setShowRating] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [finalPrice, setFinalPrice] = useState('0,00');
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const mapRef = useRef(null);
  const didCenterMapRef = useRef(false); // centra/zooma só na 1ª localização (não briga com o zoom/pan)

  // Bottom sheet arrastável: arrasta a alça pra BAIXO recolhe (vê o mapa), pra CIMA expande
  const SHEET_PEEK = 60; // quanto fica visível (alça) quando recolhido
  const sheetHeightRef = useRef(0);
  const sheetTranslate = useRef(new Animated.Value(0)).current; // 0 = expandido, + = recolhido (desce)
  const sheetCollapsedRef = useRef(false);
  const sheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        const h = sheetHeightRef.current || 320;
        const max = Math.max(0, h - SHEET_PEEK);
        const base = sheetCollapsedRef.current ? max : 0;
        let next = base + g.dy; // dy>0 (pra baixo) recolhe
        if (next < 0) next = 0;
        if (next > max) next = max;
        sheetTranslate.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const h = sheetHeightRef.current || 320;
        const max = Math.max(0, h - SHEET_PEEK);
        let collapse;
        if (g.dy > 40 || g.vy > 0.5) collapse = true;       // pra baixo -> recolhe
        else if (g.dy < -40 || g.vy < -0.5) collapse = false; // pra cima -> expande
        else collapse = sheetCollapsedRef.current;
        sheetCollapsedRef.current = collapse;
        Animated.spring(sheetTranslate, { toValue: collapse ? max : 0, useNativeDriver: false, bounciness: 2, speed: 16 }).start();
      },
    })
  ).current;
  const [banners, setBanners] = useState([]);
  const [cityData, setCityData] = useState(null);
  const [currentLocationLabel, setCurrentLocationLabel] = useState('');
  const [user, setUser] = useState({ id: 0, nome: 'Passageiro', cidade_id: 1 });
  const overlayAskedRef = useRef(false);
  const notificationsAskedRef = useRef(false);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const carouselAnim = useRef(new Animated.Value(0)).current;
  const sensorAnim = useRef(new Animated.Value(1)).current; // Sensor de pulso para carros próximos

  const playStatusSound = () => {
    playStatusSoundOnce();
  };

  const notifyStatusChange = (title, body) => {
    if (AppState.currentState === 'active') {
      playStatusSound();
    } else {
      wakeScreenForRideAlert().catch(() => {});
    }
    triggerLocalNotification(title, body, { type: 'trip_status' }, TRIP_STATUS_CHANNEL_ID);
  };

  const ensurePassengerAlertPermissions = useCallback(async () => {
    if (!notificationsAskedRef.current) {
      notificationsAskedRef.current = true;
      await ensureNotificationPermissions().catch(() => {});
    }
    if (Platform.OS === 'android') {
      const { status: fg } = await Location.requestForegroundPermissionsAsync();
      if (fg === 'granted') {
        await Location.requestBackgroundPermissionsAsync().catch(() => {});
      }
    }
    if (!overlayAskedRef.current) {
      overlayAskedRef.current = true;
      await ensureOverlayPermission({ variant: 'passenger' }).catch(() => {});
    }
  }, []);
  const searchPulseLoopRef = useRef(null);
  const searchCarouselLoopRef = useRef(null);
  const sensorLoopRef = useRef(null);

  // Motoristas próximos só na tela inicial (não durante busca/corrida — evita travamento)
  useEffect(() => {
    let interval;
    let firstTimer;
    // Mantém os carrinhos visíveis também durante a seleção/busca da corrida.
    // Só para de mostrar quando um motorista é atribuído (driverDetails).
    const canShowNearby =
      user?.telefone &&
      !driverDetails;

    if (canShowNearby) {
      const fetchDrivers = async () => {
        try {
          // Endpoint leve por cidade (mesmo do motorista). Passageiro vê só os disponíveis (online).
          const response = await api.passenger.getNearbyByCity(user.cidade_id || 1);
          if (response.data && Array.isArray(response.data)) {
            setNearbyDrivers(response.data.filter(d => Number(d.online) !== 0));
          }
        } catch (error) {
          console.warn('Erro ao carregar motoristas próximos:', error);
        }
      };

      // Atrasa a 1ª busca pra não competir com o carregamento crítico do mapa (evita congestionar a rede)
      firstTimer = setTimeout(fetchDrivers, 2500);
      interval = setInterval(fetchDrivers, 15000);
    } else {
      setNearbyDrivers([]);
    }
    return () => { if (firstTimer) clearTimeout(firstTimer); if (interval) clearInterval(interval); };
    // Deps enxutas: o effect só re-roda ao mudar credenciais ou ao entrar/sair de corrida.
    // (re-rodar em isSelecting/isChoosingDestination disparava um fetch a cada toque -> flood)
  }, [user.telefone, user.senha, user.cidade_id, driverDetails]);

  useEffect(() => {
    rideActiveRef.current = isSearchingDriver || Boolean(driverDetails);
  }, [isSearchingDriver, driverDetails]);

  useEffect(() => {
    if (initialDataLoadedRef.current) return;
    initialDataLoadedRef.current = true;

    const fetchData = async () => {
      try {
        const session = await getSession();
        if (!session) return;

        const profileRes = await api.passenger.getProfile(session.telefone, session.senha);
        if (profileRes.data && profileRes.data.status === 'sucesso') {
          const userData = {
            ...profileRes.data,
            nome: profileRes.data.nome || 'Passageiro',
            cidade_id: profileRes.data.cidade_id || 1
          };
          setUser(userData);

          const cityRes = await api.passenger.getCityData(userData.cidade_id);
          setCityData(cityRes.data);

          const bannersRes = await api.passenger.getBanners(userData.cidade_id);
          if (Array.isArray(bannersRes.data)) {
            setBanners(bannersRes.data);
          }
        }
      } catch (error) {
        console.log('Erro ao carregar dados iniciais:', error);
      }
    };

    fetchData();
    ensurePassengerAlertPermissions();
  }, [ensurePassengerAlertPermissions]);

  // Permissões só na montagem — useFocusEffect removido para não repetir overlay

  useEffect(() => {
    if (isSearchingDriver) {
      searchPulseLoopRef.current?.stop();
      searchCarouselLoopRef.current?.stop();

      searchPulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          })
        ])
      );
      searchPulseLoopRef.current.start();

      searchCarouselLoopRef.current = Animated.loop(
        Animated.timing(carouselAnim, {
          toValue: 2,
          duration: 4000,
          useNativeDriver: true,
        })
      );
      searchCarouselLoopRef.current.start();
    } else {
      searchPulseLoopRef.current?.stop();
      searchCarouselLoopRef.current?.stop();
      pulseAnim.stopAnimation();
      carouselAnim.stopAnimation();
    }

    return () => {
      searchPulseLoopRef.current?.stop();
      searchCarouselLoopRef.current?.stop();
    };
  }, [isSearchingDriver]);

  useEffect(() => {
    sensorLoopRef.current?.stop();
    if (isSearchingDriver) {
      return () => sensorLoopRef.current?.stop();
    }

    sensorLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(sensorAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(sensorAnim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.delay(1200),
      ])
    );
    sensorLoopRef.current.start();

    return () => {
      sensorLoopRef.current?.stop();
    };
  }, [isSearchingDriver]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1.5]
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 0]
  });

  const carTranslateX = carouselAnim.interpolate({
    inputRange: [0, 0.35, 0.65, 1.0, 1.001, 1.35, 1.65, 2],
    outputRange: [0, 0, -50, -50, 50, 50, 0, 0]
  });

  const carOpacity = carouselAnim.interpolate({
    inputRange: [0, 0.35, 0.65, 1.0, 1.001, 1.35, 1.65, 2],
    outputRange: [1, 1, 0, 0, 0, 0, 1, 1]
  });

  const motoTranslateX = carouselAnim.interpolate({
    inputRange: [0, 0.35, 0.65, 1.35, 1.65, 2],
    outputRange: [50, 50, 0, 0, -50, -50]
  });

  const motoOpacity = carouselAnim.interpolate({
    inputRange: [0, 0.35, 0.65, 1.35, 1.65, 2],
    outputRange: [0, 0, 1, 1, 0, 0]
  });

  const [categories, setCategories] = useState([]);
  /** URLs de ícone de categoria que falharam (ex.: arquivo ausente no servidor) → mostra ícone Material */
  const [categoryImageFailed, setCategoryImageFailed] = useState({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(-width * 0.8)).current;

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
  const [selectedCat, setSelectedCat] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState({ id: 'money_pix', label: 'Dinheiro ou Pix', icon: 'payments' });
  
  const [pickup, setPickup] = useState('Obtendo localização...');
  const [destination, setDestination] = useState('');
  const [isNoDestination, setIsNoDestination] = useState(false);
  
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [rideDetails, setRideDetails] = useState({ distance: 0, time: 0, arrivalTime: 0 });
  const [routePoints, setRoutePoints] = useState([]);
  const [stop, setStop] = useState('');
  const [stopCoords, setStopCoords] = useState(null);
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [activeSearchInput, setActiveSearchInput] = useState('destination'); // 'destination' or 'stop'

  /** Busca de destino (equivalente ao Google Places Autocomplete do web monólito) */
  const [destSearchText, setDestSearchText] = useState('');
  const [destSearchResults, setDestSearchResults] = useState([]);
  const [destSearchLoading, setDestSearchLoading] = useState(false);
  const destSearchDebounceRef = useRef(null);



  const paymentOptions = [
    { id: 'money_pix', label: 'Dinheiro ou Pix', icon: 'payments' },
    { id: 'wallet', label: 'Carteira Crédito', icon: 'account-balance-wallet' },
    { id: 'card_machine', label: 'Cartão Máquina', icon: 'credit-card' }
  ];

  const [rideId, setRideId] = useState(null);
  const [recentLocations, setRecentLocations] = useState([]);
  const rideIdRef = useRef(null);
  const pickupCoordsRef = useRef(null);
  const pickupRef = useRef('Obtendo localização...');
  const destCoordsRef = useRef(null);
  const rideFinishedHandledRef = useRef(false);
  const ratingSubmittingRef = useRef(false);
  /** Evita reabrir corrida após cancelamento local enquanto API confirma (ou falha) */
  const userCancelledLocallyRef = useRef(false);
  const cancelGuardTimerRef = useRef(null);
  const rideActiveRef = useRef(false);
  const initialDataLoadedRef = useRef(false);

  useEffect(() => {
    pickupCoordsRef.current = pickupCoords;
  }, [pickupCoords]);

  useEffect(() => {
    pickupRef.current = pickup;
  }, [pickup]);

  useEffect(() => {
    destCoordsRef.current = destCoords;
  }, [destCoords]);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const session = await getSession();
        if (!session) return;
        const res = await api.passenger.getHistory(session.telefone, session.senha);
        if (res.data && Array.isArray(res.data)) {
          const completedRides = res.data.filter(h => 
            (h.status === 'Finalizada' || h.status === '4') && h.endereco_fim
          );
          
          // Mapeia o histórico para o formato de localização do HomeScreen (exibe até 4 últimas)
          const mapped = completedRides.slice(0, 4).map(h => ({
            title: h.endereco_fim,
            subtitle: h.date || '',
            coords: {
              latitude: parseFloat(h.lat_fim) || -23.5617,
              longitude: parseFloat(h.lng_fim) || -46.6623
            }
          }));
          setRecentLocations(mapped);
        }
      } catch (e) {
        console.error('Erro ao buscar recentes:', e);
      }
    };
    // "Destinos recentes" não é crítico — adia pra não competir com o load inicial do mapa
    // (evita estourar o limite de conexões e dar timeout no get_historico, que é pesado).
    const t = setTimeout(fetchRecent, 3500);
    return () => clearTimeout(t);
  }, []);

  /** GPS + endereço de embarque + label de localização atual no header */
  useEffect(() => {
    let cancelled = false;
    let locationWatcher = null;
    let geocodeRetryTimer = null;

    const resolveAddressForCoords = async (coords, attempt = 0) => {
      const { label, displayName } = await reverseGeocodeLocation(
        coords.latitude,
        coords.longitude,
        { timeoutMs: attempt === 0 ? 10000 : 15000 }
      );
      if (cancelled) return;

      const coordsLabel = formatCoordsFallback(coords.latitude, coords.longitude);
      const resolvedLabel = label || (displayName ? displayName.split(',')[0].trim() : '') || coordsLabel;
      const resolvedPickup = displayName || label || (coordsLabel ? `Embarque (${coordsLabel})` : 'Obtendo localização...');

      setCurrentLocationLabel(resolvedLabel);
      setPickup(resolvedPickup);

      if (isPickupPlaceholder(resolvedPickup) && attempt < 2) {
        geocodeRetryTimer = setTimeout(() => {
          resolveAddressForCoords(coords, attempt + 1);
        }, 2500 * (attempt + 1));
      }
    };

    const applyCoords = async (coords, { updatePickupAddress = true } = {}) => {
      if (cancelled) return;
      if (!coordsChanged(pickupCoordsRef.current, coords)) return;

      setPickupCoords(coords);

      if (!updatePickupAddress) {
        return;
      }

      const skipPickupOverwrite =
        rideActiveRef.current ||
        (!isPickupPlaceholder(pickupRef.current));

      if (skipPickupOverwrite) {
        if (mapRef.current && !didCenterMapRef.current) {
          didCenterMapRef.current = true;
          mapRef.current.animateToRegion({
            ...coords,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 1000);
        }
        return;
      }

      if (mapRef.current && !didCenterMapRef.current) {
        didCenterMapRef.current = true;
        mapRef.current.animateToRegion({
          ...coords,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 1000);
      }

      if (geocodeRetryTimer) {
        clearTimeout(geocodeRetryTimer);
        geocodeRetryTimer = null;
      }

      setPickup('Carregando endereço...');
      setCurrentLocationLabel('...');

      try {
        await resolveAddressForCoords(coords);
      } catch (e) {
        console.warn('Geocode embarque:', e);
        if (!cancelled) {
          const coordsLabel = formatCoordsFallback(coords.latitude, coords.longitude);
          setCurrentLocationLabel(coordsLabel || 'GPS ativo');
          setPickup(coordsLabel ? `Embarque (${coordsLabel})` : 'Obtendo localização...');
        }
      }
    };

    (async () => {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (!cancelled) {
            setPickupCoords(DEFAULT_PICKUP_COORDS);
            setPickup('Ative o GPS do aparelho para localização precisa.');
            setCurrentLocationLabel('');
          }
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setPickupCoords(DEFAULT_PICKUP_COORDS);
            setPickup('Ative a localização para um embarque mais preciso.');
            setCurrentLocationLabel('');
          }
          return;
        }

        const pos = await getFreshPassengerLocation();
        if (cancelled) return;

        await applyCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });

        locationWatcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 40,
            timeInterval: 20000,
          },
          (update) => {
            if (rideActiveRef.current) return;
            applyCoords(
              {
                latitude: update.coords.latitude,
                longitude: update.coords.longitude,
              },
              { updatePickupAddress: isPickupPlaceholder(pickupRef.current) }
            );
          }
        );
      } catch (e) {
        console.warn('GPS passageiro:', e);
        if (!cancelled) {
          setPickupCoords(DEFAULT_PICKUP_COORDS);
          setPickup('Não foi possível obter o GPS. Usando região padrão.');
          setCurrentLocationLabel('');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (geocodeRetryTimer) clearTimeout(geocodeRetryTimer);
      safeRemoveLocationSubscription(locationWatcher);
    };
  }, []);

  /** Autocomplete de endereço — Google Places (bias local) + fallback Mapbox/Nominatim */
  useEffect(() => {
    if (!isChoosingDestination) return;
    if (destSearchDebounceRef.current) {
      clearTimeout(destSearchDebounceRef.current);
    }
    const q = destSearchText.trim();
    if (q.length < 3) {
      setDestSearchResults([]);
      setDestSearchLoading(false);
      return;
    }
    destSearchDebounceRef.current = setTimeout(async () => {
      setDestSearchLoading(true);
      try {
        let list = await searchAddressesNearUser(
          q,
          pickupCoords?.latitude,
          pickupCoords?.longitude,
          (query, lat, lng, radius) => api.passenger.searchAddresses(query, lat, lng, radius),
          DEFAULT_SEARCH_RADIUS_METERS
        );

        if (list.length === 0) {
          list = await nominatimSearchQuery(q, pickupCoords, { useViewbox: false, bounded: false });
        }
        if (list.length === 0 && pickupCoords) {
          list = await nominatimSearchQuery(q, pickupCoords, { useViewbox: true, bounded: false });
        }
        if (list.length === 0 && pickupCoords) {
          list = await nominatimSearchQuery(q, pickupCoords, { useViewbox: true, bounded: true });
        }
        setDestSearchResults(list);
      } catch (e) {
        console.warn('Busca endereço:', e);
        setDestSearchResults([]);
      } finally {
        setDestSearchLoading(false);
      }
    }, 450);
    return () => {
      if (destSearchDebounceRef.current) clearTimeout(destSearchDebounceRef.current);
    };
  }, [destSearchText, isChoosingDestination, pickupCoords]);

  const fitMapToRide = useCallback((motoristaCoords) => {
    if (!mapRef.current) return;
    const points = [];
    const pickup = pickupCoordsRef.current;
    if (pickup) points.push(pickup);
    if (motoristaCoords?.latitude != null && motoristaCoords?.longitude != null) {
      points.push({
        latitude: parseFloat(motoristaCoords.latitude),
        longitude: parseFloat(motoristaCoords.longitude),
      });
    }
    const dest = destCoordsRef.current;
    if (dest) points.push(dest);
    if (points.length === 0) return;
    mapRef.current.fitToCoordinates(points, {
      edgePadding: { top: 120, right: 50, bottom: 420, left: 50 },
      animated: true,
    });
  }, []);

  const buildDriverDetails = useCallback((motorista, status) => {
    const pickup = pickupCoordsRef.current;
    return {
      id: motorista.id,
      nome: motorista.nome,
      veiculo: motorista.veiculo,
      placa: motorista.placa,
      foto: motorista.foto,
      rating: motorista.rating,
      coords: {
        latitude: parseFloat(motorista.latitude) || pickup?.latitude || -23.55,
        longitude: parseFloat(motorista.longitude) || pickup?.longitude || -46.63,
      },
      tempo: motorista.tempo_chegada || 'Calculando...',
      status,
    };
  }, []);

  const clearLocalCancelGuardRef = useRef(() => {});

  const applyRideStatusUpdate = useCallback((rawStatus, motorista, taxa, rideData = {}, { notify = true } = {}) => {
    const status = Number(rawStatus);
    if (!Number.isFinite(status)) return;

    // Finalização/cancelamento pelo motorista sempre entra — mesmo após saída otimista da tela
    if (status === 4 || status === 5) {
      userCancelledLocallyRef.current = false;
      clearLocalCancelGuardRef.current();
      rideFinishedHandledRef.current = false;
    } else if (userCancelledLocallyRef.current) {
      return;
    }

    if (rideData?.lat_ini != null && rideData?.lng_ini != null) {
      const latIni = parseFloat(String(rideData.lat_ini).replace(',', '.'));
      const lngIni = parseFloat(String(rideData.lng_ini).replace(',', '.'));
      if (!isNaN(latIni) && !isNaN(lngIni)) {
        const nextPickup = { latitude: latIni, longitude: lngIni };
        if (coordsChanged(pickupCoordsRef.current, nextPickup)) {
          setPickupCoords(nextPickup);
        }
      }
    }
    if (rideData?.lat_fim != null && rideData?.lng_fim != null) {
      const latFim = parseFloat(String(rideData.lat_fim).replace(',', '.'));
      const lngFim = parseFloat(String(rideData.lng_fim).replace(',', '.'));
      if (!isNaN(latFim) && !isNaN(lngFim)) {
        const nextDest = { latitude: latFim, longitude: lngFim };
        if (coordsChanged(destCoordsRef.current, nextDest)) {
          setDestCoords(nextDest);
        }
      }
    }

    const prevStatus = driverDetailsRef.current != null
      ? Number(driverDetailsRef.current.status)
      : null;

    if (status === 0) {
      setIsSelecting(false);
      setIsSearchingDriver(true);
      return;
    }

    if (status >= 1 && status <= 3) {
      setIsSelecting(false);
      setIsSearchingDriver(false);

      if (motorista) {
        const next = buildDriverDetails(motorista, status);
        if (status === 2) next.tempo = 'Aguardando passageiro no local';
        if (status === 3) next.tempo = 'Em viagem ao destino';

        updateDriverDetails((prev) => {
          if (!prev || prevStatus !== status) return next;
          if (!coordsChanged(prev.coords, next.coords)) return prev;
          return { ...prev, ...next, status };
        });

        if (prevStatus !== status || !driverDetailsRef.current) {
          fitMapToRide(next.coords);
        }

        if (notify && prevStatus !== status) {
          if (status === 1) {
            notifyStatusChange(
              'Motorista a caminho!',
              `O motorista ${motorista.nome} aceitou sua corrida no veículo ${motorista.veiculo} (${motorista.placa}).`
            );
          } else if (status === 2) {
            notifyStatusChange(
              'Motorista no local!',
              'Seu motorista chegou ao local de embarque e está lhe aguardando.'
            );
          } else if (status === 3) {
            notifyStatusChange(
              'Corrida iniciada!',
              'Boa viagem! Você está a caminho do seu destino.'
            );
          }
        }
      } else if (prevStatus !== status) {
        updateDriverDetails((prev) => (prev ? { ...prev, status } : { status }));
      }
      return;
    }

    if (status === 4) {
      if (rideFinishedHandledRef.current) {
        stopPolling();
        return;
      }
      if (rideData?.id) {
        setRideId(rideData.id);
        rideIdRef.current = String(rideData.id);
      }
      rideFinishedHandledRef.current = true;
      stopPolling();
      if (notify) {
        notifyStatusChange(
          'Corrida finalizada!',
          'Sua viagem foi encerrada com sucesso. Obrigado por viajar com a UbeZap!'
        );
      }

      if (motorista) {
        updateDriverDetails({
          id: motorista.id,
          nome: motorista.nome,
          veiculo: motorista.veiculo,
          placa: motorista.placa,
          foto: motorista.foto,
          rating: motorista.rating,
          status: 4,
        });
      } else if (driverDetailsRef.current) {
        updateDriverDetails((prev) => (prev ? { ...prev, status: 4 } : null));
      }

      if (taxa != null) {
        setFinalPrice(String(taxa).replace('.', ','));
      } else if (selectedCat) {
        const cat = categories.find((c) => c.id === selectedCat);
        const price = cat?.taxa || cat?.valor || '0,00';
        setFinalPrice(String(price || '0,00').replace('.', ','));
      }

      setIsSearchingDriver(false);
      setShowSummary(true);
      return;
    }

    if (status === 5) {
      if (rideFinishedHandledRef.current) {
        stopPolling();
        return;
      }
      rideFinishedHandledRef.current = true;
      stopPolling();
      if (notify) {
        Alert.alert('Cancelada', 'A corrida foi cancelada.');
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      ratingSubmittingRef.current = false;
      setShowSummary(false);
      setShowRating(false);
      setRideId(null);
      setIsSelecting(false);
      setIsSelectingPayment(false);
      setIsSearchingDriver(false);
      updateDriverDetails(null);
      setDestination('');
      setDestCoords(null);
      setIsNoDestination(false);
      setRoutePoints([]);
      setRideDetails({ distance: 0, time: 0, arrivalTime: 0 });
      return;
    }
  }, [buildDriverDetails, categories, fitMapToRide, selectedCat]);

  useEffect(() => {
    const unsub = passengerRideMonitor.subscribe((event, payload) => {
      if (event !== 'statusUpdate' || !payload) return;
      applyRideStatusUpdate(payload.status, payload.motorista, payload.taxa, payload, { notify: true });
    });
    return unsub;
  }, [applyRideStatusUpdate]);

  const startPolling = (id, { resume = false } = {}) => {
    if (!id) return;

    rideIdRef.current = id;
    setRideId(id);

    if (!resume) {
      rideFinishedHandledRef.current = false;
      ratingSubmittingRef.current = false;
    }

    passengerRideMonitor.start(id, { reset: !resume }).catch((e) => console.warn('passengerRideMonitor:', e));

    ensureNotificationPermissions().catch(() => {});
    startRideForegroundService({
      title: 'UbeZap — Corrida ativa',
      body: 'Você receberá avisos sobre motorista e status da viagem',
      timeInterval: 12000,
      distanceInterval: 40,
    }).catch((e) => console.warn('Passenger FG service:', e));
  };

  const armLocalCancelGuard = useCallback((durationMs = 90000) => {
    userCancelledLocallyRef.current = true;
    if (cancelGuardTimerRef.current) clearTimeout(cancelGuardTimerRef.current);
    cancelGuardTimerRef.current = setTimeout(() => {
      userCancelledLocallyRef.current = false;
      cancelGuardTimerRef.current = null;
    }, durationMs);
  }, []);

  const clearLocalCancelGuard = useCallback(() => {
    userCancelledLocallyRef.current = false;
    if (cancelGuardTimerRef.current) {
      clearTimeout(cancelGuardTimerRef.current);
      cancelGuardTimerRef.current = null;
    }
  }, []);

  clearLocalCancelGuardRef.current = clearLocalCancelGuard;

  const resetRideUi = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowSummary(false);
    setShowRating(false);
    setIsSelecting(false);
    setIsSelectingPayment(false);
    setIsSearchingDriver(false);
    updateDriverDetails(null);
    setDestination('');
    setDestCoords(null);
    setIsNoDestination(false);
    setRoutePoints([]);
    setRideDetails({ distance: 0, time: 0, arrivalTime: 0 });
  }, []);

  const promptPendingRating = useCallback(async (pending) => {
    if (!pending?.id) return;
    const rideIdStr = String(pending.id);
    if (await isRatingSkipped(rideIdStr)) return;

    setRideId(pending.id);
    rideIdRef.current = rideIdStr;

    if (pending.endereco_ini_txt || pending.endereco_ini) {
      const addr = pending.endereco_ini_txt || pending.endereco_ini;
      if (!isPickupPlaceholder(addr)) setPickup(addr);
    }
    if (pending.endereco_fim_txt || pending.endereco_fim) {
      setDestination(pending.endereco_fim_txt || pending.endereco_fim);
    }
    if (pending.taxa != null) {
      setFinalPrice(String(pending.taxa).replace('.', ','));
    }
    if (pending.motorista) {
      updateDriverDetails({
        id: pending.motorista.id,
        nome: pending.motorista.nome,
        veiculo: pending.motorista.veiculo,
        placa: pending.motorista.placa,
        foto: pending.motorista.foto,
        rating: pending.motorista.rating,
        status: 4,
      });
    }

    setIsSelecting(false);
    setIsSearchingDriver(false);
    setShowRating(false);
    setShowSummary(true);
    rideFinishedHandledRef.current = true;
    stopPolling();
  }, []);

  const dismissRatingPrompt = useCallback(async () => {
    const rid = rideIdRef.current || rideId;
    if (rid) await markRatingSkipped(rid);
    rideFinishedHandledRef.current = true;
    resetRideUi();
    ratingSubmittingRef.current = false;
    setRideId(null);
    rideIdRef.current = null;
    passengerRideMonitor.stop().catch(() => {});
    stopRideForegroundService().catch(() => {});
    stopStatusSound().catch(() => {});
  }, [rideId, resetRideUi]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          const session = await getSession();
          if (!session?.telefone || !mounted) return;

          const statusRes = await api.passenger.getStatus(session.telefone, session.senha);
          if (!mounted) return;

          const pendingRating = extractPendingRating(statusRes.data);
          if (pendingRating?.id) {
            await promptPendingRating(pendingRating);
            return;
          }

          const activeStatus = Number(statusRes.data?.status);
          if (activeStatus >= 1 && activeStatus <= 3 && statusRes.data?.id) {
            clearLocalCancelGuard();
            if (statusRes.data.endereco_ini_txt || statusRes.data.endereco_ini) {
              const addr = statusRes.data.endereco_ini_txt || statusRes.data.endereco_ini;
              if (!isPickupPlaceholder(addr)) setPickup(addr);
            }
            if (statusRes.data.endereco_fim_txt || statusRes.data.endereco_fim) {
              setDestination(statusRes.data.endereco_fim_txt || statusRes.data.endereco_fim);
            }
            applyRideStatusUpdate(
              activeStatus,
              statusRes.data.motorista,
              statusRes.data.taxa,
              statusRes.data,
              { notify: false }
            );
            startPolling(statusRes.data.id, { resume: true });
            return;
          }

          if (userCancelledLocallyRef.current) return;

          let shouldCheck = Boolean(route.params?.resumeActiveRide);
          if (!shouldCheck && !rideIdRef.current) {
            const openRes = await api.passenger.hasOpenRide(session.telefone, session.senha);
            if (openRes.data === true) shouldCheck = true;
          }

          if (!shouldCheck && rideIdRef.current) {
            startPolling(rideIdRef.current, { resume: true });
            return;
          }

          if (!shouldCheck || !mounted) return;
          if (route.params?.resumeActiveRide) {
            navigation.setParams({ resumeActiveRide: undefined });
          }

          const response = await api.passenger.getStatus(session.telefone, session.senha);
          if (!mounted) return;
          const d = response.data;
          if (!d || d.status === undefined) return;
          const sid = d.id;
          const st = Number(d.status);
          if (!sid || st < 0 || st > 3) return;

          if (d.endereco_ini_txt || d.endereco_ini) {
            const addr = d.endereco_ini_txt || d.endereco_ini;
            if (!isPickupPlaceholder(addr)) {
              setPickup(addr);
            } else if (d.lat_ini && d.lng_ini) {
              resolvePickupAddressForRide(parseFloat(d.lat_ini), parseFloat(d.lng_ini), addr)
                .then((resolved) => setPickup(resolved))
                .catch(() => {});
            }
          }
          if (d.endereco_fim_txt || d.endereco_fim) {
            setDestination(d.endereco_fim_txt || d.endereco_fim);
          }

          applyRideStatusUpdate(d.status, d.motorista, d.taxa, d, { notify: false });
          startPolling(sid, { resume: true });
        } catch (e) {
          console.warn('Retomar corrida:', e);
        }
      })();
      return () => { mounted = false; };
    }, [route.params?.resumeActiveRide, navigation, applyRideStatusUpdate, promptPendingRating])
  );

  const handleCancelRide = () => {
    const st = driverDetails?.status;
    const message = st != null && st > 1
      ? 'Atenção: Cancelar agora poderá gerar uma multa de cancelamento. Deseja continuar?' 
      : 'Tem certeza que deseja cancelar sua viagem?';

    Alert.alert(
      'Cancelar Corrida',
      message,
      [
        { text: 'Não', style: 'cancel' },
        { 
          text: 'Sim, Cancelar', 
          style: 'destructive',
          onPress: () => {
            (async () => {
              const session = await getSession();
              if (!session) {
                Alert.alert('Erro', 'Sessão não encontrada');
                return;
              }

              try {
                const openRes = await api.passenger.hasOpenRide(session.telefone, session.senha);
                if (!openRes.data) {
                  Alert.alert('Corrida encerrada', 'Esta corrida já foi finalizada ou cancelada.');
                  clearLocalCancelGuard();
                  rideFinishedHandledRef.current = true;
                  resetRideUi();
                  stopPolling();
                  setRideId(null);
                  return;
                }
              } catch (e) {
                console.warn('hasOpenRide:', e);
              }

              const savedRideId = rideIdRef.current;
              armLocalCancelGuard();
              playStatusSound();
              resetRideUi();

              try {
                await api.passenger.cancelRide(session.telefone, session.senha);
                clearLocalCancelGuard();
                rideFinishedHandledRef.current = true;
                setRideId(null);
                rideIdRef.current = null;
                stopPolling();
              } catch (e) {
                console.warn('Cancel ride API:', e);
                clearLocalCancelGuard();
                rideFinishedHandledRef.current = false;

                if (savedRideId) {
                  try {
                    const res = await api.passenger.getStatus(session.telefone, session.senha, savedRideId);
                    const d = res.data;
                    if (d && d.status >= 1 && d.status <= 3) {
                      setRideId(savedRideId);
                      rideIdRef.current = savedRideId;
                      applyRideStatusUpdate(d.status, d.motorista, d.taxa, d, { notify: false });
                      startPolling(savedRideId, { resume: true });
                    } else if (d?.status === 4) {
                      applyRideStatusUpdate(4, d.motorista, d.taxa, d, { notify: false });
                    } else if (d?.status === 5) {
                      applyRideStatusUpdate(5, d.motorista, d.taxa, d, { notify: false });
                    }
                  } catch (restoreErr) {
                    console.warn('Restaurar corrida após falha no cancel:', restoreErr);
                  }
                }

                Alert.alert(
                  'Atenção',
                  'Não confirmamos o cancelamento no servidor. A corrida pode continuar ativa — verifique o status ou tente cancelar novamente.'
                );
              }
            })();
          }
        }
      ]
    );
  };

  const handleApplyCoupon = async () => {
    if (!couponCode || !selectedCat) {
      Alert.alert('Aviso', 'Informe um cupom e selecione uma categoria primeiro.');
      return;
    }

    const selectedCatData = categories.find(c => c.id === selectedCat);
    const currentVal = (selectedCatData?.taxa || selectedCatData?.valor || '0.00').toString().replace(',', '.');

    setLoading(true);
    try {
      const session = await getSession();
      if (!session) throw new Error('Sessão não encontrada');
      const response = await api.passenger.validateCoupon({
        telefone: session.telefone,
        senha: session.senha,
        cupom: couponCode,
        valor: currentVal
      });

      if (response.data && response.data.status === 'Cupom aplicado!') {
        setAppliedCoupon(couponCode);
        setDiscountedPrice(response.data.desconto); // API returns final price
        Alert.alert('Sucesso', 'Cupom aplicado com sucesso!');
      } else {
        Alert.alert('Erro', response.data?.status || 'Cupom inválido');
        setAppliedCoupon(null);
        setDiscountedPrice(null);
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível validar o cupom.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRating = async () => {
    if (ratingSubmittingRef.current) return;
    const corridaId = rideIdRef.current || rideId;
    if (!corridaId) {
      Alert.alert('Erro', 'Não foi possível identificar a corrida para avaliar.');
      return;
    }

    ratingSubmittingRef.current = true;
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) throw new Error('Sessão não encontrada');
      const res = await api.passenger.rateRide({
        telefone: session.telefone,
        senha: session.senha,
        corrida_id: corridaId,
        nota: ratingValue,
        comentario: ratingComment
      });
      const body = res?.data;
      const parsed = typeof body === 'string'
        ? (() => { try { return JSON.parse(body); } catch { return null; } })()
        : body;
      if (!parsed || parsed.status !== 'ok') {
        throw new Error(parsed?.mensagem || 'Falha ao enviar avaliação');
      }

      await clearRatingSkipped(corridaId);
      rideFinishedHandledRef.current = true;
      setShowRating(false);
      setShowSummary(false);
      updateDriverDetails(null);
      setRatingComment('');
      setRatingValue(5);
      ratingSubmittingRef.current = false;
      setRideId(null);
      rideIdRef.current = null;
      resetRideUi();
      Alert.alert('Obrigado!', 'Sua avaliação foi enviada com sucesso.');
    } catch (e) {
      ratingSubmittingRef.current = false;
      Alert.alert('Erro', e?.message || 'Não foi possível enviar a avaliação.');
    } finally {
      setLoading(false);
    }
  };

  const stopPolling = () => {
    rideIdRef.current = null;
    passengerRideMonitor.stop().catch(() => {});
    stopRideForegroundService().catch(() => {});
    stopStatusSound().catch(() => {});
  };

  const selectDestination = async (loc) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      if (activeSearchInput === 'stop') {
        setStop(loc.title);
        setStopCoords(loc.coords);
        // Após selecionar parada, foca no destino se ele estiver vazio
        if (!destination) {
           setActiveSearchInput('destination');
        } else {
           setIsChoosingDestination(false);
           setIsSelecting(true);
           loadCategories(destCoords, false, loc.coords);
        }
      } else {
        setDestination(loc.title);
        setDestCoords(loc.coords);
        setIsNoDestination(false);
        setIsChoosingDestination(false);
        setIsSelecting(true); 
        loadCategories(loc.coords, false, stopCoords);
      }
      setRoutePoints([]); 
    } catch (e) {
      console.error('Erro na seleção:', e);
    }
  };

  const handleNoDestination = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const noDestTitle = 'Sem Destino (A combinar)';
    setDestination(noDestTitle);
    setDestCoords(null);
    setIsNoDestination(true);
    setIsChoosingDestination(false);
    setIsSelecting(true);
    setRoutePoints([]);
    
    // No modo sem destino, calcula usando origem->origem para obter taxa base mínima.
    loadCategories(null, true);
  };

  const loadCategories = async (targetCoords = destCoords, forceNoDestination = false, waypointCoords = stopCoords) => {
    const noDestinationMode = forceNoDestination || isNoDestination;
    const effectiveTarget = targetCoords || (noDestinationMode ? pickupCoords : null);
    if (!pickupCoords || isSameAsDefault(pickupCoords, DEFAULT_PICKUP_COORDS)) {
      Alert.alert(
        'Sinal de GPS Fraco',
        'Não foi possível obter sua localização exata. Por favor, certifique-se de que a localização/GPS do seu celular está ativa e aguarde obter as coordenadas corretas.'
      );
      setIsSelecting(false);
      return;
    }
    if (!effectiveTarget) return;
    
    setLoading(true);
    setIsSelecting(true);
    try {
      // Para o cálculo inicial, se não houver destino, enviamos a própria origem 
      // ou apenas o parâmetro de categoria para obter o preço base.
      const response = await api.passenger.calculateRide(
        user.cidade_id || 1, 
        pickupCoords.latitude,
        pickupCoords.longitude,
        effectiveTarget.latitude,
        effectiveTarget.longitude,
        waypointCoords?.latitude,
        waypointCoords?.longitude
      );
      
      if (response.data && response.data.categorias) {
        setCategoryImageFailed({});
        setCategories(response.data.categorias);
        if (response.data.categorias.length > 0) {
          // Garante que a primeira categoria esteja selecionada
          setSelectedCat(response.data.categorias[0].id);
        }
        
        if (response.data.dados) {
            setRideDetails(prev => ({
                ...prev,
                distance: response.data.dados.km || 0,
                time: response.data.dados.minutos || 0
            }));

            if (response.data.dados.polyline && !noDestinationMode) {
                const pts = decodePolyline(response.data.dados.polyline);
                setRoutePoints(pts);
                
                // Auto-fit câmera para mostrar a rota toda
                if (mapRef.current) {
                  mapRef.current.fitToCoordinates([pickupCoords, effectiveTarget], {
                    edgePadding: { top: 100, right: 50, bottom: 400, left: 50 },
                    animated: true,
                  });
                }
            } else {
                setRoutePoints(noDestinationMode ? [] : [pickupCoords, effectiveTarget]);
            }
        }
      } else {
          Alert.alert('Aviso', 'Nenhuma categoria disponível para esta rota.');
      }
    } catch (e) {
      console.error('Erro no cálculo:', e);
      Alert.alert('Erro', 'Não foi possível calcular os custos da viagem.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRide = async () => {
    if (!selectedCat || (!destCoords && !isNoDestination)) {
      Alert.alert('Erro', 'Selecione uma categoria e destino.');
      return;
    }

    setLoading(true);
    try {
      const selectedCategoryData = categories.find(c => c.id === selectedCat);
      const baseTaxa = selectedCategoryData?.taxa ?? selectedCategoryData?.valor ?? 0;
      const finalPriceStr = (appliedCoupon && discountedPrice != null && discountedPrice !== '')
        ? parseMoneyToApi(discountedPrice)
        : parseMoneyToApi(baseTaxa);
      const session = await getSession();
      if (!session) throw new Error('Sessão não encontrada');

      // Se for Carteira, verifica saldo antes
      if (paymentMethod.id === 'wallet') {
        const balanceRes = await api.passenger.checkBalance(session.telefone, session.senha, finalPriceStr);
        if (balanceRes.data && balanceRes.data.status === 'erro') {
          Alert.alert('Saldo Insuficiente', 'Você não possui saldo suficiente na carteira. Por favor, escolha outra forma de pagamento ou faça uma recarga.');
          setLoading(false);
          return;
        }
      }

      const finalDestCoords = destCoords || pickupCoords;
      if (!pickupCoords?.latitude || !pickupCoords?.longitude) {
        Alert.alert('Localização', 'Aguarde o GPS definir o ponto de embarque e tente novamente.');
        setLoading(false);
        return;
      }

      const pickupAddress = await resolvePickupAddressForRide(
        pickupCoords.latitude,
        pickupCoords.longitude,
        pickup
      );
      setPickup(pickupAddress);

      const payload = {
        telefone: session.telefone,
        senha: session.senha,
        valor: finalPriceStr,
        forma_pagamento: paymentMethod.label,
        endereco_ini: pickupAddress,
        endereco_fim: isNoDestination ? 'Sem Destino (A combinar)' : (stop ? `PARADA: ${stop} | DESTINO: ${destination}` : destination),
        categoria_id: selectedCat,
        lat_ini: pickupCoords.latitude,
        lng_ini: pickupCoords.longitude,
        lat_fim: finalDestCoords.latitude,
        lng_fim: finalDestCoords.longitude,
        km: rideDetails.distance,
        tempo: rideDetails.time,
        taxa: finalPriceStr,
        obs: stop ? `Corrida com parada em: ${stop}` : '',
        cupom: appliedCoupon || '',
      };

      const response = await api.passenger.requestRide(payload);

      if (response && response.data && (response.data.status === 'ok' || response.data.status === 'sucesso' || response.data.id || response.data.id_corrida)) {
        const newRideId = response.data.id_corrida || response.data.id || 999;

        clearLocalCancelGuard();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setRideId(newRideId);
        setIsSelecting(false);
        setIsSearchingDriver(true);
        playStatusSound();
        ensurePassengerAlertPermissions();
        
        startPolling(newRideId);
      } else {
        const errorMsg = response?.data?.mensagem || response?.data?.error || 'Erro desconhecido';
        throw new Error(`Falha ao inserir chamado: ${errorMsg}`);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível solicitar a corrida.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (cancelGuardTimerRef.current) clearTimeout(cancelGuardTimerRef.current);
      stopPolling();
    };
  }, []);

  const toggleSelection = () => {
    resetRideUi();
    stopPolling();
    ratingSubmittingRef.current = false;
    setRideId(null);
    rideIdRef.current = null;
  };

  useEffect(() => {
    if (!driverDetails || !pickupCoords) return;
    const timer = setTimeout(() => {
      fitMapToRide(driverDetails.coords);
    }, 350);
    return () => clearTimeout(timer);
  }, [
    Boolean(driverDetails),
    driverDetails?.status,
    pickupCoords?.latitude,
    pickupCoords?.longitude,
    destCoords?.latitude,
    destCoords?.longitude,
    fitMapToRide,
  ]);

  useEffect(() => {
    if (!pickupCoords || driverDetails) return;
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        ...pickupCoords,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }, 600);
    }
  }, [pickupCoords?.latitude, pickupCoords?.longitude, driverDetails]);

  const renderMap = () => {
    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: '#131C2E', justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="map" size={120} color="#64748B" />
          <Text style={{ color: '#94A3B8', marginTop: 15, fontSize: 18, fontWeight: '500' }}>Mapa Interativo (99 Style Mock)</Text>
        </View>
      );
    }

    const mapCenter = pickupCoords || DEFAULT_PICKUP_COORDS;
    const mapDelta = driverDetails ? 0.035 : 0.05;

    return (
      <MapView 
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: mapCenter.latitude,
          longitude: mapCenter.longitude,
          latitudeDelta: mapDelta,
          longitudeDelta: mapDelta,
        }}
        showsUserLocation={!!pickupCoords && !isSearchingDriver && !driverDetails}
        showsMyLocationButton={false}
        loadingEnabled
      >
        {pickupCoords && (
        <Marker coordinate={pickupCoords} zIndex={10} tracksViewChanges={false}>
           <View style={{ alignItems: 'center' }}>
             <MapLabel style={{ marginBottom: 6 }} activeOpacity={0.9} onPress={() => setIsChoosingDestination(true)}>
                <View style={{ marginRight: 8 }}>
                  <LabelText>{driverDetails ? 'Local de Embarque' : isSelecting ? ((categories.find(c => c.id === selectedCat)?.motorista_tempo || '--') + ' min') : 'Onde você está?'}</LabelText>
                  <AddressLabelText numberOfLines={1}>{(pickup || '').split('(')[0].trim()}</AddressLabelText>
                </View>
                <Icon name="chevron-right" size={14} color="#94A3B8" />
             </MapLabel>
             <View style={{ width: 14, height: 14, backgroundColor: '#22C55E', borderRadius: 7, borderWidth: 3, borderColor: '#fff' }} />
           </View>
        </Marker>
        )}

        {destCoords && (
          <>
            {routePoints.length > 1 && (
            <Polyline 
              coordinates={routePoints}
              strokeColor={colors.primary}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
            />
            )}
            <Marker coordinate={destCoords} zIndex={11} tracksViewChanges={false}>
               <View style={{ alignItems: 'center' }}>
                 <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                   <View style={{ width: 24, height: 24, backgroundColor: '#333', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}>
                      <View style={{ width: 8, height: 8, backgroundColor: '#fff', borderRadius: 4 }} />
                   </View>
                   <View style={{ width: 2, height: 10, backgroundColor: '#333' }} />
                 </View>
                 {!driverDetails && (
                   <MapLabel style={{ marginTop: 2 }} activeOpacity={0.9} onPress={() => setIsChoosingDestination(true)}>
                      <View style={{ marginRight: 8 }}>
                        <LabelText>{rideDetails.distance || 0} km • {rideDetails.time || 0} min</LabelText>
                        <AddressLabelText numberOfLines={1}>{destination || 'Destino'}</AddressLabelText>
                      </View>
                      <Icon name="search" size={14} color="#94A3B8" />
                   </MapLabel>
                 )}
               </View>
            </Marker>
          </>
        )}

        {driverDetails?.coords && (
          <Marker 
            coordinate={{
              latitude: parseFloat(driverDetails.coords.latitude) || -23.55,
              longitude: parseFloat(driverDetails.coords.longitude) || -46.63
            }} 
            zIndex={20}
            tracksViewChanges={false}
          >
             <View style={{ width: 44, height: 44, backgroundColor: '#131C2E', borderRadius: 22, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: {width:0, height:3}, shadowOpacity: 0.3, shadowRadius: 4, borderWidth: 2, borderColor: colors.primary }}>
                <Icon name={(categories.find(c => c.id === selectedCat)?.nome || '').toLowerCase().includes('moto') ? 'motorcycle' : 'directions-car'} size={24} color={colors.primary} />
             </View>
          </Marker>
        )}

        {!driverDetails && Array.isArray(nearbyDrivers) && nearbyDrivers
          .filter(dr => dr && !isNaN(parseFloat(dr.latitude)) && !isNaN(parseFloat(dr.longitude)) && parseFloat(dr.latitude) !== 0 && parseFloat(dr.longitude) !== 0)
          .map(dr => (
            <Marker
              key={`nearby-${dr.id}`}
              coordinate={{ latitude: parseFloat(dr.latitude), longitude: parseFloat(dr.longitude) }}
            tracksViewChanges={false}
          >
            <Animated.View style={{ 
              width: 40, height: 40, 
              justifyContent: 'center', 
              alignItems: 'center', 
              opacity: sensorAnim,
              transform: [{ scale: sensorAnim.interpolate({ inputRange: [0.3, 1], outputRange: [1, 1.15] }) }] 
            }}>
                <Icon name="directions-car" size={26} color={colors.primary} />
            </Animated.View>
          </Marker>
        ))}
      </MapView>
    );
  };

  const rideStatus = String(driverDetails?.status || '1');

  return (
    <Container>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {isChoosingDestination && (
        <DestinationOverlay>
          <SearchHeaderScroll style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => {
                  setIsChoosingDestination(false);
                  setDestSearchText('');
                  setDestSearchResults([]);
                }}
              >
                <Icon name="arrow-back" size={30} color={colors.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginLeft: 15, color: colors.text }}>{activeSearchInput === 'stop' ? 'Adicionar Parada' : 'Para onde vamos?'}</Text>
              {!isAddingStop && activeSearchInput === 'destination' && (
                <TouchableOpacity 
                  onPress={() => {
                    setIsAddingStop(true);
                    setActiveSearchInput('stop');
                  }}
                  style={{ marginLeft: 'auto', backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 12 }}>+ PARADA</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ marginTop: 20 }}>
               {isAddingStop && (
                 <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                   <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginRight: 10 }} />
                   <SearchInput
                     autoFocus={activeSearchInput === 'stop'}
                     onFocus={() => setActiveSearchInput('stop')}
                     placeholder="Endereço da parada..."
                     value={activeSearchInput === 'stop' ? destSearchText : (stop || '')}
                     onChangeText={setDestSearchText}
                     style={{ marginLeft: 0, height: 45, backgroundColor: activeSearchInput === 'stop' ? '#1B2740' : '#131C2E', borderBottomWidth: 2, borderBottomColor: activeSearchInput === 'stop' ? colors.primary : 'transparent' }}
                   />
                   <TouchableOpacity onPress={() => { setIsAddingStop(false); setStop(''); setStopCoords(null); setActiveSearchInput('destination'); }}>
                     <Icon name="close" size={20} color="#94A3B8" style={{ marginLeft: 10 }} />
                   </TouchableOpacity>
                 </View>
               )}

               <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                 <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 10 }} />
                 <SearchInput
                   autoFocus={activeSearchInput === 'destination' && !isAddingStop}
                   onFocus={() => setActiveSearchInput('destination')}
                   placeholder="Endereço do destino..."
                   value={activeSearchInput === 'destination' ? destSearchText : (destination || '')}
                   onChangeText={setDestSearchText}
                   style={{ marginLeft: 0, height: 45, backgroundColor: activeSearchInput === 'destination' ? '#1B2740' : '#131C2E', borderBottomWidth: 2, borderBottomColor: activeSearchInput === 'destination' ? colors.primary : 'transparent' }}
                 />
               </View>
            </View>
          </SearchHeaderScroll>
          <SearchResultList keyboardShouldPersistTaps="handled">
            <ContentPadding>
              <TouchableOpacity 
                onPress={handleNoDestination}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  backgroundColor: 'rgba(58, 181, 107, 0.08)', 
                  padding: 18, 
                  borderRadius: 18, 
                  marginBottom: 25,
                  borderWidth: 1,
                  borderColor: 'rgba(58, 181, 107, 0.2)'
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                  <Icon name="speed" size={24} color="#fff" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: colors.text }}>Sem Destino / Taxímetro</Text>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>O valor será calculado durante a viagem</Text>
                </View>
                <Icon name="chevron-right" size={24} color={colors.primary} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#94A3B8', marginBottom: 8, marginTop: 8 }}>
                RESULTADOS
              </Text>
              {destSearchLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
              ) : destSearchText.trim().length < 3 ? (
                <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>
                  Digite pelo menos 3 caracteres para buscar endereços no Brasil.
                </Text>
              ) : destSearchResults.length === 0 ? (
                <Text style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>
                  Nenhum endereço encontrado. Tente outro termo.
                </Text>
              ) : (
                destSearchResults.map((item, idx) => (
                  <SearchResultItem
                    key={String(item.place_id || item.osm_id || idx)}
                    onPress={() => {
                      const lat = parseFloat(item.lat);
                      const lon = parseFloat(item.lon);
                      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                        Alert.alert('Endereço', 'Não foi possível obter as coordenadas deste local. Escolha outro resultado.');
                        return;
                      }
                      const shortTitle =
                        item.name ||
                        (item.display_name ? item.display_name.split(',')[0].trim() : 'Destino');
                      const sub =
                        item.display_name && item.display_name.length > shortTitle.length
                          ? item.display_name.slice(shortTitle.length + 1).trim()
                          : '';
                      selectDestination({
                        title: shortTitle,
                        subtitle: sub || item.type || '',
                        coords: { latitude: lat, longitude: lon },
                      });
                      setDestSearchText('');
                      setDestSearchResults([]);
                    }}
                  >
                    <ResultIcon>
                      <Icon name="place" size={20} color="#94A3B8" />
                    </ResultIcon>
                    <ResultTextContainer>
                      <ResultTitle numberOfLines={2}>
                        {item.name || (item.display_name ? item.display_name.split(',')[0] : 'Endereço')}
                      </ResultTitle>
                      <ResultSubtitle numberOfLines={2}>{item.display_name || ''}</ResultSubtitle>
                    </ResultTextContainer>
                  </SearchResultItem>
                ))
              )}

              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#94A3B8', marginBottom: 10, marginTop: 16 }}>
                HISTÓRICO
              </Text>
              {recentLocations.length > 0 ? (
                recentLocations.map((loc, idx) => (
                  <SearchResultItem
                    key={`hist-${idx}`}
                    onPress={() => {
                      selectDestination(loc);
                      setDestSearchText('');
                      setDestSearchResults([]);
                    }}
                  >
                    <ResultIcon>
                      <Icon name="history" size={20} color="#94A3B8" />
                    </ResultIcon>
                    <ResultTextContainer>
                      <ResultTitle numberOfLines={2}>{loc.title}</ResultTitle>
                      <ResultSubtitle numberOfLines={1}>{loc.subtitle}</ResultSubtitle>
                    </ResultTextContainer>
                  </SearchResultItem>
                ))
              ) : (
                <Text style={{ color: '#94A3B8', fontSize: 13 }}>Nenhuma viagem recente.</Text>
              )}
            </ContentPadding>
          </SearchResultList>
        </DestinationOverlay>
      )}

      <HeaderContainer pointerEvents="box-none">
        <TopBar pointerEvents="box-none">
          <IconButton onPress={() => {
            if (isSelectingPayment) setIsSelectingPayment(false);
            else if (isSelecting) toggleSelection();
            else toggleMenu();
          }}>
            <Icon name={(isSelecting || isSelectingPayment) ? "arrow-back" : "menu"} size={28} color={colors.text} />
          </IconButton>
          
          {!isSelecting && !isSearchingDriver && !driverDetails && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(19,28,46,0.95)', borderRadius: 30, padding: 3, elevation: 20, shadowColor: '#000', shadowOffset: {width:0, height:6}, shadowOpacity: 0.25, shadowRadius: 15, borderWidth: 1, borderColor: '#243049' }}>
              <IconButton onPress={() => navigation.navigate('HistoryScreen')} style={{ width: 36, height: 36, elevation: 0, shadowOpacity: 0, backgroundColor: 'transparent' }}>
                <Icon name="history" size={18} color={colors.text} />
              </IconButton>

              <View style={{ width: 1, height: 14, backgroundColor: '#243049', alignSelf: 'center' }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 4, maxWidth: width * 0.42 }}>
                {currentLocationLabel ? (
                   <Text style={{ fontSize: 8.5, fontWeight: '900', color: colors.primary, marginRight: 4, letterSpacing: 0.8, flexShrink: 1 }} numberOfLines={1}>
                     {currentLocationLabel.toUpperCase()}
                   </Text>
                ) : null}

                <IconButton onPress={() => navigation.navigate('WalletScreen')} style={{ width: 36, height: 36, elevation: 0, shadowOpacity: 0, backgroundColor: 'transparent' }}>
                  <Icon name="account-balance-wallet" size={18} color={colors.text} />
                </IconButton>
              </View>
            </View>
          )}
        </TopBar>
      </HeaderContainer>

      {renderMap()}

      {/* Side Menu Overlay */}
      {isMenuOpen && (
        <Overlay activeOpacity={1} onPress={toggleMenu} />
      )}
      <Animated.View style={[{ 
        position: 'absolute', 
        top: 0, bottom: 0, left: 0, 
        width: width * 0.8,
        backgroundColor: '#131C2E',
        zIndex: 10001,
        transform: [{ translateX: menuAnim }],
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        borderRightWidth: 1,
        borderRightColor: '#243049',
      }]}>
          <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#243049', marginBottom: 20 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#1B2740', justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#243049' }}>
               <Icon name="person" size={40} color={colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text }}>{user.nome}</Text>
            </View>
          </View>

          {[
            { title: 'Início', icon: 'home', screen: 'PassengerPrincipal', params: { preferDashboard: true } },
            { title: 'Pedir Corrida', icon: 'map', screen: 'PassengerHome' },
            { title: 'Carteira', icon: 'account-balance-wallet', screen: 'WalletScreen' },
            { title: 'Histórico', icon: 'history', screen: 'HistoryScreen' },
            { title: 'Notificações', icon: 'notifications', screen: 'NotificationScreen' },
            { title: 'Ajuda', icon: 'help-outline', screen: 'SupportScreen' },
            { title: 'Configurações', icon: 'settings', screen: 'ProfileScreen' },
          ].map((item, idx) => (
            <TouchableOpacity key={idx} onPress={() => {
                toggleMenu();
                if (item.screen) navigation.navigate(item.screen, item.params || undefined);
            }} style={{ flexDirection: 'row', alignItems: 'center', padding: 15, paddingHorizontal: 20 }}>
              <Icon name={item.icon} size={24} color={colors.primary} />
              <View style={{ marginLeft: 15 }}>
                <Text style={{ fontSize: 16, color: colors.text }}>{item.title}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={{ marginTop: 'auto', marginBottom: 20, flexDirection: 'row', alignItems: 'center', padding: 15, paddingHorizontal: 20 }} onPress={async () => {
             await clearSession();
             navigation.navigate('PassengerLogin');
          }}>
             <Icon name="exit-to-app" size={24} color="#EF4444" />
             <Text style={{ fontSize: 16, color: '#EF4444', marginLeft: 15 }}>Sair</Text>
          </TouchableOpacity>
      </Animated.View>

      {showSummary && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000, justifyContent: 'center', padding: 20 }]}>
           <View style={{ backgroundColor: '#131C2E', borderRadius: 30, padding: 30, alignItems: 'center' }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                 <Icon name="check" size={36} color="#fff" />
              </View>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#F1F5F9', textAlign: 'center' }}>Viagem Finalizada!</Text>
              <Text style={{ fontSize: 16, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>Esperamos que tenha tido uma excelente experiência com a UbeZap.</Text>

              <View style={{ width: '100%', backgroundColor: '#1B2740', borderRadius: 20, padding: 20, marginVertical: 30 }}>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: '#94A3B8' }}>Total Pago</Text>
                    <Text style={{ fontWeight: 'bold', color: colors.primary, fontSize: 18 }}>
                      R$ {finalPrice}
                    </Text>
                 </View>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: '#94A3B8' }}>Distância</Text>
                    <Text style={{ fontWeight: '600', color: colors.text }}>{rideDetails.distance} km</Text>
                 </View>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: '#94A3B8' }}>Embarque</Text>
                    <Text style={{ fontWeight: '600', flex: 0.8, textAlign: 'right', color: colors.text }}>{(pickup || '').split('(')[0].trim()}</Text>
                 </View>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: '#94A3B8' }}>Destino</Text>
                    <Text style={{ fontWeight: '600', flex: 0.8, textAlign: 'right', color: colors.text }}>{stop ? `${stop} ➔ ${destination}` : destination}</Text>
                 </View>
              </View>

              <TouchableOpacity 
                onPress={() => { setShowSummary(false); setShowRating(true); }}
                style={{ backgroundColor: colors.primary, width: '100%', height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>AVALIAR MOTORISTA</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={dismissRatingPrompt} style={{ marginTop: 20 }}>
                 <Text style={{ color: '#94A3B8', fontSize: 14 }}>Fechar sem avaliar</Text>
              </TouchableOpacity>
           </View>
        </View>
      )}

      {showRating && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
           <View style={{ backgroundColor: '#131C2E', width: '100%', borderRadius: 25, padding: 25, alignItems: 'center' }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#1B2740', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                 <SmartImage value={driverDetails?.foto} style={{ width: 70, height: 70, borderRadius: 35 }} fallbackIcon="person" fallbackSize={36} fallbackBg="transparent" alignTop />
              </View>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#F1F5F9' }}>Como foi sua viagem?</Text>
              <Text style={{ fontSize: 16, color: '#94A3B8', marginTop: 5, marginBottom: 20 }}>Avalie {driverDetails?.nome}</Text>
              
              <View style={{ flexDirection: 'row', marginBottom: 25 }}>
                 {[1, 2, 3, 4, 5].map((star) => (
                   <TouchableOpacity key={star} onPress={() => setRatingValue(star)}>
                      <Icon name="star" size={40} color={star <= ratingValue ? "#F59E0B" : "#243049"} />
                   </TouchableOpacity>
                 ))}
              </View>

              <TextInput 
                placeholder="Deixe um comentário (opcional)"
                multiline
                numberOfLines={3}
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholderTextColor="#64748B"
                style={{ width: '100%', backgroundColor: '#1B2740', color: colors.text, borderRadius: 12, padding: 15, fontSize: 16, textAlignVertical: 'top', marginBottom: 25 }}
              />

              <TouchableOpacity 
                disabled={loading}
                onPress={handleSendRating}
                style={{ backgroundColor: colors.primary, width: '100%', height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center', opacity: loading ? 0.7 : 1 }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>ENVIAR AVALIAÇÃO</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity onPress={dismissRatingPrompt} style={{ marginTop: 15 }}>
                 <Text style={{ color: '#94A3B8', fontSize: 14 }}>Pular agora</Text>
              </TouchableOpacity>
           </View>
        </View>
      )}

      <AnimatedBottomSheet
        onLayout={(e) => { const h = e.nativeEvent.layout.height; if (h) sheetHeightRef.current = h; }}
        style={{ transform: [{ translateY: sheetTranslate }] }}
        expanded={isSelecting || isSearchingDriver || !!driverDetails}
      >
        <View {...sheetPan.panHandlers} hitSlop={{ top: 12, bottom: 12, left: 100, right: 100 }} style={{ alignItems: 'center', paddingTop: 4, paddingBottom: 6 }}>
          <Handle />
        </View>
        <ContentPadding>
          {driverDetails ? (
            <View style={{ paddingVertical: 5 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                 <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text }}>{rideStatus === '3' ? 'Viagem em curso' : 'Motorista a caminho'}</Text>
                 <View style={{ backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 14 }}>{driverDetails?.tempo || 'N/A'}</Text>
                 </View>
              </View>

              <TimeLineContainer>
                 <TimeLineStep>
                    <StepDot active={true} />
                    <StepText active={rideStatus === '1'}>Motorista aceitou</StepText>
                 </TimeLineStep>
                 <StepLine active={parseInt(rideStatus) >= 2} />
                 <TimeLineStep>
                    <StepDot active={parseInt(rideStatus) >= 2} />
                    <StepText active={rideStatus === '2'}>No local de embarque</StepText>
                 </TimeLineStep>
                 <StepLine active={parseInt(rideStatus) >= 3} />
                 <TimeLineStep>
                    <StepDot active={parseInt(rideStatus) >= 3} />
                    <StepText active={rideStatus === '3'}>Viagem iniciada</StepText>
                 </TimeLineStep>
                 <StepLine active={rideStatus === '4'} />
                 <TimeLineStep>
                    <StepDot active={rideStatus === '4'} />
                    <StepText active={rideStatus === '4'}>Chegada ao destino</StepText>
                 </TimeLineStep>
              </TimeLineContainer>

              <View style={{ backgroundColor: '#1B2740', padding: 15, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#243049', overflow: 'hidden' }}>

                  {(() => {
                    const carPhotos = [driverDetails?.img_frente, driverDetails?.img_lateral].filter(p => p && p !== 'sem_imagem.png');
                    const slideW = carouselW || 0;
                    const H = 190;
                    if (carPhotos.length === 0) {
                      return (
                        <SmartImage value={'https://www.uber-assets.com/image/upload/f_auto,q_auto:eco,c_fill,w_956,h_637/v1555355171/assets/39/c46522-598d-442b-9441-2f22b784a0d9/original/UberX.png'}
                          style={{ width: '100%', height: H, borderRadius: 15, marginBottom: 15, backgroundColor: '#1B2740' }} resizeMode="cover" fallbackIcon="directions-car" fallbackSize={40} />
                      );
                    }
                    return (
                      <View
                        onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w && Math.abs(w - carouselW) > 1) setCarouselW(w); }}
                        style={{ marginBottom: 15, borderRadius: 15, overflow: 'hidden', backgroundColor: '#1B2740' }}
                      >
                        <ScrollView
                          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                          onMomentumScrollEnd={(e) => { if (slideW) setCarIndex(Math.round(e.nativeEvent.contentOffset.x / slideW)); }}
                        >
                          {carPhotos.map((p, i) => (
                            <SmartImage key={i} value={p} resizeMode="cover"
                              style={{ width: slideW || 1, height: H, backgroundColor: '#1B2740' }}
                              fallbackIcon="directions-car" />
                          ))}
                        </ScrollView>
                        {carPhotos.length > 1 && (
                          <View style={{ position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' }}>
                            {carPhotos.map((_, i) => (
                              <View key={i} style={{ width: i === carIndex ? 18 : 6, height: 6, borderRadius: 3, marginHorizontal: 3, backgroundColor: i === carIndex ? colors.primary : 'rgba(241,245,249,0.25)' }} />
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('DriverProfileScreen', { driver: driverDetails })} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <SmartImage value={driverDetails?.foto} style={{ width: 50, height: 50, borderRadius: 25, marginRight: 15 }} fallbackIcon="person" fallbackSize={26} fallbackBg="transparent" alignTop />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#F1F5F9' }}>{driverDetails?.nome}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon name="star" size={16} color="#F59E0B" />
                            <Text style={{ fontSize: 14, color: '#94A3B8', marginLeft: 4, marginRight: 8 }}>{driverDetails?.rating}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B' }}>
                                <Icon name="workspace-premium" size={12} color="#F59E0B" />
                                <Text style={{ color: '#F59E0B', fontWeight: '800', fontSize: 11, marginLeft: 3 }}>{driverDetails?.nivel || 'Ouro'}</Text>
                            </View>
                        </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ backgroundColor: '#0B1220', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 4 }}>
                            <Text style={{ fontSize: 15, fontWeight: 'bold', color: colors.primary, letterSpacing: 1 }}>{driverDetails?.placa}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: '#94A3B8' }}>{driverDetails?.veiculo}</Text>
                    </View>
                  </TouchableOpacity>
               </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                 <TouchableOpacity 
                   onPress={handleCancelRide}
                   style={{ width: 60, backgroundColor: 'rgba(239,68,68,0.15)', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                    <Icon name="close" size={24} color="#EF4444" />
                 </TouchableOpacity>
                 <TouchableOpacity 
                    onPress={() => navigation.navigate('ChatScreen', { rideId: rideId, isDriver: false, otherUser: driverDetails })}
                    style={{ flex: 1, backgroundColor: colors.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' }}>
                     <Icon name="chat" size={20} color="#fff" style={{ marginRight: 8 }} />
                     <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>MENSAGEM</Text>
                  </TouchableOpacity>
              </View>
            </View>
          ) : isSearchingDriver ? (
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 25, color: '#F1F5F9' }}>Procurando motoristas...</Text>
              
              <View style={{ width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: 25 }}>
                <PulseCircle style={{ transform: [{ scale: pulseScale }], opacity: pulseOpacity }} />
                <View style={{ width: 70, height: 70, backgroundColor: '#131C2E', borderRadius: 35, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: colors.primary, shadowOffset: {width:0, height:4}, shadowOpacity: 0.5, shadowRadius: 6, overflow: 'hidden' }}>
                   <Animated.View style={{ position: 'absolute', opacity: carOpacity, transform: [{ translateX: carTranslateX }] }}>
                     <Icon name="directions-car" size={36} color={colors.primary} />
                   </Animated.View>
                   <Animated.View style={{ position: 'absolute', opacity: motoOpacity, transform: [{ translateX: motoTranslateX }] }}>
                     <Icon name="motorcycle" size={36} color={colors.primary} />
                   </Animated.View>
                </View>
              </View>
              
              <View style={{ alignSelf: 'stretch', backgroundColor: '#1B2740', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#243049' }}>
                 <Text style={{ fontSize: 14, color: '#F1F5F9', fontWeight: 'bold', marginBottom: 5 }}>Distância: {rideDetails.distance} km • Tempo: {rideDetails.time} min</Text>
                 <Text style={{ fontSize: 12, color: '#94A3B8' }}>{pickup.split('(')[0].trim()} ➔ {destination}</Text>
                 <Text style={{ fontSize: 13, color: colors.primary, fontWeight: 'bold', marginTop: 8 }}>
                    Custo: R$ {(categories.find(c => c.id === selectedCat)?.taxa || categories.find(c => c.id === selectedCat)?.valor || '--').toString().replace('.', ',')}
                 </Text>
              </View>

              <TouchableOpacity 
                onPress={handleCancelRide}
                activeOpacity={0.8}
                style={{ width: '100%', height: 50, borderRadius: 25, backgroundColor: 'rgba(239,68,68,0.15)', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: 'bold' }}>CANCELAR BUSCA</Text>
              </TouchableOpacity>
            </View>
          ) : isSelectingPayment ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: colors.text }}>Pagamento</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {paymentOptions.map((opt) => (
                  <TouchableOpacity key={opt.id} onPress={() => { setPaymentMethod(opt); setIsSelectingPayment(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#243049' }}>
                    <Icon name={opt.icon} size={28} color={paymentMethod.id === opt.id ? "#F59E0B" : "#94A3B8"} />
                    <Text style={{ flex: 1, marginLeft: 15, fontSize: 16, color: colors.text }}>{opt.label}</Text>
                    {paymentMethod.id === opt.id && <Icon name="check-circle" size={24} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : isSelecting ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }}>Opções de Viagem</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="timer" size={14} color="#94A3B8" />
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginLeft: 4 }}>{rideDetails.time} min • {rideDetails.distance} km</Text>
                </View>
              </View>
              
              {loading ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 30 }} />
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {categories.map((cat) => {
                    const imgKey = typeof cat.img === 'string' ? cat.img.trim() : cat.img;
                    const showRemoteImg = !!imgKey && !categoryImageFailed[cat.id];
                    return (
                    <CategoryItem 
                      key={cat.id} 
                      selected={selectedCat === cat.id}
                      onPress={() => setSelectedCat(cat.id)}
                      style={{ 
                        borderWidth: 2, 
                        borderColor: selectedCat === cat.id ? colors.primary : 'transparent',
                        borderRadius: 16,
                        marginBottom: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: selectedCat === cat.id ? '#1B2740' : 'transparent'
                      }}
                    >
                      <View style={{ width: 55, height: 55, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1B2740', borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 2 }}>
                         {showRemoteImg ? (
                           <Image
                             source={{ uri: api.getImageUrl(imgKey) }}
                             style={{ width: 45, height: 45 }}
                             resizeMode="contain"
                             onError={() => setCategoryImageFailed((prev) => (prev[cat.id] ? prev : { ...prev, [cat.id]: true }))}
                           />
                         ) : (
                           <Icon name={(cat.nome || '').toLowerCase().includes('moto') ? 'motorcycle' : 'directions-car'} size={32} color={selectedCat === cat.id ? colors.primary : '#64748b'} />
                         )}
                      </View>
                      <CategoryInfo style={{ marginLeft: 15 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <CategoryName style={{ fontSize: 16, color: colors.text }}>{cat.nome}</CategoryName>
                          {(cat.dinamico_mapa_ini || cat.dinamico_mapa_fim || cat.dinamico_horarios) && (
                              <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginLeft: 10 }}>
                                  <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>⚡ ALTA DEMANDA</Text>
                              </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>{cat.descricao || 'Conforto e segurança'}</Text>
                        <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700', marginTop: 4 }}>
                          {cat.motorista_tempo > 0 ? `Chega em ${cat.motorista_tempo} min` : 'Próximo de você'}
                        </Text>
                      </CategoryInfo>
                      <View style={{ alignItems: 'flex-end' }}>
                        <CategoryPrice style={{ 
                          textDecorationLine: (appliedCoupon && selectedCat === cat.id) ? 'line-through' : 'none',
                          color: (appliedCoupon && selectedCat === cat.id) ? '#94a3b8' : colors.text,
                          fontSize: (appliedCoupon && selectedCat === cat.id) ? 13 : 18
                        }}>
                          R$ {(cat.taxa || cat.tx_base || '--').toString().replace('.', ',')}
                        </CategoryPrice>
                        {appliedCoupon && selectedCat === cat.id && (
                          <CategoryPrice style={{ color: colors.primary, fontSize: 18 }}>
                            R$ {discountedPrice?.toString().replace('.', ',')}
                          </CategoryPrice>
                        )}
                      </View>
                    </CategoryItem>
                    );
                  })}
                </ScrollView>
              )}

              <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="local-offer" size={20} color={appliedCoupon ? colors.primary : "#64748b"} />
                  <TextInput 
                    placeholder="Possui um cupom?"
                    value={couponCode}
                    onChangeText={setCouponCode}
                    autoCapitalize="characters"
                    style={{ flex: 1, marginLeft: 10, fontSize: 14, color: colors.secondary }}
                  />
                  <TouchableOpacity 
                    onPress={handleApplyCoupon}
                    disabled={loading || !couponCode}
                    style={{ backgroundColor: colors.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, opacity: (loading || !couponCode) ? 0.6 : 1 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>{appliedCoupon ? 'TROCAR' : 'APLICAR'}</Text>
                  </TouchableOpacity>
                </View>
                {appliedCoupon && (
                  <Text style={{ color: colors.primary, fontSize: 12, fontWeight: 'bold', marginTop: 5 }}>
                    ✓ Cupom {appliedCoupon} aplicado com sucesso!
                  </Text>
                )}
              </View>

              <View style={{ marginTop: 10, marginBottom: 15 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.secondary, marginBottom: 10 }}>Forma de Pagamento:</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  {paymentOptions.map((opt) => (
                    <TouchableOpacity 
                      key={opt.id} 
                      onPress={() => setPaymentMethod(opt)}
                      style={{ 
                        flex: 1, 
                        marginHorizontal: 4, 
                        paddingVertical: 10, 
                        paddingHorizontal: 5,
                        borderRadius: 10, 
                        borderWidth: 2, 
                        borderColor: paymentMethod.id === opt.id ? colors.primary : '#f1f5f9',
                        backgroundColor: paymentMethod.id === opt.id ? colors.primary + '10' : '#fff',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Icon name={opt.icon} size={20} color={paymentMethod.id === opt.id ? colors.primary : "#64748b"} />
                      <Text style={{ 
                        fontSize: 10, 
                        fontWeight: 'bold', 
                        color: paymentMethod.id === opt.id ? colors.primary : "#64748b",
                        marginTop: 4,
                        textAlign: 'center'
                      }}>
                        {opt.label}
                      </Text>
                      {paymentMethod.id === opt.id && (
                        <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: colors.primary, borderRadius: 10, width: 18, height: 18, justifyContent: 'center', alignItems: 'center' }}>
                          <Icon name="check" size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <ConfirmButton 
                disabled={loading}
                onPress={handleConfirmRide} 
                activeOpacity={0.9}
                style={{ opacity: loading ? 0.7 : 1, marginTop: 10 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: colors.white, fontSize: 18, fontWeight: 'bold' }}>
                    CONFIRMAR {categories.find(c => c.id === selectedCat)?.nome?.toString().toUpperCase() || 'VIAGEM'}
                  </Text>
                )}
              </ConfirmButton>
              <Text style={{ fontSize: 10, color: '#999', textAlign: 'center', marginTop: 8 }}>
                * Taxa de cancelamento de R$ 5,00 caso cancele após 5 min do aceite.
              </Text>
            </>
          ) : (
            <>
              {banners.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
                    {banners.map((b, i) => (
                      <TouchableOpacity key={b.id || i} style={{ marginLeft: i === 0 ? 20 : 10, marginRight: i === banners.length - 1 ? 20 : 0 }}>
                        <SmartImage
                          value={b.img}
                          style={{ width: 300, height: 120, borderRadius: 15 }}
                          fallbackIcon="image"
                        />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 5 }}>Para onde vamos hoje?</Text>
              <Text style={{ color: colors.textSecondary, marginBottom: 20 }}>Escolha um destino para ver os preços.</Text>
              
              <MainSearchButton 
                activeOpacity={0.8} 
                onPress={() => setIsChoosingDestination(true)}
                style={{ backgroundColor: colors.primary, borderWidth: 0, height: 60 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
                  <Icon name="search" size={24} color="#fff" />
                </View>
                <Text style={{ flex: 1, marginLeft: 15, color: '#fff', fontSize: 17, fontWeight: 'bold' }}>Insira o destino</Text>
              </MainSearchButton>

              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 15, paddingVertical: 10 }}
                onPress={handleNoDestination}
              >
                <Icon name="edit-location" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, marginLeft: 8, fontWeight: '600' }}>Estou sem destino (Taxímetro)</Text>
              </TouchableOpacity>

              <View style={{ marginTop: 25, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 15 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#999', marginBottom: 15 }}>HISTÓRICO RECENTE</Text>
                {recentLocations.length > 0 ? recentLocations.map((loc, idx) => (
                  <SearchResultItem key={idx} onPress={() => selectDestination(loc)} style={{ paddingHorizontal: 0, borderBottomWidth: 0 }}>
                    <ResultIcon style={{ backgroundColor: '#f5f5f5', width: 36, height: 36 }}><Icon name="history" size={18} color="#999" /></ResultIcon>
                    <ResultTextContainer>
                      <ResultTitle style={{ fontSize: 14 }}>{loc.title}</ResultTitle>
                      <ResultSubtitle style={{ fontSize: 12 }}>{loc.subtitle}</ResultSubtitle>
                    </ResultTextContainer>
                  </SearchResultItem>
                )) : (
                  <Text style={{ color: '#ccc', fontSize: 13, textAlign: 'center', marginTop: 10 }}>Sem viagens recentes</Text>
                )}
              </View>
            </>
          )}
        </ContentPadding>
      </AnimatedBottomSheet>
    </Container>
  );
};

export default HomeScreen;
