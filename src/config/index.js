import Constants from 'expo-constants';

const appVariant =
  Constants.expoConfig?.extra?.appVariant ||
  process.env.APP_VARIANT ||
  'passenger';

// Configuração Global do App
export const CONFIG = {
  /** Igual ao binário: 'passenger' | 'driver' (veja app.config.js + eas.json). */
  APP_BUILD: appVariant === 'driver' ? 'driver' : 'passenger',

  // Altere para true para usar dados mockados (sem necessidade de backend)
  // Altere para false para conectar com a API real no cPanel
  USE_MOCKS: false,
  
  API_BASE_URL: 'https://geral-uberzap-api.r954jc.easypanel.host/_/',
  IMAGE_BASE_URL: 'https://geral-uberzap-api.r954jc.easypanel.host/_/admin/uploads/',
  SECRET_KEY: 'abc1234', // Definido no conexao.php
};
