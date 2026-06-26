import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { getSession } from './src/utils/session';
import { ActivityIndicator, View, AppState } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './src/services/api';
import ErrorBoundary from './src/components/ErrorBoundary';
import driverRideMonitor, { getDriverMonitorStateForBackground } from './src/services/driverRideMonitor';
import passengerRideMonitor, { getPassengerMonitorStateForBackground } from './src/services/passengerRideMonitor';
import {
  registerForPushNotificationsAsync,
  setupRideAlertCategory,
  triggerRideAlertNotification,
  cancelRideAlertNotification,
} from './src/utils/notifications';
import { wakeScreenForRideAlert, refreshOverlayPermissionState } from './src/utils/androidOverlay';
import { startRideAlertSound, stopRideAlertSound, isRideAlertSoundPlaying } from './src/utils/rideAlertSound';
import { startRideForegroundService } from './src/services/rideForegroundService';
import { syncPushTokenWithServer } from './src/services/pushSync';
import {
  setupRideNotificationChannel,
  listenToRideNotificationActions,
  getInitialRideNotification,
} from './src/services/rideNotification';
import { isPermissionsOnboarded } from './src/utils/driverPermissions';
import { recordRemotePush, rideAlertKey, tripStatusKey } from './src/utils/notificationDedup';
import { registerBackgroundRideNotificationTask } from './src/services/backgroundRideNotification';
import {
  presentRideRequest,
  processPendingRideActions,
  acceptRideRequest,
  declineRideRequest,
} from './src/services/rideRequestController';
import RideRequestScreen from './src/screens/driver/RideRequestScreen';
import NotificationPopup from 'react-native-push-notification-popup';
import * as Notifications from 'expo-notifications';

const appVariant =
  Constants.expoConfig?.extra?.appVariant ||
  process.env.APP_VARIANT ||
  'passenger';

// Screens - Passageiro
import PassengerLoginScreen from './src/screens/passenger/LoginScreen';
import PassengerHomeScreen from './src/screens/passenger/HomeScreen';
import PrincipalScreen from './src/screens/passenger/PrincipalScreen';
import ChatScreen from './src/screens/passenger/ChatScreen';
import DriverProfileScreen from './src/screens/passenger/DriverProfileScreen';
import WalletScreen from './src/screens/passenger/WalletScreen';
import HistoryScreen from './src/screens/passenger/HistoryScreen';
import ProfileScreen from './src/screens/passenger/ProfileScreen';
import SupportScreen from './src/screens/passenger/SupportScreen';
import NotificationScreen from './src/screens/passenger/NotificationScreen';
import ForgotPasswordScreen from './src/screens/passenger/ForgotPasswordScreen';
import PassengerRegisterScreen from './src/screens/passenger/RegisterScreen';

// Screens - Motorista
import DriverHomeScreen from './src/screens/driver/HomeScreen';
import DriverLoginScreen from './src/screens/driver/DriverLoginScreen';
import DriverPermissionsScreen from './src/screens/driver/DriverPermissionsScreen';
import DriverRegisterScreen from './src/screens/driver/DriverRegisterScreen';
import VehicleProfileScreen from './src/screens/driver/VehicleProfileScreen';
import DriverEarningsScreen from './src/screens/driver/DriverEarningsScreen';
import DriverWalletScreen from './src/screens/driver/DriverWalletScreen';
import DriverHistoryScreen from './src/screens/driver/DriverHistoryScreen';
import DriverSupportScreen from './src/screens/driver/DriverSupportScreen';
import DriverDocsScreen from './src/screens/driver/DriverDocsScreen';
import DriverAlertsScreen from './src/screens/driver/DriverAlertsScreen';
import TaximeterScreen from './src/screens/driver/TaximeterScreen';

const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK';

// Tarefa de rastreamento em background — também verifica corridas para motorista online
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  const isExpoGo = Constants?.appOwnership === 'expo';
  if (isExpoGo) {
    return;
  }
  if (error) {
    if (String(error?.code) === '0') return;
    console.error('[Background Task] Erro no rastreamento:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];
    if (location) {
      try {
        const driverId = await AsyncStorage.getItem('driverId');
        if (driverId) {
          const monitorState = await getDriverMonitorStateForBackground();
          const driverStatus = monitorState?.isOnRide
            ? 2
            : (monitorState?.isAvailable ? 1 : 0);

          if (driverStatus !== 0) {
            await api.driver.updateLocation(
              driverId,
              driverStatus,
              location.coords.latitude,
              location.coords.longitude
            );

            if (monitorState?.isAvailable && !monitorState?.isOnRide) {
              const pollSessionId = monitorState.sessionId || driverId;
              if (pollSessionId) {
                await driverRideMonitor.pollFromBackground(
                  pollSessionId,
                  monitorState.cidadeId || 1,
                  monitorState.rejectedRides || []
                );
              }
            }
          }
        }

        // Passageiro: status da corrida em background (foreground service mantém JS vivo)
        const passengerState = await getPassengerMonitorStateForBackground();
        if (passengerState?.rideId && passengerState?.telefone) {
          await passengerRideMonitor.pollFromBackground();
        }
      } catch (err) {
        console.log('[Background Task] Erro ao enviar posição/checar corridas:', err);
      }
    }
  }
});

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

export default function App() {
  const [initialRoute, setInitialRoute] = React.useState(null);
  const popupRef = React.useRef(null);

  // Ícones agora são SVG (src/components/AppIcon via lucide) — não dependem de
  // carregar fonte, então nada de gate de fonte aqui (some a race do Android e
  // o cold start fica mais rápido).

  React.useEffect(() => {
    if (appVariant !== 'driver') return undefined;

    let unsubNotifee = () => {};

    (async () => {
      try {
        await setupRideNotificationChannel();

        const initialRide = await getInitialRideNotification();
        if (initialRide?.rideId) {
          await presentRideRequest(initialRide.rawRide || initialRide);
        }

        unsubNotifee = listenToRideNotificationActions({
        onOpen: (ride) => presentRideRequest(ride.rawRide || ride),
        onAccept: async (ride) => {
          const session = await getSession();
          if (!session?.id) return;
          const result = await acceptRideRequest(ride, {
            sessionId: session.id,
            cidadeId: session.cidade_id || ride.cidadeId || 1,
          });
          if (result.ok && navigationRef.isReady()) {
            navigationRef.navigate('Taximeter', { ride: result.rideData });
          }
        },
        onDecline: async (ride) => {
          const session = await getSession();
          if (session?.id) {
            await declineRideRequest(ride, session.id);
          }
        },
      });
      } catch (e) {
        console.warn('[Notifee] Init:', e?.message);
      }
    })();

    return () => unsubNotifee();
  }, []);

  React.useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && appVariant === 'driver') {
        syncPushTokenWithServer().catch(() => {});
        processPendingRideActions(navigationRef).catch(() => {});
      }
    });

    const receivedSub = Notifications.addNotificationReceivedListener(async (notification) => {
      const { title, body, data } = notification.request.content;
      const isRideAlert = data?.type === 'ride_alert';
      const isTripStatus = data?.type === 'trip_status';
      const rideEndedEvent =
        data?.event === 'ride_unavailable' || data?.event === 'passenger_cancelled';

      // Dedup: registra que o push remoto deste evento chegou, para o polling
      // local não disparar uma 2ª notificação do mesmo evento.
      const isRemotePush = notification.request.trigger?.type === 'push';
      if (isRemotePush && data?.rideId && !rideEndedEvent) {
        if (isRideAlert) recordRemotePush(rideAlertKey(data.rideId));
        else if (isTripStatus && data?.status != null) {
          recordRemotePush(tripStatusKey(data.rideId, data.status));
        }
      }

      if (isRideAlert && rideEndedEvent) {
        await stopRideAlertSound().catch(() => {});
        await cancelRideAlertNotification().catch(() => {});
        return;
      }

      if (isRideAlert) {
        // App ABERTO: o modal interno (monitor com polling) cuida do alerta —
        // não disparar o Notifee aqui para não duplicar. App em 2º plano: busca a
        // corrida e renderiza a notificação rica.
        if (data?.rideId && appVariant === 'driver' && AppState.currentState !== 'active') {
          try {
            const session = await getSession();
            if (session?.id) {
              await driverRideMonitor.pollFromBackground(
                session.id,
                session.cidade_id || 1,
                []
              );
            }
          } catch (e) {
            console.warn('[Push] Erro ao buscar corrida do alerta:', e);
          }
        }
        // Foreground: HomeScreen/showRideAlert cuida do som. Background: um único loop.
        if (AppState.currentState !== 'active' && !isRideAlertSoundPlaying()) {
          await wakeScreenForRideAlert().catch(() => {});
          await startRideAlertSound();
        }
        return;
      }

      if (isTripStatus) {
        if (AppState.currentState !== 'active') {
          await wakeScreenForRideAlert().catch(() => {});
        }
        return;
      }

      if (AppState.currentState === 'active') {
        popupRef.current?.show({
          appIconSource: require('./assets/icon.png'),
          appTitle: 'UbeZap',
          title: title,
          body: body,
          slideOutTime: 8000,
        });
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const { data } = response.notification.request.content;
      if (data?.type === 'ride_alert' && data?.rideId) {
        await wakeScreenForRideAlert().catch(() => {});
        const pending = await driverRideMonitor.getPendingRide();
        if (pending && String(pending.id) === String(data.rideId)) {
          driverRideMonitor.markRideHandled(pending.id);
        }
      }
    });

    return () => {
      appStateSub.remove();
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const resolveInitialRoute = async () => {
      try {
        const session = await getSession();
        const isDriverLogged =
          appVariant === 'driver' && (session?.id || (session?.telefone && session?.senha));
        if (isDriverLogged) {
          // Onboarding de permissões aparece 1x; depois sempre DriverHome.
          const onboarded = await isPermissionsOnboarded();
          return onboarded ? 'DriverHome' : 'DriverPermissions';
        }
        if (session?.telefone && session?.senha) {
          return 'PassengerPrincipal';
        }
        return appVariant === 'driver' ? 'DriverLogin' : 'PassengerLogin';
      } catch {
        return appVariant === 'driver' ? 'DriverLogin' : 'PassengerLogin';
      }
    };

    // Fallback: nunca ficar preso no spinner (GPS/Notifee não podem bloquear a UI)
    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        setInitialRoute((prev) => prev ?? (appVariant === 'driver' ? 'DriverLogin' : 'PassengerLogin'));
      }
    }, 2500);

    (async () => {
      const route = await resolveInitialRoute();
      if (!cancelled) {
        setInitialRoute(route);
      }
      clearTimeout(safetyTimer);

      // Serviços pesados rodam depois que a tela já abriu
      try {
        if (appVariant !== 'driver') {
          await registerForPushNotificationsAsync();
        }
        await setupRideAlertCategory();
        if (appVariant !== 'driver') {
          await syncPushTokenWithServer();
        }
        await refreshOverlayPermissionState().catch(() => {});
      } catch (e) {
        console.warn('Erro ao inicializar permissões de notificação:', e);
      }

      if (appVariant === 'driver') {
        setupRideNotificationChannel().catch(() => {});
        registerBackgroundRideNotificationTask().catch(() => {});
        try {
          await driverRideMonitor.restoreState();
          const session = await getSession();
          if (session?.id) {
            await driverRideMonitor.updateConfig({
              sessionId: session.id,
              cidadeId: session.cidade_id || 1,
              isAvailable: true,
              isOnRide: Boolean(session.activeRideId),
              rejectedRides: [],
            });
            // Foreground service só após UI — evita travar cold start
            if (!session.activeRideId) {
              startRideForegroundService({
                title: 'UbeZap Motorista Online',
                body: 'Monitorando novas solicitações de corrida em segundo plano...',
              }).catch((e) => console.warn('Driver FG restore:', e));
            } else {
              startRideForegroundService({
                title: 'Corrida em Curso',
                body: 'Rastreando posição para o passageiro.',
              }).catch((e) => console.warn('Driver FG restore (ride):', e));
            }
          }
        } catch (e) {
          console.warn('Erro ao restaurar monitor motorista:', e);
        }
      }

      if (appVariant === 'passenger') {
        try {
          await passengerRideMonitor.restoreState();
          const passengerState = await getPassengerMonitorStateForBackground();
          if (passengerState?.rideId && passengerState?.telefone) {
            startRideForegroundService({
              title: 'UbeZap — Corrida ativa',
              body: 'Você receberá avisos sobre motorista e status da viagem',
            }).catch((e) => console.warn('Passenger FG restore:', e));
            await passengerRideMonitor.start(passengerState.rideId, { resume: true }).catch(() => {});
          }
        } catch (e) {
          console.warn('Erro ao restaurar monitor passageiro:', e);
        }
      }

    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, []);

  // Só espera a rota inicial resolver (ícones SVG não precisam de fonte).
  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1220' }}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            if (appVariant === 'driver') {
              processPendingRideActions(navigationRef).catch(() => {});
            }
          }}
        >
          <Stack.Navigator 
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false }}
          >
            {/* Fluxo Passageiro */}
            <Stack.Screen name="PassengerLogin" component={PassengerLoginScreen} />
            <Stack.Screen name="PassengerRegister" component={PassengerRegisterScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="PassengerPrincipal" component={PrincipalScreen} />
            <Stack.Screen name="PassengerHome" component={PassengerHomeScreen} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
            <Stack.Screen name="DriverProfileScreen" component={DriverProfileScreen} />
            <Stack.Screen name="WalletScreen" component={WalletScreen} />
            <Stack.Screen name="HistoryScreen" component={HistoryScreen} />
            <Stack.Screen name="ProfileScreen" component={ProfileScreen} />
            <Stack.Screen name="SupportScreen" component={SupportScreen} />
            <Stack.Screen name="NotificationScreen" component={NotificationScreen} />

            {/* Fluxo Motorista */}
            <Stack.Screen name="DriverLogin" component={DriverLoginScreen} />
            <Stack.Screen name="DriverPermissions" component={DriverPermissionsScreen} />
            <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
            <Stack.Screen name="DriverRegister" component={DriverRegisterScreen} />
            <Stack.Screen name="VehicleProfile" component={VehicleProfileScreen} />
            <Stack.Screen name="DriverEarnings" component={DriverEarningsScreen} />
            <Stack.Screen name="DriverWallet" component={DriverWalletScreen} />
            <Stack.Screen name="DriverHistory" component={DriverHistoryScreen} />
            <Stack.Screen name="DriverSupport" component={DriverSupportScreen} />
            <Stack.Screen name="DriverDocs" component={DriverDocsScreen} />
            <Stack.Screen name="DriverAlerts" component={DriverAlertsScreen} />
            <Stack.Screen name="Taximeter" component={TaximeterScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        {appVariant === 'driver' ? (
          <RideRequestScreen navigationRef={navigationRef} />
        ) : null}
        <NotificationPopup ref={popupRef} />
      </View>
    </ErrorBoundary>
  );
}
