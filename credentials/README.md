# Credenciais FCM (push remoto)

Coloque aqui os `google-services.json` baixados do Firebase Console:

| App        | Pacote Android      | Arquivo aqui                          |
|------------|---------------------|---------------------------------------|
| Passageiro | `com.ubezap.app`    | `google-services.passenger.json`      |
| Motorista  | `com.ubezap.driver` | `google-services.driver.json`         |

O `app.config.js` carrega automaticamente o arquivo certo conforme `APP_VARIANT`.

## É seguro commitar esses arquivos?
Sim. O `google-services.json` não é segredo — ele já vai embutido dentro do APK
e contém apenas identificadores do projeto + uma API key restrita por pacote/SHA.
Commite os dois arquivos, senão o build na nuvem (EAS) não os encontra e o push
remoto não funciona.

> A credencial de SERVIDOR (a que o backend usa pra ENVIAR) é a Service Account
> FCM V1, que NÃO fica aqui — ela é enviada uma vez pro Expo via `eas credentials`
> (ver passo 4 do guia). Essa sim é secreta e nunca deve ser commitada.
