/**
 * Deduplicação entre push REMOTO (FCM/Expo) e notificação LOCAL (polling).
 *
 * Agora que o FCM está ativo, o servidor envia o push remoto E o app detecta o
 * mesmo evento no polling — o que geraria 2 notificações. Quando um push remoto
 * é recebido, registramos a chave do evento; o polling local consulta antes de
 * disparar e PULA se o remoto já chegou há pouco.
 *
 * Em memória de propósito: só importa quando o JS está vivo (handler de push e
 * polling rodam no mesmo contexto). Com o app morto, o polling não roda, então
 * não há duplicata possível.
 */

const RECENT = new Map();

/** Janela padrão: o push costuma chegar antes do poll (que roda a cada ~5s). */
const DEFAULT_WINDOW_MS = 9000;

function now() {
  return Date.now();
}

/** Marca que um push remoto deste evento acabou de chegar. */
export function recordRemotePush(key) {
  if (!key) return;
  RECENT.set(String(key), now());
  // Limpeza preguiçosa para não vazar memória em sessões longas.
  if (RECENT.size > 50) {
    const limite = now() - DEFAULT_WINDOW_MS * 4;
    for (const [k, t] of RECENT) {
      if (t < limite) RECENT.delete(k);
    }
  }
}

/** True se um push remoto deste evento chegou dentro da janela. */
export function recentlyPushed(key, windowMs = DEFAULT_WINDOW_MS) {
  if (!key) return false;
  const t = RECENT.get(String(key));
  if (!t) return false;
  return now() - t < windowMs;
}

/** Chaves padronizadas (mesma string no handler de push e no polling). */
export function rideAlertKey(rideId) {
  return `ride_alert:${rideId}`;
}

export function tripStatusKey(rideId, status) {
  return `trip_status:${rideId}:${Number(status)}`;
}
