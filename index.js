/**
 * Entry point — registra handlers Notifee em background ANTES do App.
 */
import './src/services/backgroundNotification';
import './src/services/backgroundRideNotification';
import { registerRootComponent } from 'expo';
import App from './App';

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
