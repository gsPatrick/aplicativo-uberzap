/**
 * Samsung / Motorola matam apps em background agressivamente.
 * Abre a tela do sistema para desativar otimização de bateria do UbeZap.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getPackage() {
  return (
    Constants?.expoConfig?.android?.package ||
    Constants?.manifest?.android?.package ||
    'app.br.uberzap.motorista'
  );
}

export async function openBatteryOptimizationSettings() {
  if (Platform.OS !== 'android') return;
  const pkg = getPackage();
  try {
    const IntentLauncher = require('expo-intent-launcher');
    await IntentLauncher.startActivityAsync(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      { data: 'package:' + pkg }
    );
  } catch (_) {
    try {
      const IntentLauncher = require('expo-intent-launcher');
      await IntentLauncher.startActivityAsync(
        'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'
      );
    } catch (e) {
      const { Linking } = require('react-native');
      await Linking.openSettings().catch(() => {});
    }
  }
}
