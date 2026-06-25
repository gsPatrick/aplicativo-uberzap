#!/usr/bin/env node
/**
 * Diagnóstico de push (Expo -> FCM) para o app do motorista.
 *
 * Envia uma notificação de teste para um Expo Push Token e lê o RECIBO do Expo,
 * que diz o erro EXATO quando o push não chega:
 *   - "DeviceNotRegistered" -> token velho/desinstalado: registre de novo no app.
 *   - "MismatchSenderId" / "InvalidCredentials" -> a credencial FCM V1 no projeto
 *     EAS/Expo NÃO bate com o google-services.json (projeto ubezap-a6bb4).
 *     Corrija com:  eas credentials  (Android -> Push Notifications: FCM V1 ->
 *     upload do service-account.json do Firebase ubezap-a6bb4).
 *   - "ok" no ticket + recibo "ok" -> Expo entregou ao FCM; o problema é no
 *     device (canal/permissão/otimização de bateria) ou no backend (token não
 *     salvo / motorista offline na hora do envio).
 *
 * Uso:
 *   node scripts/test-push.js "ExponentPushToken[xxxxxxxx]"
 *
 * Pegue o token no logcat do device (procure por "[PushToken]") ou logando no app.
 */

const token = process.argv[2];

if (!token || !/^Expo(nent)?PushToken\[/.test(token)) {
  console.error('\nUso: node scripts/test-push.js "ExponentPushToken[...]"\n');
  console.error('Pegue o token no logcat: adb logcat | grep PushToken\n');
  process.exit(1);
}

const message = {
  to: token.trim(),
  title: 'Teste de push UbeZap',
  body: 'Se você está vendo isto, a entrega Expo -> FCM funciona.',
  sound: 'default',
  priority: 'high',
  channelId: 'ride_alert',
  data: { type: 'ride_alert', rideId: 'TEST', channelId: 'ride_alert' },
};

async function main() {
  console.log('\n-> Enviando push para', token.slice(0, 24) + '...\n');

  const sendRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify([message]),
  });

  const sendJson = await sendRes.json();
  console.log('TICKET (resposta do envio):');
  console.log(JSON.stringify(sendJson, null, 2));

  const ticket = sendJson?.data?.[0];
  if (!ticket) {
    console.error('\nSem ticket. HTTP', sendRes.status, '- verifique o token/conexão.\n');
    process.exit(2);
  }
  if (ticket.status === 'error') {
    console.error('\n>>> ERRO JÁ NO TICKET:', ticket.message);
    console.error('>>> details:', JSON.stringify(ticket.details));
    console.error('\nIsto normalmente é credencial FCM (MismatchSenderId/InvalidCredentials)');
    console.error('ou token inválido (DeviceNotRegistered).\n');
    process.exit(0);
  }

  const receiptId = ticket.id;
  console.log('\n-> Ticket OK (id =', receiptId + '). Aguardando recibo do FCM...');

  // O recibo leva alguns segundos para ficar disponível.
  await new Promise((r) => setTimeout(r, 6000));

  const recRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ ids: [receiptId] }),
  });

  const recJson = await recRes.json();
  console.log('\nRECIBO (o que o FCM respondeu ao Expo):');
  console.log(JSON.stringify(recJson, null, 2));

  const receipt = recJson?.data?.[receiptId];
  if (!receipt) {
    console.log('\nRecibo ainda não disponível. Rode de novo em alguns segundos.\n');
    return;
  }
  if (receipt.status === 'ok') {
    console.log('\n>>> ENTREGA OK no nível Expo->FCM.');
    console.log('>>> Se mesmo assim não apareceu no device: cheque permissão de');
    console.log('    notificação, canal "ride_alert", e otimização de bateria.\n');
  } else {
    console.log('\n>>> ERRO NO RECIBO:', receipt.message);
    console.log('>>> details:', JSON.stringify(receipt.details));
    console.log('\nSe for MismatchSenderId/InvalidCredentials: suba a credencial FCM V1');
    console.log('do Firebase ubezap-a6bb4 no projeto EAS (eas credentials).\n');
  }
}

main().catch((e) => {
  console.error('Falha no teste:', e?.message || e);
  process.exit(3);
});
