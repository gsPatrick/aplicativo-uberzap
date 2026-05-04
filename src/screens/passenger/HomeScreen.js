import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StatusBar, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, Platform, ImageBackground, Animated, Image, StyleSheet, LayoutAnimation, UIManager, Dimensions, AppState } from 'react-native';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import styled from 'styled-components/native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { colors, spacing, borderRadius } from '../../theme/tokens';
import api from '../../services/api';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { getSession, clearSession } from '../../utils/session';

const parseMoneyToApi = (val) => {
  if (val == null || val === '') return '';
  const s = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n.toFixed(2) : String(val).replace(',', '.');
};

const { width } = Dimensions.get('window');

/** Centro padrão (SP) — usado se GPS falhar ou permissão for negada */
const DEFAULT_PICKUP_COORDS = { latitude: -23.5617, longitude: -46.6623 };
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

const AnimatedMarker = Animated.createAnimatedComponent(Marker);

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
  background-color: ${colors.white};
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
  background-color: #f0f0f0;
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
  border-bottom-color: #f5f5f5;
`;

const ResultIcon = styled.View`
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background-color: #f0f0f0;
  justify-content: center;
  align-items: center;
  margin-right: ${spacing.md}px;
`;

const ResultTextContainer = styled.View`
  flex: 1;
`;

const SearchPlaceholder = styled.Text`
  color: #888;
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
  background-color: ${props => props.bg || '#f0f0f0'};
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
  background-color: ${colors.white};
  justify-content: center;
  align-items: center;
  elevation: 8;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.2;
  shadow-radius: 5px;
`;

const SelectionHeader = styled.TouchableOpacity`
  background-color: ${colors.white};
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
  background-color: ${colors.white};
  padding: 8px 12px;
  border-radius: 12px;
  elevation: 8;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 5px;
  border-width: 1px;
  border-color: #f0f0f0;
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
  background-color: #ddd;
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
  background-color: #f0f0f0;
  margin-vertical: 6px;
`;

const CategoryItem = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  padding-vertical: ${spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: #f5f5f5;
  background-color: ${props => props.selected ? '#fcfdfc' : 'transparent'};
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
  color: ${colors.secondary};
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
  background-color: ${props => props.active ? colors.primary : '#e0e0e0'};
  border-width: 2px;
  border-color: ${props => props.active ? colors.primary : '#fff'};
  z-index: 2;
`;

const StepLine = styled.View`
  width: 2px;
  height: 25px;
  background-color: ${props => props.active ? colors.primary : '#e0e0e0'};
  margin-left: 5px;
  margin-top: -2px;
  margin-bottom: -2px;
`;

const StepText = styled.Text`
  margin-left: 15px;
  font-size: 14px;
  font-weight: ${props => props.active ? 'bold' : 'normal'};
  color: ${props => props.active ? colors.secondary : '#94a3b8'};
`;

const BottomSheet = styled.View`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: ${props => props.isDark ? colors.secondary : colors.white};
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

const Handle = styled.View`
  width: 40px;
  height: 5px;
  background-color: ${props => props.isDark ? '#333' : '#e0e0e0'};
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
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [discountedPrice, setDiscountedPrice] = useState(null);

  const [showRating, setShowRating] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const mapRef = useRef(null);
  const [banners, setBanners] = useState([]);
  const [cityData, setCityData] = useState(null);
  const [user, setUser] = useState({ id: 0, nome: 'Passageiro', cidade_id: 1 });
  const appState = useRef(AppState.currentState);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const carouselAnim = useRef(new Animated.Value(0)).current;
  const driverMarkerAnim = useRef(new Animated.Value(0)).current; // 0 a 1 para animação de movimento
  const sensorAnim = useRef(new Animated.Value(1)).current; // Sensor de pulso para carros próximos
  const [animCoords, setAnimCoords] = useState({
    startLat: -23.5577,
    startLng: -46.6583,
    endLat: -23.5617,
    endLng: -46.6623
  });

  const playStatusSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../../assets/sounds/toque_status.mp3')
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (error) {
      console.log('Error playing sound:', error);
    }
  };

  // Efeito para carregar motoristas ao redor periodicamente (estilo Monolito)
  useEffect(() => {
    let interval;
    if (user?.telefone && !driverDetails) {
      const fetchDrivers = async () => {
        try {
          const response = await api.passenger.getAllDrivers(user.telefone, user.senha);
          if (response.data && Array.isArray(response.data)) {
            setNearbyDrivers(response.data);
          }
        } catch (error) {
          console.warn('Erro ao carregar motoristas próximos:', error);
        }
      };

      fetchDrivers();
      const ms = isSearchingDriver ? 5000 : 10000;
      interval = setInterval(fetchDrivers, ms);
    } else {
      setNearbyDrivers([]);
    }
    return () => interval && clearInterval(interval);
  }, [user.telefone, user.senha, isSearchingDriver, driverDetails]);

  useEffect(() => {
    // Carregar dados iniciais
    const fetchData = async () => {
      try {
        const session = await getSession();
        if (!session) return;

        // Perfil e Cidade
        const profileRes = await api.passenger.getProfile(session.telefone, session.senha);
        if (profileRes.data && profileRes.data.status === 'sucesso') {
          const userData = {
            ...profileRes.data,
            nome: profileRes.data.nome || 'Passageiro',
            cidade_id: profileRes.data.cidade_id || 1
          };
          setUser(userData);

          // Agora busca os dados da cidade correta
          const cityRes = await api.passenger.getCityData(userData.cidade_id);
          setCityData(cityRes.data);

          // Busca banners da cidade
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

    const subscription = AppState.addEventListener('change', nextAppState => {
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    }
  }, [user.cidade_id, user.id]);

  useEffect(() => {
    if (driverDetails && pickupCoords) {
      driverMarkerAnim.setValue(0);
      
      if (driverDetails.status === 1) {
        setAnimCoords({
          startLat: driverDetails.coords.latitude,
          startLng: driverDetails.coords.longitude,
          endLat: pickupCoords.latitude,
          endLng: pickupCoords.longitude
        });
      } else if (driverDetails.status === 2) {
        const end = destCoords || pickupCoords;
        setAnimCoords({
          startLat: pickupCoords.latitude,
          startLng: pickupCoords.longitude,
          endLat: end.latitude,
          endLng: end.longitude
        });
      }

      Animated.timing(driverMarkerAnim, {
        toValue: 1,
        duration: 12000, // 12 segundos para a simulação de movimento
        useNativeDriver: false
      }).start();
    }
  }, [driverDetails?.status, pickupCoords, destCoords]);

  useEffect(() => {
    if (isSearchingDriver) {
      Animated.loop(
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
      ).start();

      Animated.loop(
        Animated.timing(carouselAnim, {
          toValue: 2,
          duration: 4000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      pulseAnim.stopAnimation();
      carouselAnim.stopAnimation();
    }
  }, [isSearchingDriver]);

  useEffect(() => {
    // Animação contínua do sensor (Ping... Ping... realístico)
    Animated.loop(
      Animated.sequence([
        Animated.timing(sensorAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(sensorAnim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        Animated.delay(1200),
      ])
    ).start();
  }, []);

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
  const pollingInterval = useRef(null);

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
    fetchRecent();
  }, []);

  /** GPS + endereço de embarque (obrigatório para calcular custos / categorias como no monólito) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) {
            setPickupCoords(DEFAULT_PICKUP_COORDS);
            setPickup('Ative a localização para um embarque mais preciso.');
          }
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setPickupCoords(coords);
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            ...coords,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 1000);
        }
        setPickup('Carregando endereço...');
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}`;
          const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_USER_AGENT } });
          const j = await res.json();
          if (!cancelled && j?.display_name) {
            setPickup(j.display_name);
          } else if (!cancelled) {
            setPickup('Localização atual');
          }
        } catch {
          if (!cancelled) setPickup('Localização atual');
        }
      } catch (e) {
        console.warn('GPS passageiro:', e);
        if (!cancelled) {
          setPickupCoords(DEFAULT_PICKUP_COORDS);
          setPickup('Não foi possível obter o GPS. Usando região padrão.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Autocomplete de endereço ao digitar (Nominatim; web monólito usava Google Places) */
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
        let list = [];
        try {
          const r = await api.passenger.searchAddresses(
            q,
            pickupCoords?.latitude,
            pickupCoords?.longitude
          );
          const raw = r?.data;
          list = Array.isArray(raw) ? raw : [];
        } catch (e) {
          console.warn('app/busca_endereco.php (faça deploy do PHP ou use fallback):', e?.message || e);
        }
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

  const startPolling = (id) => {
    if (pollingInterval.current) clearInterval(pollingInterval.current);
    
    let mockStep = 0;

    const processStatus = (status, motorista) => {
      // Se status for 1 (Aceito)
      if (status == 1 && motorista) {
        if (!driverDetails || driverDetails.status !== 1) {
          playStatusSound();
          setDriverDetails({
            id: motorista.id,
            nome: motorista.nome,
            veiculo: motorista.veiculo,
            placa: motorista.placa,
            foto: motorista.foto,
            rating: motorista.rating,
            coords: {
              latitude: parseFloat(motorista.latitude),
              longitude: parseFloat(motorista.longitude)
            },
            tempo: motorista.tempo_chegada,
            status: 1
          });
          setIsSearchingDriver(false);
        }
      }
      
      if (status == 2 && driverDetails?.status !== 2) {
         playStatusSound();
         LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
         setDriverDetails(prev => ({ ...prev, status: 2, tempo: 'Aguardando passageiro no local' }));
      }

      if (status == 3 && driverDetails?.status !== 3) {
         playStatusSound();
         LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
         setDriverDetails(prev => ({ ...prev, status: 3, tempo: 'Em viagem ao destino' }));
      }

      if (status == 4) {
        stopPolling();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDriverDetails(null);
        setIsSearchingDriver(false);
        setShowSummary(true);
      }

      if (status == 5) {
        stopPolling();
        Alert.alert('Cancelada', 'A corrida foi cancelada.');
        toggleSelection();
      }
    };

    pollingInterval.current = setInterval(async () => {
      try {
        const session = await getSession();
        if (!session) {
          stopPolling();
          return;
        }

        if (api.isMockEnabled()) {
           mockStep++;
           let simStatus = 1;
           if (mockStep > 6) simStatus = 3;
           else if (mockStep > 3) simStatus = 2;
           processStatus(simStatus, api.getMockStatus().motorista);
        } else {
           const response = await api.passenger.getStatus(session.telefone, session.senha, id);
           if (response.data) {
             processStatus(response.data.status, response.data.motorista);
           }
        }
      } catch (e) {
        console.error('Polling error:', e.message);
        // Se a sessão expirou no backend, paramos o polling e avisamos o usuário
        if (e.message.includes('Sessão expirada')) {
          stopPolling();
          Alert.alert('Sessão Expirada', 'Por favor, faça login novamente.');
          navigation.navigate('PassengerLogin');
        }
      }
    }, 5000);
  };

  useFocusEffect(
    useCallback(() => {
      if (!route.params?.resumeActiveRide) return;
      navigation.setParams({ resumeActiveRide: undefined });
      (async () => {
        try {
          const session = await getSession();
          if (!session?.telefone) return;
          const response = await api.passenger.getStatus(session.telefone, session.senha);
          const d = response.data;
          if (!d || d.status === undefined) return;
          const sid = d.id;
          if (!sid) return;
          setRideId(sid);
          if (d.lat_ini != null && d.lng_ini != null) {
            setPickupCoords({
              latitude: parseFloat(String(d.lat_ini).replace(',', '.')),
              longitude: parseFloat(String(d.lng_ini).replace(',', '.')),
            });
          }
          if (d.lat_fim != null && d.lng_fim != null) {
            setDestCoords({
              latitude: parseFloat(String(d.lat_fim).replace(',', '.')),
              longitude: parseFloat(String(d.lng_fim).replace(',', '.')),
            });
          }
          setPickup('Embarque');
          setDestination('Destino');
          if (d.status === 0) {
            setIsSelecting(false);
            setIsSearchingDriver(true);
            startPolling(sid);
          } else if (d.status >= 1 && d.status <= 3 && d.motorista) {
            setIsSelecting(false);
            setIsSearchingDriver(false);
            const m = d.motorista;
            setDriverDetails({
              id: m.id,
              nome: m.nome,
              veiculo: m.veiculo,
              placa: m.placa,
              foto: m.foto,
              rating: m.rating,
              coords: {
                latitude: parseFloat(m.latitude),
                longitude: parseFloat(m.longitude),
              },
              tempo: m.tempo_chegada,
              status: d.status,
            });
            startPolling(sid);
          } else if (d.status === 4) {
            setIsSelecting(false);
            setIsSearchingDriver(false);
            setDriverDetails(null);
            setShowSummary(true);
          } else if (d.status === 5) {
            Alert.alert('Corrida', 'Esta corrida foi cancelada.');
          }
        } catch (e) {
          console.warn('Retomar corrida:', e);
        }
      })();
    }, [route.params?.resumeActiveRide, navigation])
  );

  const handleCancelRide = async () => {
    // Verifica se a corrida já foi aceita há algum tempo (ex: 5 minutos)
    // Para simplificar, vamos assumir que se o status for > 1 (Aceita/Em curso), 
    // verificamos o tempo. Aqui usaremos um aviso padrão conforme solicitado.
    
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
          onPress: async () => {
             setLoading(true);
             try {
               const session = await getSession();
               if (!session) throw new Error('Sessão não encontrada');
               await api.passenger.cancelRide(session.telefone, session.senha);
               playStatusSound(); 
               toggleSelection();
               Alert.alert('Cancelada', 'Sua corrida foi cancelada.');
             } catch (e) {
               Alert.alert('Erro', 'Não foi possível cancelar a corrida.');
             } finally {
               setLoading(false);
             }
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
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) throw new Error('Sessão não encontrada');
      await api.passenger.rateRide({
        telefone: session.telefone,
        senha: session.senha,
        corrida_id: rideId,
        nota: ratingValue,
        comentario: ratingComment
      });
      setShowRating(false);
      toggleSelection();
      Alert.alert('Obrigado!', 'Sua avaliação foi enviada com sucesso.');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível enviar a avaliação.');
    } finally {
      setLoading(false);
    }
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  const selectDestination = async (loc) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setDestination(loc.title);
      setDestCoords(loc.coords);
      setIsNoDestination(false);
      setIsChoosingDestination(false);
      setIsSelecting(true); // Garante que o painel de seleção abra
      setRoutePoints([]); 
      
      // Chama o cálculo
      loadCategories(loc.coords);
    } catch (e) {
      console.error('Erro na seleção de destino:', e);
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

  const loadCategories = async (targetCoords = destCoords, forceNoDestination = false) => {
    const noDestinationMode = forceNoDestination || isNoDestination;
    const effectiveTarget = targetCoords || (noDestinationMode ? pickupCoords : null);
    if (!pickupCoords) {
      Alert.alert(
        'Localização',
        'Ainda estamos obtendo sua posição. Ative a localização ou aguarde um instante e tente de novo.'
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
        effectiveTarget.longitude
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
      const payload = {
        telefone: session.telefone,
        senha: session.senha,
        valor: finalPriceStr,
        forma_pagamento: paymentMethod.label,
        endereco_ini: pickup,
        endereco_fim: isNoDestination ? 'Sem Destino (A combinar)' : destination,
        categoria_id: selectedCat,
        lat_ini: pickupCoords.latitude,
        lng_ini: pickupCoords.longitude,
        lat_fim: finalDestCoords.latitude,
        lng_fim: finalDestCoords.longitude,
        km: rideDetails.distance,
        tempo: rideDetails.time,
        taxa: finalPriceStr,
        obs: '',
        cupom: appliedCoupon || '',
      };

      const response = await api.passenger.requestRide(payload);

      if (response && response.data && (response.data.status === 'ok' || response.data.status === 'sucesso' || response.data.id || response.data.id_corrida)) {
        const newRideId = response.data.id_corrida || response.data.id || 999;
        
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setRideId(newRideId);
        setIsSelecting(false);
        setIsSearchingDriver(true);
        playStatusSound(); // Bipe ao começar procurar
        
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
    return () => stopPolling();
  }, []);

  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const toggleSelection = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    stopPolling();
    setRideId(null);
    setIsSelecting(false);
    setIsSelectingPayment(false);
    setIsSearchingDriver(false);
    setDriverDetails(null);
    setDestination('');
    setDestCoords(null);
    setIsNoDestination(false);
    setRoutePoints([]);
    setRideDetails({ distance: 0, time: 0, arrivalTime: 0 });
  };

  const renderMap = () => {
    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: '#eef2f3', justifyContent: 'center', alignItems: 'center' }}>
          <Icon name="map" size={120} color="#cbd5e0" />
          <Text style={{ color: '#718096', marginTop: 15, fontSize: 18, fontWeight: '500' }}>Mapa Interativo (99 Style Mock)</Text>
        </View>
      );
    }

    const mapCenter = pickupCoords || DEFAULT_PICKUP_COORDS;

    return (
      <MapView 
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: mapCenter.latitude,
          longitude: mapCenter.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {pickupCoords && (
        <Marker coordinate={pickupCoords} zIndex={10}>
           <View style={{ alignItems: 'center' }}>
             <MapLabel style={{ marginBottom: 6 }} activeOpacity={0.9} onPress={() => setIsChoosingDestination(true)}>
                <View style={{ marginRight: 8 }}>
                  <LabelText>{driverDetails ? 'Local de Embarque' : isSelecting ? ((categories.find(c => c.id === selectedCat)?.motorista_tempo || '--') + ' min') : 'Onde você está?'}</LabelText>
                  <AddressLabelText numberOfLines={1}>{(pickup || '').split('(')[0].trim()}</AddressLabelText>
                </View>
                <Icon name="chevron-right" size={14} color="#ccc" />
             </MapLabel>
             <View style={{ width: 14, height: 14, backgroundColor: '#2ecc71', borderRadius: 7, borderWidth: 3, borderColor: '#fff' }} />
           </View>
        </Marker>
        )}

        {destCoords && (
          <>
            <Polyline 
              coordinates={routePoints}
              strokeColor={colors.primary}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
              geodesic={true}
            />
            {/* Renderizar motoristas ao redor se não estiver em corrida */}
            {!driverDetails && !isSearchingDriver && nearbyDrivers.map((driver) => (
              <Marker
                key={driver.id}
                coordinate={{
                  latitude: parseFloat(driver.latitude),
                  longitude: parseFloat(driver.longitude)
                }}
                title={`Motorista #${driver.id}`}
              >
                <View style={{ 
                  backgroundColor: '#fff', 
                  padding: 5, 
                  borderRadius: 20, 
                  borderWidth: 1, 
                  borderColor: colors.primary,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25,
                  shadowRadius: 3.84,
                  elevation: 5
                }}>
                  <Icon name="directions-car" size={24} color={colors.primary} />
                </View>
              </Marker>
            ))}
            
            <Marker coordinate={destCoords} zIndex={11}>
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
                      <Icon name="search" size={14} color="#ccc" />
                   </MapLabel>
                 )}
               </View>
            </Marker>
          </>
        )}

        {driverDetails && (
          <AnimatedMarker 
            coordinate={{
              latitude: driverMarkerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [animCoords.startLat, animCoords.endLat]
              }),
              longitude: driverMarkerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [animCoords.startLng, animCoords.endLng]
              })
            }} 
            zIndex={20}
          >
             <View style={{ width: 44, height: 44, backgroundColor: '#fff', borderRadius: 22, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: {width:0, height:3}, shadowOpacity: 0.3, shadowRadius: 4, borderWidth: 2, borderColor: colors.primary }}>
                <Icon name={(categories.find(c => c.id === selectedCat)?.nome || '').toLowerCase().includes('moto') ? 'motorcycle' : 'directions-car'} size={24} color={colors.primary} />
             </View>
          </AnimatedMarker>
        )}

        {!isSearchingDriver && !driverDetails && Array.isArray(nearbyDrivers) && nearbyDrivers.map(dr => (
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

  return (
    <Container>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {isChoosingDestination && (
        <DestinationOverlay>
          <SearchHeaderScroll>
            <TouchableOpacity
              onPress={() => {
                setIsChoosingDestination(false);
                setDestSearchText('');
                setDestSearchResults([]);
              }}
            >
              <Icon name="arrow-back" size={30} color={colors.text} />
            </TouchableOpacity>
            <SearchInput
              autoFocus
              placeholder="Rua, número, bairro, cidade..."
              value={destSearchText}
              onChangeText={setDestSearchText}
              returnKeyType="search"
            />
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
                  <Text style={{ fontSize: 16, fontWeight: '900', color: colors.secondary }}>Sem Destino / Taxímetro</Text>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>O valor será calculado durante a viagem</Text>
                </View>
                <Icon name="chevron-right" size={24} color={colors.primary} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#999', marginBottom: 8, marginTop: 8 }}>
                RESULTADOS
              </Text>
              {destSearchLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
              ) : destSearchText.trim().length < 3 ? (
                <Text style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>
                  Digite pelo menos 3 caracteres para buscar endereços no Brasil.
                </Text>
              ) : destSearchResults.length === 0 ? (
                <Text style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>
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
                      <Icon name="place" size={20} color="#666" />
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

              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#999', marginBottom: 10, marginTop: 16 }}>
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
                      <Icon name="history" size={20} color="#666" />
                    </ResultIcon>
                    <ResultTextContainer>
                      <ResultTitle numberOfLines={2}>{loc.title}</ResultTitle>
                      <ResultSubtitle numberOfLines={1}>{loc.subtitle}</ResultSubtitle>
                    </ResultTextContainer>
                  </SearchResultItem>
                ))
              ) : (
                <Text style={{ color: '#ccc', fontSize: 13 }}>Nenhuma viagem recente.</Text>
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
            <Icon name={(isSelecting || isSelectingPayment) ? "arrow-back" : "menu"} size={28} color={colors.secondary} />
          </IconButton>
          
          {!isSelecting && !isSearchingDriver && !driverDetails && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 30, padding: 3, elevation: 20, shadowColor: '#000', shadowOffset: {width:0, height:6}, shadowOpacity: 0.25, shadowRadius: 15, borderWidth: 1, borderColor: '#f0f0f0' }}>
              <IconButton onPress={() => navigation.navigate('HistoryScreen')} style={{ width: 36, height: 36, elevation: 0, shadowOpacity: 0, backgroundColor: 'transparent' }}>
                <Icon name="history" size={18} color={colors.secondary} />
              </IconButton>
              
              <View style={{ width: 1, height: 14, backgroundColor: '#eee', alignSelf: 'center' }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 4 }}>
                {cityData && cityData.cidade && (
                   <Text style={{ fontSize: 8.5, fontWeight: '900', color: colors.primary, marginRight: 0, letterSpacing: 1.2 }}>
                     {cityData.cidade.toString().toUpperCase()}
                   </Text>
                )}

                <IconButton onPress={() => navigation.navigate('WalletScreen')} style={{ width: 36, height: 36, elevation: 0, shadowOpacity: 0, backgroundColor: 'transparent' }}>
                  <Icon name="account-balance-wallet" size={18} color={colors.secondary} />
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
        backgroundColor: '#fff', 
        zIndex: 10001, 
        transform: [{ translateX: menuAnim }],
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        borderRightWidth: 1,
        borderRightColor: '#f1f5f9',
      }]}>
          <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', marginBottom: 20 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' }}>
               <Icon name="person" size={40} color={colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.secondary }}>{user.nome}</Text>
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
                <Text style={{ fontSize: 16, color: colors.secondary }}>{item.title}</Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={{ marginTop: 'auto', marginBottom: 20, flexDirection: 'row', alignItems: 'center', padding: 15, paddingHorizontal: 20 }} onPress={async () => {
             await clearSession();
             navigation.navigate('PassengerLogin');
          }}>
             <Icon name="exit-to-app" size={24} color="#f44" />
             <Text style={{ fontSize: 16, color: '#f44', marginLeft: 15 }}>Sair</Text>
          </TouchableOpacity>
      </Animated.View>

      {showSummary && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000, justifyContent: 'center', padding: 20 }]}>
           <View style={{ backgroundColor: '#fff', borderRadius: 30, padding: 30, alignItems: 'center' }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
                 <Icon name="check" size={36} color="#fff" />
              </View>
              <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#1f2120', textAlign: 'center' }}>Viagem Finalizada!</Text>
              <Text style={{ fontSize: 16, color: '#777', marginTop: 8, textAlign: 'center' }}>Esperamos que tenha tido uma excelente experiência com a UbeZap.</Text>
              
              <View style={{ width: '100%', backgroundColor: '#f9f9f9', borderRadius: 20, padding: 20, marginVertical: 30 }}>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: '#888' }}>Total Pago</Text>
                    <Text style={{ fontWeight: 'bold', color: colors.primary, fontSize: 18 }}>
                      R$ {selectedCat ? (categories.find(c => c.id === selectedCat)?.taxa || categories.find(c => c.id === selectedCat)?.valor || '0,00').toString().replace('.', ',') : '0,00'}
                    </Text>
                 </View>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                    <Text style={{ color: '#888' }}>Distância</Text>
                    <Text style={{ fontWeight: '600' }}>{rideDetails.distance} km</Text>
                 </View>
                 <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: '#888' }}>Destino</Text>
                    <Text style={{ fontWeight: '600', flex: 0.8, textAlign: 'right' }}>{destination}</Text>
                 </View>
              </View>

              <TouchableOpacity 
                onPress={() => { setShowSummary(false); setShowRating(true); }}
                style={{ backgroundColor: colors.primary, width: '100%', height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>AVALIAR MOTORISTA</Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => { setShowSummary(false); toggleSelection(); }} style={{ marginTop: 20 }}>
                 <Text style={{ color: '#aaa', fontSize: 14 }}>Fechar sem avaliar</Text>
              </TouchableOpacity>
           </View>
        </View>
      )}

      {showRating && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 2000, justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
           <View style={{ backgroundColor: '#fff', width: '100%', borderRadius: 25, padding: 25, alignItems: 'center' }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f9f9f9', justifyContent: 'center', alignItems: 'center', marginBottom: 15 }}>
                 <Image source={{ uri: api.getImageUrl(driverDetails?.foto) }} style={{ width: 70, height: 70, borderRadius: 35 }} />
              </View>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#333' }}>Como foi sua viagem?</Text>
              <Text style={{ fontSize: 16, color: '#666', marginTop: 5, marginBottom: 20 }}>Avalie {driverDetails?.nome}</Text>
              
              <View style={{ flexDirection: 'row', marginBottom: 25 }}>
                 {[1, 2, 3, 4, 5].map((star) => (
                   <TouchableOpacity key={star} onPress={() => setRatingValue(star)}>
                      <Icon name="star" size={40} color={star <= ratingValue ? "#f5b041" : "#e0e0e0"} />
                   </TouchableOpacity>
                 ))}
              </View>

              <TextInput 
                placeholder="Deixe um comentário (opcional)"
                multiline
                numberOfLines={3}
                value={ratingComment}
                onChangeText={setRatingComment}
                style={{ width: '100%', backgroundColor: '#f5f5f5', borderRadius: 12, padding: 15, fontSize: 16, textAlignVertical: 'top', marginBottom: 25 }}
              />

              <TouchableOpacity 
                disabled={loading}
                onPress={handleSendRating}
                style={{ backgroundColor: colors.primary, width: '100%', height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center', opacity: loading ? 0.7 : 1 }}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>ENVIAR AVALIAÇÃO</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity onPress={() => { setShowRating(false); toggleSelection(); }} style={{ marginTop: 15 }}>
                 <Text style={{ color: '#999', fontSize: 14 }}>Pular agora</Text>
              </TouchableOpacity>
           </View>
        </View>
      )}

      <BottomSheet expanded={isSelecting || isSearchingDriver || !!driverDetails}>
        <Handle />
        <ContentPadding>
          {driverDetails ? (
            <View style={{ paddingVertical: 5 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                 <Text style={{ fontSize: 20, fontWeight: '900', color: colors.secondary }}>{rideStatus === '3' ? 'Viagem em curso' : 'Motorista a caminho'}</Text>
                 <View style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 }}>
                    <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 14 }}>{driverDetails.tempo || 'N/A'}</Text>
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

              <TouchableOpacity 
                  activeOpacity={0.8} 
                  onPress={() => navigation.navigate('DriverProfileScreen', { driver: driverDetails })}
                  style={{ backgroundColor: '#f9f9f9', padding: 15, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#eee', overflow: 'hidden' }}>
                  
                  <Image source={{ uri: api.getImageUrl(driverDetails.img_frente || 'https://www.uber-assets.com/image/upload/f_auto,q_auto:eco,c_fill,w_956,h_637/v1555355171/assets/39/c46522-598d-442b-9441-2f22b784a0d9/original/UberX.png') }} 
                         style={{ width: '100%', height: 120, borderRadius: 15, marginBottom: 15 }} 
                         resizeMode="cover" />

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={{ uri: api.getImageUrl(driverDetails.foto) }} style={{ width: 50, height: 50, borderRadius: 25, marginRight: 15 }} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>{driverDetails.nome}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Icon name="star" size={16} color="#f5b041" />
                            <Text style={{ fontSize: 14, color: '#666', marginLeft: 4 }}>{driverDetails.rating}</Text>
                        </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ backgroundColor: '#1a1c1e', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, marginBottom: 4 }}>
                            <Text style={{ fontSize: 15, fontWeight: 'bold', color: colors.primary, letterSpacing: 1 }}>{driverDetails.placa}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: '#666' }}>{driverDetails.veiculo}</Text>
                    </View>
                  </View>
               </TouchableOpacity>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                 <TouchableOpacity 
                   onPress={handleCancelRide}
                   style={{ width: 60, backgroundColor: '#ffebee', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                    <Icon name="close" size={24} color="#E53935" />
                 </TouchableOpacity>
                 <TouchableOpacity 
                    onPress={() => navigation.navigate('ChatScreen', { rideId: rideId, isDriver: false, otherUser: driverDetails })}
                    style={{ flex: 1, backgroundColor: colors.primary, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' }}>
                     <Icon name="chat" size={20} color="#fff" style={{ marginRight: 8 }} />
                     <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>MENSAGEM</Text>
                  </TouchableOpacity>
                 <TouchableOpacity style={{ width: 60, backgroundColor: '#f0f0f0', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: 10 }}>
                    <Icon name="call" size={24} color="#333" />
                 </TouchableOpacity>
              </View>
            </View>
          ) : isSearchingDriver ? (
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 25, color: '#333' }}>Procurando motoristas...</Text>
              
              <View style={{ width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginBottom: 25 }}>
                <PulseCircle style={{ transform: [{ scale: pulseScale }], opacity: pulseOpacity }} />
                <View style={{ width: 70, height: 70, backgroundColor: '#fff', borderRadius: 35, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: colors.primary, shadowOffset: {width:0, height:4}, shadowOpacity: 0.5, shadowRadius: 6, overflow: 'hidden' }}>
                   <Animated.View style={{ position: 'absolute', opacity: carOpacity, transform: [{ translateX: carTranslateX }] }}>
                     <Icon name="directions-car" size={36} color={colors.primary} />
                   </Animated.View>
                   <Animated.View style={{ position: 'absolute', opacity: motoOpacity, transform: [{ translateX: motoTranslateX }] }}>
                     <Icon name="motorcycle" size={36} color={colors.primary} />
                   </Animated.View>
                </View>
              </View>
              
              <View style={{ alignSelf: 'stretch', backgroundColor: '#f9f9f9', padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#f0f0f0' }}>
                 <Text style={{ fontSize: 14, color: '#333', fontWeight: 'bold', marginBottom: 5 }}>Distância: {rideDetails.distance} km • Tempo: {rideDetails.time} min</Text>
                 <Text style={{ fontSize: 12, color: '#666' }}>{pickup.split('(')[0].trim()} ➔ {destination}</Text>
                 <Text style={{ fontSize: 13, color: colors.primary, fontWeight: 'bold', marginTop: 8 }}>
                    Custo: R$ {(categories.find(c => c.id === selectedCat)?.taxa || categories.find(c => c.id === selectedCat)?.valor || '--').toString().replace('.', ',')}
                 </Text>
              </View>

              <TouchableOpacity 
                onPress={() => setIsSearchingDriver(false)}
                activeOpacity={0.8}
                style={{ width: '100%', height: 50, borderRadius: 25, backgroundColor: '#ffebee', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#d32f2f', fontSize: 16, fontWeight: 'bold' }}>CANCELAR BUSCA</Text>
              </TouchableOpacity>
            </View>
          ) : isSelectingPayment ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 20 }}>Pagamento</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {paymentOptions.map((opt) => (
                  <TouchableOpacity key={opt.id} onPress={() => { setPaymentMethod(opt); setIsSelectingPayment(false); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                    <Icon name={opt.icon} size={28} color={paymentMethod.id === opt.id ? "#f39c12" : "#aaa"} />
                    <Text style={{ flex: 1, marginLeft: 15, fontSize: 16 }}>{opt.label}</Text>
                    {paymentMethod.id === opt.id && <Icon name="check-circle" size={24} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : isSelecting ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold' }}>Opções de Viagem</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Icon name="timer" size={14} color="#999" />
                  <Text style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>{rideDetails.time} min • {rideDetails.distance} km</Text>
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
                        backgroundColor: selectedCat === cat.id ? '#f8fafc' : 'transparent'
                      }}
                    >
                      <View style={{ width: 55, height: 55, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 2 }}>
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
                          <CategoryName style={{ fontSize: 16, color: colors.secondary }}>{cat.nome}</CategoryName>
                          {(cat.dinamico_mapa_ini || cat.dinamico_mapa_fim || cat.dinamico_horarios) && (
                              <View style={{ backgroundColor: '#fff3e0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginLeft: 10 }}>
                                  <Text style={{ color: '#ef6c00', fontSize: 10, fontWeight: '800' }}>⚡ ALTA DEMANDA</Text>
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
                          color: (appliedCoupon && selectedCat === cat.id) ? '#94a3b8' : colors.secondary,
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
                style={{ opacity: loading ? 0.7 : 1, marginTop: 15 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: colors.white, fontSize: 18, fontWeight: 'bold' }}>
                    CONFIRMAR {categories.find(c => c.id === selectedCat)?.nome?.toString().toUpperCase() || 'VIAGEM'}
                  </Text>
                )}
              </ConfirmButton>
            </>
          ) : (
            <>
              {banners.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }}>
                    {banners.map((b, i) => (
                      <TouchableOpacity key={b.id || i} style={{ marginLeft: i === 0 ? 20 : 10, marginRight: i === banners.length - 1 ? 20 : 0 }}>
                        <Image 
                          source={{ uri: api.getImageUrl(b.img) }} 
                          style={{ width: 300, height: 120, borderRadius: 15 }} 
                          resizeMode="cover"
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
      </BottomSheet>
    </Container>
  );
};

export default HomeScreen;
