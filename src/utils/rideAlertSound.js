import { Audio } from 'expo-av';

let activeSound = null;
let audioModeConfigured = false;
let startQueue = Promise.resolve();

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
 * Para e libera o som de alerta de corrida.
 */
export async function stopRideAlertSound() {
  await unloadActiveSound();
}

export function isRideAlertSoundPlaying() {
  return activeSound != null;
}
