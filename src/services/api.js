import axios from 'axios';
import { CONFIG } from '../config';
import { MOCK_DATA } from './mocks';

// Instância real do Axios
const axiosInstance = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

// Interceptador para tratar respostas vazias ou malformadas do PHP antigo
axiosInstance.interceptors.response.use(
  (response) => {
    // Se a resposta for uma string vazia (comum no PHP do projeto quando dá erro), 
    // retornamos um objeto de erro tratado para evitar que o JSON.parse quebre o app.
    if (response.data === "") {
      const url = response?.config?.url || '';
      // Alguns endpoints legados retornam vazio em sucesso (ex.: atualiza_local.php).
      if (url.includes('motoristas/atualiza_local.php')) {
        return { ...response, data: { status: 'ok' } };
      }
      console.warn(`API retornou string vazia para: ${response.config.url}`);
      return { 
        ...response, 
        data: { 
          status: 'erro', 
          mensagem: 'O servidor retornou uma resposta vazia. Verifique se os dados (telefone/senha) existem no banco.' 
        } 
      };
    }
    return response;
  },
  (error) => {
    // Tratamento de erros de rede ou timeout
    if (error.code === 'ECONNABORTED') {
      console.error('Timeout na chamada da API');
    }
    return Promise.reject(error);
  }
);

/**
 * Utilitário para transformar objeto em Form Data (Padrão esperado pelo seu PHP)
 */
const toFormData = (data) => {
  const formData = new FormData();
  if (data) {
    Object.keys(data).forEach(key => formData.append(key, data[key]));
  }
  formData.append('secret', CONFIG.SECRET_KEY);
  return formData;
};

/**
 * Unified API Service
 */
const api = {
  // --- PASSENGER ENDPOINTS ---
  passenger: {
    login: async (telefone, senha, id_signal = '') => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.login };
      return axiosInstance.post('app/login_user.php', toFormData({ telefone, senha, id_signal }));
    },
    register: async (dados) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso' } };
      return axiosInstance.post('app/cadastro.php', toFormData(dados));
    },
    calculateRide: async (cidade_id, lat_ini, lng_ini, lat_fim, lng_fim) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.categorias_calculadas };
      return axiosInstance.post('app/calcular_custos.php', toFormData({ 
        cidade_id, lat_ini, lng_ini, lat_fim, lng_fim 
      }));
    },
    requestRide: async (dados) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok', id_corrida: 999 } };
      return axiosInstance.post('app/insere_chamado.php', toFormData(dados));
    },
    getStatus: async (telefone, senha, id_corrida) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.status_corrida };
      const response = await axiosInstance.post(
        'app/get_status_chamado.php',
        toFormData({ telefone, senha, id_corrida: id_corrida ?? '' })
      );
      const raw = response.data;
      if (raw == null || raw === '') {
        throw new Error('Sessão expirada ou resposta inválida do servidor');
      }
      if (typeof raw === 'string') {
        const t = raw.trim();
        if (t === '') {
          throw new Error('Sessão expirada ou resposta inválida do servidor');
        }
        if (t.startsWith('{') || t.startsWith('[')) {
          try {
            return { data: JSON.parse(t) };
          } catch {
            throw new Error('Resposta inválida do servidor (JSON)');
          }
        }
        throw new Error('Resposta inesperada do servidor');
      }
      return { data: raw };
    },
    cancelRide: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      return axiosInstance.post('app/cancelar.php', toFormData({ telefone, senha }));
    },
    rateRide: async (payload) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok', mensagem: 'Avaliado com sucesso' } };
      return axiosInstance.post('app/insere_avaliacao.php', toFormData(payload));
    },
    getWallet: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.wallet };
      return axiosInstance.post('app/get_dados_carteira.php', toFormData({ telefone, senha }));
    },
    getHistory: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.historico };
      const response = await axiosInstance.post('app/get_historico.php', toFormData({ telefone, senha }));
      if (response.data === "no" || !response.data) return { ...response, data: [] };
      return response;
    },
    addTransaction: async (payload) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      return axiosInstance.post('app/insere_transacao.php', toFormData(payload));
    },
    getBanners: async (cidade_id) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.banners };
      return axiosInstance.post('app/get_banners.php', toFormData({ cidade_id }));
    },
    validateCoupon: async (payload) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'Cupom aplicado!', desconto: '5,00' } };
      return axiosInstance.post('app/valida_cupon.php', toFormData(payload));
    },
    getChat: async (telefone, senha) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.chat };
        return axiosInstance.post('app/get_mensagens.php', toFormData({ telefone, senha }));
    },
    sendChat: async (telefone, senha, msg) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('app/insere_msg.php', toFormData({ telefone, senha, msg }));
    },
    sendOTP: async (numero_telefone) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      return axiosInstance.post('app/envia_otp_recuperar.php', toFormData({ numero_telefone }));
    },
    verifyOTP: async (numero_telefone, otp) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      return axiosInstance.post('app/verificar_otp.php', toFormData({ numero_telefone, otp }));
    },
    resetPassword: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso' } };
      return axiosInstance.post('app/reset_senha.php', toFormData({ telefone, senha }));
    },
    updateProfile: async (payload) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso' } };
      return axiosInstance.post('app/update_perfil.php', toFormData(payload));
    },
    getAllDrivers: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.nearbyDrivers };
      return axiosInstance.post('app/get_all_motoristas.php', toFormData({ telefone, senha }));
    },
    getNearbyDrivers: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.nearby_drivers };
      const response = await axiosInstance.post('app/get_all_motoristas.php', toFormData({ telefone, senha }));
      if (response.data === "no" || !response.data) return { ...response, data: [] };
      return response;
    },
    getCityData: async (cidade_id) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.city_data };
      return axiosInstance.post('app/get_dados_cidade.php', toFormData({ cidade_id }));
    },
    /** Mensagens da corrida ativa (mesmo contrato que get_mensagens.php no app web). */
    getNotifications: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.notifications };
      const response = await axiosInstance.post('app/get_mensagens.php', toFormData({ telefone, senha }));
      if (response.data === 'no' || response.data === 'invalid request' || !response.data) {
        return { ...response, data: [] };
      }
      if (typeof response.data === 'string' && response.data.trim().startsWith('[')) {
        return { ...response, data: JSON.parse(response.data) };
      }
      return response;
    },
    /** Envia mensagem ao suporte (equivalente a mensagens.js → insere_msg.php). */
    sendSupportMessage: async ({ telefone, senha, msg }) => {
      if (CONFIG.USE_MOCKS) return { data: 'ok' };
      return axiosInstance.post('app/insere_msg.php', toFormData({ telefone, senha, msg }));
    },
    getProfile: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.login.usuario };
      const response = await axiosInstance.post('app/login_user.php', toFormData({ telefone, senha }));
      return { data: response.data };
    },
    getCities: async () => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.cities };
      return axiosInstance.get('app/get_cidades.php');
    },
    /** Autocomplete de endereço (Mapbox via app/busca_endereco.php no servidor). */
    searchAddresses: async (q, lat, lng) => {
      if (CONFIG.USE_MOCKS) {
        return {
          data: [
            {
              place_id: 'mock-1',
              name: 'Avenida Paulista',
              display_name: 'Avenida Paulista, Bela Vista, São Paulo, SP, Brasil',
              lat: '-23.55686',
              lon: '-46.66141',
            },
          ],
        };
      }
      const params = { q };
      if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
        params.lat = Number(lat);
        params.lng = Number(lng);
      }
      return axiosInstance.get('app/busca_endereco.php', { params });
    },
    checkTransactionStatus: async (cidade_id, user_id) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'no' } };
      return axiosInstance.post('app/verifica_status_transacoes.php', toFormData({ cidade_id, user_id }));
    },
    checkBalance: async (telefone, senha, valor) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso' } };
      return axiosInstance.post('app/verifica_saldo.php', toFormData({ telefone, senha, valor }));
    },
    /** Mesmo fluxo do web (home.js): indica se existe corrida aberta (0–3) para o cliente. */
    hasOpenRide: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: false };
      const response = await axiosInstance.post('app/busca_inicio.php', toFormData({ telefone, senha }));
      const body = response.data;
      const s = body == null ? '' : String(body).trim();
      return { data: s === '1' };
    },
  },

  // --- DRIVER ENDPOINTS ---
  driver: {
    login: async (cpf, senha, id_signal = '') => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.login };
      return axiosInstance.post('motoristas/login.php', toFormData({ cpf, senha, id_signal }));
    },
    updateLocation: async (id_motorista, status, latitude, longitude) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/atualiza_local.php', toFormData({ id_motorista, status, latitude, longitude }));
    },
    updateRideStatus: async (id_corrida, status, id_cidade, taxa = null) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        const payload = { id_corrida, status, id_cidade };
        if (taxa) payload.taxa = taxa;
        return axiosInstance.post('motoristas/atualiza.php', toFormData(payload));
    },
    uploadDriverDocs: async (formData) => {
        if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
        return axiosInstance.post('motoristas/cadastra_docs.php', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    pollRides: async (id_motorista, cidade_id) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.available_rides };
        const response = await axiosInstance.post('motoristas/busca_corridas_disponiveis.php', toFormData({ id_motorista, cidade_id }));
        if (response.data === "no" || !response.data) return { ...response, data: [] };
        return response;
    },
    refuseRide: async (id_motorista, id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/recusar.php', toFormData({ id_motorista, id_corrida }));
    },
    acceptRide: async (id_motorista, id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/aceitar.php', toFormData({ id_motorista, id_corrida }));
    },
    getDriverEarnings: async (id_motorista) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.driver_earnings };
        return axiosInstance.post('motoristas/busca_relatorio.php', toFormData({ id_motorista }));
    },
    getDriverProfile: async (id_motorista) => {
        if (CONFIG.USE_MOCKS) return { data: { nome: 'Motorista Zap', nivel: 'Diamante', foto: null } };
        return axiosInstance.post('motoristas/get_perfil.php', toFormData({ id_motorista }));
    },
    getDriverReport: async (id_motorista) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.driver_report };
        return axiosInstance.post('motoristas/busca_relatorio.php', toFormData({ id_motorista }));
    },
    getDriverTransactions: async (id_motorista) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.driver_transactions };
        return axiosInstance.post('motoristas/busca_transacoes.php', toFormData({ id_motorista }));
    },
    register: async (formData) => {
        if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso' } };
        const response = await axiosInstance.post('motoristas/cadastra_docs.php', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        // PHP Monolith returns "ok" on success
        if (response.data && response.data.status === 'ok') {
            return { ...response, data: { status: 'sucesso' } };
        }
        return response;
    },
    getChat: async (id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.chat };
        return axiosInstance.post('motoristas/busca_msg.php', toFormData({ id_corrida }));
    },
    sendChat: async (id_corrida, msg, sender) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/insere_msg.php', toFormData({ id_corrida, msg, sender }));
    },
    finishRideTaxi: async (payload) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/atualiza_taxi.php', toFormData(payload));
    },
    cancelRideByDriver: async (id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/cancelar.php', toFormData({ id_corrida }));
    },
    /** Suporte/chat por corrida: o PHP exige id_corrida (mesmo contrato de insere_msg / busca_msg). */
    sendDriverMessage: async ({ id_corrida, msg, sender = '1' }) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/insere_msg.php', toFormData({ id_corrida, msg, sender }));
    },
    getDriverMessages: async (id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.chat };
        const response = await axiosInstance.post('motoristas/busca_msg.php', toFormData({ id_corrida }));
        if (response.data === 'no' || !response.data) return { ...response, data: [] };
        return response;
    },
    getDriverHistory: async (id_motorista, data) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.driver_history };
        const response = await axiosInstance.post('motoristas/busca_historico.php', toFormData({ id_motorista, data }));
        if (!response.data || response.data === "no") return { ...response, data: [] };
        if (typeof response.data === 'string') {
          const raw = response.data.trim();
          if (!raw || raw === 'no' || raw === 'invalid request') {
            return { ...response, data: [] };
          }
          if (raw.startsWith('[') || raw.startsWith('{')) {
            try {
              const parsed = JSON.parse(raw);
              return { ...response, data: Array.isArray(parsed) ? parsed : [] };
            } catch {
              return { ...response, data: [] };
            }
          }
          return { ...response, data: [] };
        }
        if (!Array.isArray(response.data)) {
          return { ...response, data: [] };
        }
        return response;
    },
    getDriverAlerts: async (id_motorista) => {
        if (CONFIG.USE_MOCKS) return { data: [] };
        const response = await axiosInstance.post('motoristas/get_alertas_texto.php', toFormData({ id_motorista }));
        if (response.data === 'no' || !response.data) return { ...response, data: [] };
        return response;
    },
    startWaiting: async (id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        // O PHP já tem setInicioEspera na classe corridas, precisamos de um script que o chame.
        // Vamos usar o atualiza.php com status específico ou um script dedicado se existir.
        return axiosInstance.post('motoristas/status_espera.php', toFormData({ id_corrida, acao: 'iniciar' }));
    },
    stopWaiting: async (id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/status_espera.php', toFormData({ id_corrida, acao: 'finalizar' }));
    }
  },
  isMockEnabled: () => CONFIG.USE_MOCKS,
  getMockStatus: () => MOCK_DATA.status_corrida,
  getImageUrl: (filename) => {
    if (!filename) return `${CONFIG.IMAGE_BASE_URL}default_driver.png`;
    if (filename.startsWith('http')) return filename;
    return `${CONFIG.IMAGE_BASE_URL}${filename}`;
  }
};

export default api;
