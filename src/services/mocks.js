// Dados Mockados para Testes de Interface
export const MOCK_DATA = {
  login: {
    status: 'sucesso',
    id: 1,
    nome: 'Passageiro de Teste',
    email: 'teste@uberzap.com.br',
    cidade_id: 1,
    ativo: 1,
    usuario: {
      id: 1,
      nome: 'Passageiro de Teste',
      email: 'teste@uberzap.com.br',
      cpf: '123.456.789-00',
      token: 'mock_token_123',
    },
  },
  
  categorias: [
    { id: 1, nome: 'Diamante', tx_base: '14,30' },
    { id: 2, nome: 'Econômico', tx_base: '10,50' },
    { id: 3, nome: 'Conforto', tx_base: '18,90' },
  ],

  categorias_calculadas: {
    categorias: [
        { id: 1, nome: 'Diamante', taxa: '15,50', img: 'car_diamante', motorista_tempo: 3, motorista_km: 1.2, surge_active: true, surge_label: 'Tarifa Dinâmica' },
        { id: 2, nome: 'Econômico', taxa: '11,20', img: 'car_eco', motorista_tempo: 5, motorista_km: 2.5, surge_active: false },
        { id: 3, nome: 'Conforto', taxa: '19,80', img: 'car_conf', motorista_tempo: 2, motorista_km: 0.8, surge_active: true, surge_label: 'Alta Demanda' },
    ],
    dados: { km: '5.2', minutos: '12' }
  },

  nearby_drivers: [
    { id: 201, latitude: -23.5412, longitude: -46.6631, online: '1', ativo: '1' },
    { id: 202, latitude: -23.5458, longitude: -46.6685, online: '1', ativo: '1' },
    { id: 203, latitude: -23.5492, longitude: -46.6598, online: '1', ativo: '1' },
    { id: 204, latitude: -23.5521, longitude: -46.6712, online: '1', ativo: '1' },
  ],

  cities: [
    { id: 1, nome: 'São Paulo (Capital)' },
    { id: 2, nome: 'Campinas' },
  ],

  city_data: {
    cidade: 'São Paulo',
    telefone: '(11) 99999-9999',
    email: 'suporte.sp@ubezap.com.br',
    latitude: '-23.5505',
    longitude: '-46.6333'
  },
  
  status_corrida: {
    status: '1',
    motorista: {
      id: 101,
      nome: 'Carlos Eduardo',
      veiculo: 'Celta Prata',
      placa: 'ABC-1234',
      foto: 'https://randomuser.me/api/portraits/men/32.jpg',
      img_frente: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=1000',
      rating: '4.9',
      latitude: '-23.5577',
      longitude: '-46.6583',
      tempo_chegada: '3 min'
    }
  },

  wallet: {
    saldo: '45,00',
    transacoes: [
      { id: 1, date: '31/03/2026 14:20', valor: '20,00', tipo: 'Entrada', status: 'Confirmado', descricao: 'Recarga via PIX' },
      { id: 2, date: '30/03/2026 10:15', valor: '15,50', tipo: 'Saída', status: 'Confirmado', descricao: 'Viagem - Diamante' },
      { id: 3, date: '29/03/2026 18:45', valor: '50,00', tipo: 'Entrada', status: 'Confirmado', descricao: 'Recarga via Cartão' },
    ]
  },

  historico: [
    { 
      id: 1, 
      date: '01/04/2026 14:30', 
      valor: '25,50', 
      motorista: 'Ricardo Silva', 
      endereco_ini: 'Rua das Flores, 123', 
      endereco_fim: 'Av. Paulista, 1000',
      lat_ini: -23.5617,
      lng_ini: -46.6623,
      lat_fim: -23.5489,
      lng_fim: -46.6388,
      veiculo: 'Toyota Corolla',
      placa: 'UBZ-2026',
      img_frente: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=400',
      status: 'Finalizada',
      avaliacao: 5
    },
    { 
      id: 2, 
      date: '31/03/2026 10:15', 
      valor: '18,20', 
      motorista: 'Ana Oliveira', 
      endereco_ini: 'Shopping Center Norte', 
      endereco_fim: 'Rua Augusta, 500',
      lat_ini: -23.5165,
      lng_ini: -46.6166,
      lat_fim: -23.5594,
      lng_fim: -46.6618,
      veiculo: 'Celta Prata',
      placa: 'ABC-1234',
      img_frente: 'https://www.uber-assets.com/image/upload/f_auto,q_auto:eco,c_fill,w_956,h_637/v1555355171/assets/39/c46522-598d-442b-9441-2f22b784a0d9/original/UberX.png',
      status: 'Finalizada',
      avaliacao: 4
    },
    { id: 1003, date: '28/03/2026 08:30', motorista: 'Ana Souza', valor: '22,90', status: 'Finalizada', avaliacao: 5, endereco_ini: 'Aeroporto Congonhas', endereco_fim: 'Hotel Hilton', lat_ini: -23.6267, lng_ini: -46.6567, lat_fim: -23.5505, lng_fim: -46.6333, veiculo: 'Ford Ka', placa: 'KAP-1003' },
  ],

  driver_earnings: {
    qnt_hoje: 12,
    valor_hoje: '185,40',
    taxa_hoje: '18,54',
    lucro_hoje: '166,86',
    qnt_semana: 45,
    valor_semana: '840,00',
    taxa_semana: '84,00',
    lucro_semana: '756,00',
    qnt_mes: 180,
    valor_mes: '3.240,00',
    taxa_mes: '324,00',
    lucro_mes: '2.916,00',
    qnt_fim: 450,
    valor_fim: '8.450,00',
    saldo_plataforma: '150,25'
  },

  banners: [
    { id: 1, img: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=2070', link: '#' },
    { id: 2, img: 'https://images.unsplash.com/photo-1557403084-c5973dd93218?auto=format&fit=crop&q=80&w=1974', link: '#' },
    { id: 3, img: 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&q=80&w=2089', link: '#' }
  ],

  notifications: [
    { id: 1, msg: 'Novo cupom disponível: BEMVINDO10', date: '01/04/2026 10:00', hora: '01/04/2026 às 10:00' },
    { id: 2, msg: 'Sua última viagem foi avaliada com 5 estrelas!', date: '31/03/2026 18:30', hora: '31/03/2026 às 18:30' },
    { id: 3, msg: 'Promoção: Ganhe 20% de desconto em viagens para o shopping.', date: '30/03/2026 09:15', hora: '30/03/2026 às 09:15' }
  ],
  
  driver_report: {
    qnt_hoje: 12,
    valor_hoje: '185,40',
    taxa_hoje: '18,54',
    lucro_hoje: '166,86',
    qnt_semana: 45,
    valor_semana: '840,00',
    taxa_semana: '84,00',
    lucro_semana: '756,00',
    qnt_mes: 180,
    valor_mes: '3.240,00',
    taxa_mes: '324,00',
    lucro_mes: '2.916,00',
    qnt_fim: 850,
    valor_fim: '25.400,00',
    saldo_plataforma: '45,20',
    grafico: [20, 35, 45, 30, 55, 40, 60]
  },
  
  driver_transactions: [
    { id: 1, date: '01/04/2026 14:30', valor: '25,50', tipo: 'Corrida', status: 'Confirmado', descricao: 'ID Viagem #1023' },
    { id: 2, date: '01/04/2026 10:15', valor: '2,55', tipo: 'Taxa', status: 'Confirmado', descricao: 'Taxa de Serviço UbeZap' },
    { id: 3, date: '31/03/2026 18:45', valor: '150,00', tipo: 'Saque', status: 'Pendente', descricao: 'Solicitação de Transferência' },
    { id: 4, date: '31/03/2026 08:30', valor: '22,90', tipo: 'Corrida', status: 'Confirmado', descricao: 'ID Viagem #1019' },
  ],

  driver_history: [
    { id: 1, date: '01/04/2026 14:30', hora: '14:30', valor: '25,50', taxa: '2,55', km: '5.2', tempo: '12', endereco_ini_txt: 'Rua das Flores, 123', endereco_fim_txt: 'Av. Paulista, 1000', lat_ini: -23.5617, lng_ini: -46.6623, lat_fim: -23.5489, lng_fim: -46.6388, status: '4', nome_cliente: 'João Silva' },
    { id: 2, date: '01/04/2026 10:15', hora: '10:15', valor: '18,20', taxa: '1,82', km: '3.8', tempo: '9', endereco_ini_txt: 'Shopping Center Norte', endereco_fim_txt: 'Rua Augusta, 500', lat_ini: -23.5165, lng_ini: -46.6166, lat_fim: -23.5594, lng_fim: -46.6618, status: '4', nome_cliente: 'Maria Oliveira' },
    { id: 3, date: '01/04/2026 08:45', hora: '08:45', valor: '12,00', taxa: '1,20', km: '2.5', tempo: '6', endereco_ini_txt: 'Terminal Tietê', endereco_fim_txt: 'Hotel Ibis', lat_ini: -23.5155, lng_ini: -46.6266, lat_fim: -23.5255, lng_fim: -46.6366, status: '5', nome_cliente: 'Pedro Santos' },
  ],
  
  chat: [
    { id: 1, id_corrida: 999, msg: 'Olá! Já estou a caminho.', sender: '1', date: '2026-04-02 14:00:00' },
    { id: 2, id_corrida: 999, msg: 'Estou na calçada de blusa azul.', sender: '2', date: '2026-04-02 14:01:00' },
    { id: 3, id_corrida: 999, msg: 'Perfeito, chego em 2 minutos.', sender: '1', date: '2026-04-02 14:02:00' }
  ]
};
