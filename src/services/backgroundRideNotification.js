/**
 * Handler de NOTIFICAÇÃO EM BACKGROUND/FECHADO para o motorista.
 *
 * O servidor envia o alerta de corrida como "data-only" (sem título/texto), então
 * o Android NÃO mostra a notificação crua — em vez disso, esta task acorda e desenha
 * o card rico full-screen (Notifee) com as infos da corrida e Aceitar/Recusar.
 *
 * Precisa ser definida no escopo do módulo e importada em index.js ANTES do App,
 * para funcionar mesmo com o app encerrado (headless).
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';

const IS_EXPO_GO = Constants?.appOwnership === 'expo';
export const BACKGROUND_RIDE_NOTIFICATION_TASK = 'BACKGROUND_RIDE_NOTIFICATION_TASK';

/** O payload do push aparece em caminhos diferentes por plataforma/versão. */
function extractData(taskData) {
  if (!taskData) return null;
  return (
    taskData?.notification?.request?.content?.data ||
    taskData?.notification?.data ||
    taskData?.data?.notification?.data ||
    taskData?.data ||
    taskData
  );
}

/** Reconstrói o objeto de corrida a partir dos campos enviados no data-only. */
function buildRawRide(d) {
  const id = d?.rideId || d?.id;
  if (!id) return null;
  return {
    id,
    taxa: d.taxa,
    endereco_ini_txt: d.endereco_ini_txt,
    endereco_fim_txt: d.endereco_fim_txt,
    nome_cliente: d.nome_cliente,
    nota_cliente: d.nota_cliente,
    km: d.km,
    tempo: d.tempo,
    f_pagamento: d.f_pagamento,
    cidade_id: d.cidade_id,
    categoria_id: d.categoria_id,
  };
}

if (Platform.OS !== 'web' && !IS_EXPO_GO) {
  TaskManager.defineTask(BACKGROUND_RIDE_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[bgRideNotif] erro na task:', error?.message || error);
      return;
    }
    try {
      const d = extractData(data);
      if (!d || d.type !== 'ride_alert') return;

      const rideId = d.rideId || d.id;
      const event = d.event;

      // Corrida aceita por outro / cancelada: remove o card e para o som.
      if (event === 'ride_unavailable' || event === 'passenger_cancelled') {
        try {
          const { cancelRideRequestNotification } = require('./rideNotification');
          if (rideId) await cancelRideRequestNotification(rideId);
        } catch (_) {}
        try {
          const { cancelRideAlertNotification } = require('../utils/notifications');
          await cancelRideAlertNotification();
        } catch (_) {}
        try {
          const { stopRideAlertSound } = require('../utils/rideAlertSound');
          await stopRideAlertSound();
        } catch (_) {}
        return;
      }

      // Nova corrida: desenha o card full-screen (Notifee) + acorda a tela.
      const raw = buildRawRide(d);
      if (!raw) return;
      const { notifyDriverNewRide } = require('./rideBackgroundAlert');
      await notifyDriverNewRide(raw);
    } catch (e) {
      console.warn('[bgRideNotif] falha ao processar:', e?.message);
    }
  });
}

/** Registra a task no expo-notifications (chamar no init do motorista). */
export async function registerBackgroundRideNotificationTask() {
  if (Platform.OS === 'web' || IS_EXPO_GO) return;
  try {
    const already = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_RIDE_NOTIFICATION_TASK
    );
    if (!already) {
      await Notifications.registerTaskAsync(BACKGROUND_RIDE_NOTIFICATION_TASK);
    }
  } catch (e) {
    console.warn('[bgRideNotif] falha ao registrar task:', e?.message);
  }
}
