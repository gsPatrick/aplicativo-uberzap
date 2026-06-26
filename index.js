/**
 * Entry point — registra handlers Notifee em background ANTES do App.
 */
import './src/services/backgroundNotification';
import './src/services/backgroundRideNotification';
import { registerRootComponent } from 'expo';
import App from './App';
import { registerRideRingForegroundService } from './src/utils/rideAlertSound';

// Foreground service de áudio (toque CONTÍNUO até aceitar/recusar, mesmo com app
// morto e tela ligada/apagada). Precisa estar registrado ANTES de o handler FCM
// iniciar o serviço pela notificação asForegroundService.
registerRideRingForegroundService();

// FCM background handler (@react-native-firebase): roda MESMO COM O APP MORTO e
// desenha o card full-screen (Notifee) + acorda a tela + som. require guardado
// para não quebrar onde o módulo nativo não existe (ex.: Expo Go).
try {
  const messaging = require('@react-native-firebase/messaging').default;
  const { handleFcmRideAlert } = require('./src/services/fcmDirect');
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    await handleFcmRideAlert(remoteMessage?.data);
  });
} catch (e) {
  // @react-native-firebase indisponível — ignora
}

registerRootComponent(App);
