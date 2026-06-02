import { Audio } from 'expo-av';

let activeSound = null;
let playQueue = Promise.resolve();

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
 * Toca o bipe de status uma vez por vez (evita empilhar sons e travar o app).
 */
export function playStatusSoundOnce() {
  playQueue = playQueue.then(async () => {
    try {
      await unloadActiveSound();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/sounds/toque_status.mp3'),
        { shouldPlay: true, volume: 0.85 }
      );
      activeSound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status?.didJustFinish && activeSound === sound) {
          unloadActiveSound();
        }
      });
    } catch (e) {
      console.warn('[StatusSound] Erro ao tocar som:', e);
    }
  });
  return playQueue;
}

export async function stopStatusSound() {
  await unloadActiveSound();
}
