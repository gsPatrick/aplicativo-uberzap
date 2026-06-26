import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Audio } from 'expo-av';

let activeSound = null;
let audioModeConfigured = false;
let startQueue = Promise.resolve();

// --- Foreground service de áudio (toca em loop mesmo com app MORTO, qualquer
// estado de tela, até aceitar/recusar). É o que garante o "toque contínuo". ---
let fgResolve = null;
let fgTimeout = null;
const RING_MAX_MS = 35000; // expiração da corrida (segurança p/ não tocar pra sempre)

function getNotifee() {
  if (Platform.OS !== 'android' || Constants?.appOwnership === 'expo') return null;
  try {
    return require('@notifee/react-native').default;
  } catch (_) {
    return null;
  }
}

async function ensureAudioMode() {
  if (audioModeConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    audioModeConfigured = true;
  } catch (e) {
    console.warn('[RideAlertSound] Erro ao configurar modo de áudio:', e);
  }
}

async function unloadActiveSound() {
  if (!activeSound) return;
  const sound = activeSound;
  activeSound = null;
  try {
    await sound.stopAsync();
  } catch (_) {}
  try {
    await sound.unloadAsync();
  } catch (_) {}
}

/**
 * Inicia o toque de alerta de corrida em loop contínuo.
 * Deve ser interrompido via stopRideAlertSound() ao aceitar, recusar ou expirar.
 */
export function startRideAlertSound() {
  startQueue = startQueue.then(async () => {
    try {
      await ensureAudioMode();
      if (activeSound) return;

      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/toque_status.mp3'),
        { isLooping: true, volume: 0.9, shouldPlay: true }
      );
      activeSound = sound;
      await sound.playAsync();
    } catch (e) {
      console.warn('[RideAlertSound] Erro ao iniciar som em loop:', e);
    }
  });
  return startQueue;
}

/**
 * Para o som de alerta E o foreground service (encerra o toque contínuo).
 * Chamado ao ACEITAR, RECUSAR, expirar ou cancelar.
 */
export async function stopRideAlertSound() {
  if (fgTimeout) {
    clearTimeout(fgTimeout);
    fgTimeout = null;
  }
  await unloadActiveSound();
  // resolve a promise do runner -> o serviço pode encerrar
  if (fgResolve) {
    const r = fgResolve;
    fgResolve = null;
    try { r(); } catch (_) {}
  }
  const notifee = getNotifee();
  if (notifee) {
    try { await notifee.stopForegroundService(); } catch (_) {}
  }
}

export function isRideAlertSoundPlaying() {
  return activeSound != null;
}

/**
 * Registra o foreground service que mantém o som em LOOP enquanto a corrida
 * está chamando — mesmo com o app MORTO e a tela ligada ou apagada. Deve ser
 * chamado UMA vez no boot (index.js). O serviço é iniciado pela notificação
 * com asForegroundService=true (rideNotification) e encerrado pelo
 * stopRideAlertSound() (aceitar/recusar) ou pela segurança de 35s.
 */
export function registerRideRingForegroundService() {
  const notifee = getNotifee();
  if (!notifee) return;
  try {
    notifee.registerForegroundService(() => {
      return new Promise((resolve) => {
        fgResolve = resolve;
        // toca o loop
        startRideAlertSound().catch(() => {});
        // segurança: encerra sozinho na expiração da corrida
        if (fgTimeout) clearTimeout(fgTimeout);
        fgTimeout = setTimeout(() => {
          stopRideAlertSound().catch(() => {});
        }, RING_MAX_MS);
      });
    });
  } catch (e) {
    console.warn('[RideAlertSound] registerForegroundService:', e?.message);
  }
}
