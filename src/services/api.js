import axios from 'axios';
import { CONFIG } from '../config';
import { MOCK_DATA } from './mocks';

const axiosInstance = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  // 12s: antes era 30s — um endpoint lento/pendurado segurava a tela por até
  // 30s (nome/saldo/ganhos/redirect ficavam presos). 12s já cobre rede móvel
  // ruim sem deixar a UI "travada" esperando.
  timeout: 12000,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

axiosInstance.interceptors.response.use(
  (response) => {
    if (response.data === '' || response.data === null || response.data === undefined) {
      return {
        ...response,
        data: {
          status: 'erro',
          mensagem: 'O servidor retornou uma resposta vazia. Verifique se os dados (telefone/senha) existem no banco.',
        },
      };
    }
    return response;
  },
  (error) => {
    // Tratamento de erros de rede ou timeout
    if (error.code === 'ECONNABORTED') {
      console.error('Timeout na chamada da API');
    }
    console.error('[API Error]', error?.config?.url, error?.message);
    return Promise.reject(error);
  }
);

/**
 * Converte objeto para string URL-encoded (application/x-www-form-urlencoded).
 * Muito mais confiável que FormData em builds Android nativas do React Native.
 * PHP lê via $_POST normalmente.
 */
const toFormData = (data) => {
  const parts = [];
  if (data) {
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value !== null && value !== undefined) {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
      }
    });
  }
  parts.push(encodeURIComponent('secret') + '=' + encodeURIComponent(CONFIG.SECRET_KEY));
  return parts.join('&');
};

/**
 * Para upload de arquivos (cadastro de docs do motorista), usa FormData nativa.
 */
const toMultipartFormData = (formData) => {
  formData.append('secret', CONFIG.SECRET_KEY);
  return formData;
};

/** Respostas PHP em texto puro (ok / erro) — tolera warnings HTML e corpo vazio do interceptor. */
const stripPhpHtml = (raw) =>
  String(raw ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const isPhpOkResponse = (data) => {
  if (data === null || data === undefined || data === '') return false;
  if (typeof data === 'object') {
    if (data.status === 'erro') return false;
    if (data.status === 'ok') return true;
    return false;
  }
  const compact = stripPhpHtml(data).replace(/\s/g, '').toLowerCase();
  if (compact === 'ok') return true;
  if (
    compact.endsWith('ok') &&
    compact.length <= 160 &&
    !compact.includes('erro') &&
    !compact.includes('no_auth') &&
    !compact.includes('no')
  ) {
    return true;
  }
  return false;
};

const assertPhpOk = (response, context) => {
  if (!isPhpOkResponse(response.data)) {
    const hint =
      typeof response.data === 'object'
        ? response.data?.mensagem || JSON.stringify(response.data)
        : stripPhpHtml(response.data);
    throw new Error(hint || `${context} não confirmou (resposta inválida)`);
  }
  return response;
};

/**
 * Unified API Service
 */
const api = {
  // --- PASSENGER ENDPOINTS ---
  passenger: {
    login: async (telefone, senha, id_signal = '') => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.login };
      const telefoneNorm = String(telefone || '').replace(/\D/g, '');
      return axiosInstance.post('app/login_user.php', toFormData({ telefone: telefoneNorm, senha, id_signal }));
    },
    register: async (dados) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso' } };
      return axiosInstance.post('app/cadastro.php', toFormData(dados));
    },
    calculateRide: async (cidade_id, lat_ini, lng_ini, lat_fim, lng_fim, parada_lat = null, parada_lng = null) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.categorias_calculadas };
      const payload = { cidade_id, lat_ini, lng_ini, lat_fim, lng_fim };
      if (parada_lat && parada_lng) {
        payload.parada_lat = parada_lat;
        payload.parada_lng = parada_lng;
      }
      return axiosInstance.post('app/calcular_custos.php', toFormData(payload));
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
      const response = await axiosInstance.post('app/cancelar.php', toFormData({ telefone, senha }));
      const raw = response.data;
      const text = raw == null ? '' : String(raw).trim();
      if (text === 'ok') {
        return response;
      }
      if (text.includes('Fatal error') || text.includes('<br />')) {
        throw new Error('Erro no servidor ao cancelar a corrida');
      }
      throw new Error(text || 'Falha ao cancelar corrida');
    },
    rateRide: async (payload) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok', mensagem: 'Avaliado com sucesso' } };
      const response = await axiosInstance.post('app/insere_avaliacao.php', toFormData(payload));
      const raw = response.data;
      if (typeof raw === 'string') {
        const t = raw.trim();
        if (t.startsWith('{')) {
          try {
            return { data: JSON.parse(t) };
          } catch {
            return response;
          }
        }
      }
      return response;
    },
    getWallet: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.wallet };
      return axiosInstance.post('app/get_dados_carteira.php', toFormData({ telefone, senha }));
    },
    getHistory: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.historico };
      const response = await axiosInstance.post('app/get_historico.php', toFormData({ telefone, senha }));
      let raw = response.data;
      if (raw == null || raw === '' || raw === 'no') {
        return { ...response, data: [] };
      }
      if (typeof raw === 'string') {
        const t = raw.trim();
        if (!t || t === 'no') return { ...response, data: [] };
        if (t.startsWith('[') || t.startsWith('{')) {
          try {
            const parsed = JSON.parse(t);
            if (Array.isArray(parsed)) return { ...response, data: parsed };
            if (parsed?.status === 'erro') return { ...response, data: [] };
            return { ...response, data: parsed };
          } catch {
            return { ...response, data: [] };
          }
        }
        return { ...response, data: [] };
      }
      if (Array.isArray(raw)) return response;
      return { ...response, data: [] };
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
      const numero = String(numero_telefone || '').replace(/\D/g, '');
      return axiosInstance.post('app/envia_otp_recuperar.php', toFormData({ numero_telefone: numero }));
    },
    verifyOTP: async (numero_telefone, otp) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      const numero = String(numero_telefone || '').replace(/\D/g, '');
      return axiosInstance.post('app/verificar_otp.php', toFormData({ numero_telefone: numero, otp }));
    },
    resetPassword: async (telefone, senha) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso' } };
      const telefoneNorm = String(telefone || '').replace(/\D/g, '');
      return axiosInstance.post('app/reset_senha.php', toFormData({ telefone: telefoneNorm, senha }));
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
    // Radar de carrinhos por cidade (endpoint leve, mesmo do app do motorista; já traz online/offline)
    getNearbyByCity: async (cidade_id, excluir_id = '') => {
      if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.nearby_drivers };
      const response = await axiosInstance.post('motoristas/motoristas_proximos.php', toFormData({ cidade_id, excluir_id }));
      if (!Array.isArray(response.data)) return { ...response, data: [] };
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
  /** Autocomplete de endereço (Google Places / Mapbox via app/busca_endereco.php). */
  searchAddresses: async (q, lat, lng, radius = 50000) => {
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
      params.radius = Number(radius) || 50000;
    }
    return axiosInstance.get('app/busca_endereco.php', { params });
  },
    checkTransactionStatus: async (cidade_id, user_id) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'no' } };
      return axiosInstance.post('app/verifica_status_transacoes.php', toFormData({ cidade_id, user_id }));
    },
    savePushToken: async (telefone, senha, id_signal) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      return axiosInstance.post('app/salva_push_token.php', toFormData({ telefone, senha, id_signal }));
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
      const cpfNorm = String(cpf || '').replace(/\D/g, '');
      return axiosInstance.post('motoristas/login.php', toFormData({ cpf: cpfNorm, senha, id_signal }));
    },
    savePushToken: async (id_motorista, id_signal) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      return axiosInstance.post('motoristas/salva_push_token.php', toFormData({ id_motorista, id_signal }));
    },
    /** Token FCM nativo (@react-native-firebase) — push direto p/ overlay com app morto. */
    saveFcmToken: async (id_motorista, fcm_token) => {
      if (CONFIG.USE_MOCKS) return { data: { status: 'ok' } };
      return axiosInstance.post('motoristas/salva_fcm_token.php', toFormData({ id_motorista, fcm_token }));
    },
    updateLocation: async (id_motorista, status, latitude, longitude) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/atualiza_local.php', toFormData({ id_motorista, status, latitude, longitude }));
    },
    updateRideStatus: async (id_corrida, status, id_cidade, taxa = null) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        const payload = { id_corrida, status, id_cidade };
        if (taxa) payload.taxa = taxa;
        const response = await axiosInstance.post('motoristas/atualiza.php', toFormData(payload));
        assertPhpOk(response, 'Atualização de status');
        return response;
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
    // Troca de senha do próprio motorista (logado). Backend valida a senha atual.
    changePassword: async (id_motorista, senha_atual, nova_senha) => {
        if (CONFIG.USE_MOCKS) return { data: { status: 'sucesso', mensagem: 'Senha alterada com sucesso.' } };
        return axiosInstance.post('motoristas/redefinir_senha_logado.php', toFormData({ id_motorista, senha_atual, nova_senha }));
    },
    // Motoristas online por perto (radar de carrinhos no mapa do motorista).
    getNearbyDrivers: async (cidade_id, excluir_id = '') => {
        if (CONFIG.USE_MOCKS) return { data: [] };
        return axiosInstance.post('motoristas/motoristas_proximos.php', toFormData({ cidade_id, excluir_id }));
    },
    // Avaliações de um motorista (média + lista) — perfil do motorista no app do passageiro.
    getDriverRatings: async (id_motorista) => {
        if (CONFIG.USE_MOCKS) return { data: { media: 0, total: 0, avaliacoes: [] } };
        return axiosInstance.post('motoristas/get_avaliacoes.php', toFormData({ id_motorista }));
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
        const response = await axiosInstance.post('motoristas/atualiza_taxi.php', toFormData(payload));
        assertPhpOk(response, 'Finalização via taxímetro');
        return response;
    },
    /** Finaliza corrida: tenta atualiza_taxi.php e, se falhar, usa atualiza.php status=4 (como simulate-driver-flow.sh). */
    finishRide: async (payload) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        try {
            return await axiosInstance.post('motoristas/atualiza_taxi.php', toFormData(payload)).then((res) => {
                assertPhpOk(res, 'Finalização via taxímetro');
                return res;
            });
        } catch (taxiErr) {
            console.warn('[finishRide] atualiza_taxi falhou, tentando atualiza.php status=4:', taxiErr?.message);
            const fallback = await axiosInstance.post(
                'motoristas/atualiza.php',
                toFormData({
                    id_corrida: payload.id_corrida,
                    status: 4,
                    id_cidade: payload.id_cidade,
                    taxa: payload.taxa,
                })
            );
            assertPhpOk(fallback, 'Finalização da corrida');
            return fallback;
        }
    },
    cancelRideByDriver: async (id_corrida) => {
        if (CONFIG.USE_MOCKS) return { data: 'ok' };
        return axiosInstance.post('motoristas/cancelar.php', toFormData({ id_corrida }));
    },
    getOpenRides: async (motorista_id) => {
        if (CONFIG.USE_MOCKS) return { data: [] };
        const response = await axiosInstance.post('motoristas/busca_abertas.php', toFormData({ motorista_id }));
        if (response.data === 'no' || !response.data) return { ...response, data: [] };
        if (typeof response.data === 'string') {
            try {
                const parsed = JSON.parse(response.data);
                return { ...response, data: Array.isArray(parsed) ? parsed : [] };
            } catch {
                return { ...response, data: [] };
            }
        }
        return { ...response, data: Array.isArray(response.data) ? response.data : [] };
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
    /** Tarifas do taxímetro definidas no PAINEL (por cidade): tx_minima/tx_minuto/tx_km. */
    getTaximetro: async (cidade_id) => {
        const response = await axiosInstance.post('motoristas/get_taximetro.php', toFormData({ cidade_id }));
        return response;
    },
    getDriverHistory: async (id_motorista, data, options = {}) => {
        if (CONFIG.USE_MOCKS) return { data: MOCK_DATA.driver_history };
        const payload = { id_motorista };
        if (options.modo) {
            payload.modo = options.modo;
        } else if (data) {
            payload.data = data;
        } else {
            payload.modo = 'recent';
        }
        const response = await axiosInstance.post('motoristas/busca_historico.php', toFormData(payload));
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
    const s = String(filename ?? '').trim();
    if (!s || s === 'default.jpg' || s === 'default.png' || s === 'sem_imagem.png') {
      return `${CONFIG.IMAGE_BASE_URL}default_driver.png`;
    }
    if (/^(https?:|file:|content:|data:)/i.test(s)) return s;
    // Prioridade: domínio ANTIGO (hospeda as imagens das contas antigas).
    return `${CONFIG.IMAGE_BASE_URL_OLD}${s}`;
  },
  // URLs candidatas para uma imagem, em ordem de tentativa: ANTIGO -> NOVO.
  // Usado pelo componente SmartImage (cai pro novo se o antigo der 404).
  getImageCandidates: (filename) => {
    const s = String(filename ?? '').trim();
    if (!s || s === 'default.jpg' || s === 'default.png' || s === 'sem_imagem.png') return [];
    if (/^(https?:|file:|content:|data:)/i.test(s)) return [s];
    return [
      `${CONFIG.IMAGE_BASE_URL_OLD}${s}`,
      `${CONFIG.IMAGE_BASE_URL}${s}`,
    ];
  }
};

export default api;
