import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RIDE_ALERT_CHANNEL_ID = 'ride_alert';
export const TRIP_STATUS_CHANNEL_ID = 'trip_status';
export const RIDE_ALERT_NOTIFICATION_ID = 'ubezap-ride-alert';
export const PUSH_TOKEN_KEY = '@UbeZap:expoPushToken';

/** Tipos que usam som customizado no app — evita som duplo do sistema */
const IN_APP_SOUND_TYPES = new Set(['ride_alert', 'trip_status', 'general']);

// Mostra banner; som do sistema só para tipos que não tocam áudio próprio
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification?.request?.content?.data?.type;
    const foreground = AppState.currentState === 'active';
    const isRemotePush = notification?.request?.trigger?.type === 'push';

    // Motorista: o push remoto de nova corrida é "simples". Com o app vivo, quem
    // mostra é a notificação rica do Notifee (full-screen, Aceitar/Recusar), então
    // suprimimos o banner do push remoto para não duplicar. App morto: este handler
    // nem roda e o push remoto aparece como fallback.
    if (isRemotePush && type === 'ride_alert') {
      return {
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    const playSystemSound = foreground ? !IN_APP_SOUND_TYPES.has(type) : true;
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: playSystemSound,
      shouldSetBadge: false,
    };
  },
});

async function presentNow(content) {
  if (typeof Notifications.presentNotificationAsync === 'function') {
    await Notifications.presentNotificationAsync(content);
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
}

/**
 * Configura canais Android
 */
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    displayName: 'Notificações Gerais',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    enableLights: true,
    enableVibration: true,
    showBadge: true,
    sound: null,
  });

  await Notifications.setNotificationChannelAsync(TRIP_STATUS_CHANNEL_ID, {
    name: 'Status da Corrida',
    displayName: 'Status da Corrida',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 150, 300],
    lightColor: '#3AB56B',
    enableLights: true,
    enableVibration: true,
    showBadge: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync(RIDE_ALERT_CHANNEL_ID, {
    name: 'Alertas de Corrida',
    displayName: 'Alertas de Corrida',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500],
    lightColor: '#3AB56B',
    enableLights: true,
    enableVibration: true,
    showBadge: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

export async function ensureNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
    android: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return status === 'granted';
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;

  const granted = await ensureNotificationPermissions();
  if (!granted) {
    console.warn('Permissão de notificações negada');
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.warn('Erro ao obter token Expo Push:', e);
    return null;
  }
}

export async function getStoredPushToken() {
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function isAppActive() {
  return AppState.currentState === 'active';
}

/**
 * Notificação local imediata.
 * Em foreground: sem som do sistema (evita duplicar com statusSound / rideAlertSound).
 */
export async function triggerLocalNotification(title, body, data = {}, channelId = 'default') {
  try {
    await setupNotificationChannels();
    const foreground = isAppActive();
    const content = {
      title,
      body,
      data: { ...data, type: data.type || 'general' },
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 400, 200, 400],
      android: {
        channelId,
        priority: Notifications.AndroidNotificationPriority.MAX,
        visibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        sticky: data.type === 'trip_status' || data.type === 'ride_alert',
      },
    };

    // scheduleNotificationAsync entrega na barra mesmo com app em background/headless
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: null,
    });
  } catch (e) {
    console.warn('Erro ao disparar notificação local:', e);
  }
}

/** Dispara notificação de status da corrida (local ou complementar ao push remoto) */
export async function triggerTripStatusNotification(status, motorista, rideId) {
  const msg = getPassengerStatusNotification(status, motorista);
  if (!msg) return;
  await triggerLocalNotification(
    msg.title,
    msg.body,
    { type: 'trip_status', status: Number(status), rideId: rideId ? String(rideId) : undefined },
    TRIP_STATUS_CHANNEL_ID
  );
}

/**
 * Notificação de nova corrida — som fica a cargo do rideAlertSound no app.
 * Não inclui objeto ride inteiro no payload (evita crash por payload grande).
 */
export async function triggerRideAlertNotification(ride) {
  const pickup = (ride.endereco_ini_txt || ride.endereco_ini || 'Embarque').split('(')[0].trim();
  const destination = (ride.endereco_fim_txt || ride.endereco_fim || 'Destino').split('(')[0].trim();
  const price = ride.taxa ? `R$ ${String(ride.taxa).replace('.', ',')}` : '';

  try {
    await setupNotificationChannels();
    const foreground = isAppActive();
    await presentNow({
      identifier: RIDE_ALERT_NOTIFICATION_ID,
      title: 'Nova corrida disponível!',
      body: `${price} — ${pickup} → ${destination}`,
      data: {
        type: 'ride_alert',
        rideId: String(ride.id),
      },
      sound: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: !foreground,
      vibrate: foreground ? [0, 300, 150, 300] : [0, 500, 200, 500, 200, 500],
      categoryIdentifier: 'ride_alert',
      android: {
        channelId: RIDE_ALERT_CHANNEL_ID,
        priority: Notifications.AndroidNotificationPriority.MAX,
        visibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        autoCancel: false,
        ongoing: !foreground,
      },
    });
  } catch (e) {
    console.warn('Erro ao disparar notificação de corrida:', e);
  }
}

export async function cancelRideAlertNotification() {
  try {
    await Notifications.dismissNotificationAsync(RIDE_ALERT_NOTIFICATION_ID);
    await Notifications.cancelScheduledNotificationAsync(RIDE_ALERT_NOTIFICATION_ID);
  } catch (e) {
    // ok
  }
}

export async function setupRideAlertCategory() {
  if (Platform.OS === 'ios') {
    await Notifications.setNotificationCategoryAsync('ride_alert', [
      {
        identifier: 'accept_ride',
        buttonTitle: 'Aceitar',
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'reject_ride',
        buttonTitle: 'Recusar',
        options: { opensAppToForeground: true, isDestructive: true },
      },
    ]);
  }
}

export function getPassengerStatusNotification(status, motorista) {
  const nome = motorista?.nome || 'Motorista';
  switch (Number(status)) {
    case 1:
      return {
        title: 'Motorista a caminho!',
        body: `${nome} aceitou sua corrida e está indo até você.`,
      };
    case 2:
      return {
        title: 'Motorista no local!',
        body: 'Seu motorista chegou ao ponto de embarque.',
      };
    case 3:
      return {
        title: 'Corrida iniciada!',
        body: 'Boa viagem! Você está a caminho do destino.',
      };
    case 4:
      return {
        title: 'Corrida finalizada!',
        body: 'Sua viagem foi encerrada. Obrigado por usar o UbeZap!',
      };
    case 5:
      return {
        title: 'Corrida cancelada',
        body: 'A corrida foi cancelada.',
      };
    default:
      return null;
  }
}
