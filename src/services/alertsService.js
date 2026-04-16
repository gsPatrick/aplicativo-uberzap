import api from './api';

// Serviço para Gerenciar Histórico de Alertas e Sincronização com Backend
let alerts = [];
let listeners = [];

const alertsService = {
    addAlert: (alert) => {
        alerts = [{ id: Date.now(), ...alert, date: new Date().toLocaleString('pt-BR') }, ...alerts];
        listeners.forEach(listener => listener(alerts));
    },
    fetchAlerts: async (id_motorista) => {
        try {
            const resp = await api.driver.getDriverAlerts(id_motorista);
            const d = resp.data;
            if (!d || d === 'no') {
                alerts = [];
                listeners.forEach(listener => listener(alerts));
                return;
            }
            if (typeof d === 'string') {
                alerts = [{
                    id: Date.now(),
                    msg: d,
                    date: new Date().toLocaleString('pt-BR'),
                    type: 'info',
                }];
                listeners.forEach(listener => listener(alerts));
                return;
            }
            if (Array.isArray(d)) {
                const mapped = d.map(item => ({
                    id: item.id || Math.random(),
                    msg: item.msg || item.mensagem,
                    date: item.data || item.date || new Date().toLocaleDateString('pt-BR'),
                    type: item.tipo || 'info',
                }));
                alerts = mapped;
                listeners.forEach(listener => listener(alerts));
            }
        } catch (e) {
            console.error('Erro ao buscar alertas:', e);
        }
    },
    getAlerts: () => {
        return alerts;
    },
    subscribe: (listener) => {
        listeners.push(listener);
        return () => {
            listeners = listeners.filter(l => l !== listener);
        };
    },
    clearAlerts: () => {
        alerts = [];
        listeners.forEach(listener => listener(alerts));
    }
};

export default alertsService;
