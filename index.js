/**
 * Entry point — registra handlers Notifee em background ANTES do App.
 */
import './src/services/backgroundNotification';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
