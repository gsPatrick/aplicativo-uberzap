import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import Icon from '../../components/AppIcon';
import Constants from 'expo-constants';
import { colors } from '../../theme/tokens';
import { getSession } from '../../utils/session';
import {
  subscribeRideRequest,
  acceptRideRequest,
  declineRideRequest,
  dismissRideRequest,
} from '../../services/rideRequestController';
import { RIDE_REQUEST_TIMEOUT_MS } from '../../services/rideNotification';
import driverRideMonitor from '../../services/driverRideMonitor';
import { startRideAlertSound, stopRideAlertSound } from '../../utils/rideAlertSound';
import { wakeScreenForRideAlert } from '../../utils/androidOverlay';

const IS_EXPO_GO = Constants?.appOwnership === 'expo';
const TIMER_SECONDS = Math.round(RIDE_REQUEST_TIMEOUT_MS / 1000);

const PAYMENT_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Carteira / Cartão',
};

function Stars({ rating }) {
  const r = Math.min(5, Math.max(0, Math.round(Number(rating) || 5)));
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          size={16}
          color={star <= r ? '#fbbf24' : '#243049'}
        />
      ))}
      <Text style={styles.ratingText}>{Number(rating || 5).toFixed(1)}</Text>
    </View>
  );
}

export default function RideRequestScreen({ navigationRef }) {
  const [visible, setVisible] = useState(false);
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const sessionRef = useRef(null);
  const rejectedRef = useRef([]);

  const closeModal = useCallback(async (rideId, declined = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopRideAlertSound();
    if (declined && rideId && sessionRef.current?.id) {
      rejectedRef.current = await declineRideRequest(
        { rideId, rawRide: ride?.rawRide },
        sessionRef.current.id,
        rejectedRef.current
      );
    } else if (rideId) {
      await dismissRideRequest(rideId);
    }
    setVisible(false);
    setRide(null);
    setSecondsLeft(TIMER_SECONDS);
    progressAnim.setValue(1);
  }, [progressAnim, ride?.rawRide]);

  const startTimer = useCallback(
    (currentRide) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setSecondsLeft(TIMER_SECONDS);
      progressAnim.setValue(1);

      Animated.timing(progressAnim, {
        toValue: 0,
        duration: RIDE_REQUEST_TIMEOUT_MS,
        useNativeDriver: false,
      }).start();

      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            closeModal(currentRide?.rideId, true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [closeModal, progressAnim]
  );

  const openRide = useCallback(
    (incoming) => {
      if (!incoming?.rideId) return;
      if (driverRideMonitor.isRideBlocked(incoming.rideId)) return;
      setRide(incoming);
      setVisible(true);
      wakeScreenForRideAlert().catch(() => {});
      if (!loading) startRideAlertSound().catch(() => {});
      startTimer(incoming);
    },
    [loading, startTimer]
  );

  useEffect(() => {
    getSession().then((s) => {
      sessionRef.current = s;
    });

    const unsub = subscribeRideRequest((event, payload) => {
      if (event === 'show' && payload) {
        openRide(payload);
      }
      if (event === 'hide') {
        setVisible(false);
        setRide(null);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    });

    return () => {
      unsub();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [openRide]);

  const handleAccept = async () => {
    if (!ride?.rideId || loading) return;
    setLoading(true);
    try {
      const session = sessionRef.current || (await getSession());
      sessionRef.current = session;
      if (!session?.id) {
        Alert.alert('Erro', 'Faça login novamente.');
        return;
      }

      const result = await acceptRideRequest(ride, {
        sessionId: session.id,
        cidadeId: session.cidade_id || ride.cidadeId || 1,
        rejectedRides: rejectedRef.current,
      });

      if (timerRef.current) clearInterval(timerRef.current);
      setVisible(false);
      setRide(null);
      stopRideAlertSound();

      if (result.ok && navigationRef?.current) {
        navigationRef.current.navigate('Taximeter', { ride: result.rideData });
      } else {
        Alert.alert(
          'Corrida indisponível',
          result.error || 'Esta corrida já foi aceita ou cancelada.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    if (!ride?.rideId || loading) return;
    closeModal(ride.rideId, true);
  };

  if (Platform.OS !== 'android' || IS_EXPO_GO) {
    return null;
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const paymentKey = ride?.paymentMethod || 'dinheiro';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={handleDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.timerBarTrack}>
            <Animated.View style={[styles.timerBarFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.timerLabel}>{secondsLeft}s para aceitar</Text>

          <Text style={styles.title}>Nova corrida</Text>

          <View style={styles.passengerRow}>
            <View style={styles.avatar}>
              <Icon name="person" size={28} color={colors.primary} />
            </View>
            <View style={styles.passengerInfo}>
              <Text style={styles.passengerName}>{ride?.passengerName || 'Passageiro'}</Text>
              <Stars rating={ride?.passengerRating} />
            </View>
          </View>

          <View style={styles.routeBlock}>
            <View style={styles.routeRow}>
              <Text style={styles.routeIcon}>📍</Text>
              <Text style={styles.routeText} numberOfLines={2}>
                {ride?.pickupAddress || 'Embarque'}
              </Text>
            </View>
            <View style={styles.routeDivider} />
            <View style={styles.routeRow}>
              <Text style={styles.routeIcon}>🏁</Text>
              <Text style={styles.routeText} numberOfLines={2}>
                {ride?.dropoffAddress || 'Destino'}
              </Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Icon name="straighten" size={18} color="#64748b" />
              <Text style={styles.metricText}>
                {(ride?.distanceKm ?? 0).toFixed(1)} km
              </Text>
            </View>
            <View style={styles.metric}>
              <Icon name="schedule" size={18} color="#64748b" />
              <Text style={styles.metricText}>{ride?.estimatedMinutes ?? '--'} min</Text>
            </View>
            <View style={styles.metric}>
              <Icon name="payments" size={18} color="#64748b" />
              <Text style={styles.metricText}>
                {PAYMENT_LABELS[paymentKey] || 'Pagamento'}
              </Text>
            </View>
          </View>

          <Text style={styles.price}>
            R$ {(ride?.price ?? 0).toFixed(2).replace('.', ',')}
          </Text>

          <TouchableOpacity
            style={[styles.acceptBtn, loading && styles.btnDisabled]}
            onPress={handleAccept}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptText}>ACEITAR</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.declineBtn}
            onPress={handleDecline}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.declineText}>Recusar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#131C2E',
    borderRadius: 24,
    padding: 22,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  timerBarTrack: {
    height: 4,
    backgroundColor: '#243049',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  timerBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  timerLabel: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(34,197,94,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  passengerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  passengerName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 2,
  },
  ratingText: {
    marginLeft: 6,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  routeBlock: {
    backgroundColor: '#1B2740',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 1,
  },
  routeText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  routeDivider: {
    height: 1,
    backgroundColor: '#243049',
    marginVertical: 10,
    marginLeft: 26,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.primary,
    textAlign: 'center',
    marginVertical: 12,
  },
  acceptBtn: {
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  acceptText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  declineBtn: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
