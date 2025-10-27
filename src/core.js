/**
 * Exemplo de estrutura para src/core.js
 * Este arquivo deve exportar as funções e classes core do sistema
 */

import axios from 'axios';
// Node.js 20+ tem fetch nativo, não precisa importar node-fetch

// Configurações
export const CONFIG = {
  VETCARE_URL: process.env.VETCARE_URL || 'https://vet.talkhub.me/api',
  VETCARE_TOKEN: process.env.VETCARE_TOKEN || '',
  EVOLUTION_URL: process.env.EVOLUTION_URL || 'https://api.talkhub.me',
  EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE || 'BICHOSOLTO',
  EVOLUTION_APIKEY: process.env.EVOLUTION_APIKEY || '',
  CLINIC_ID: parseInt(process.env.CLINIC_ID || '1'),
  CLINIC_NAME: process.env.CLINIC_NAME || 'Clínica Veterinária Bicho Solto',
  MAX_DEBT_ALLOWED: parseFloat(process.env.MAX_DEBT_ALLOWED || '200.00'),
  PIX_DISCOUNT_PERCENT: parseFloat(process.env.PIX_DISCOUNT_PERCENT || '5'),
  ADVANCE_BOOKING_DAYS: parseInt(process.env.ADVANCE_BOOKING_DAYS || '30'),
  API_TIMEOUT: parseInt(process.env.API_TIMEOUT || '30000'),
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '300000')
};

// Códigos de erro MCP
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
  APPLICATION_ERROR: -32001
};

// Classe de erro MCP
export class MCPError extends Error {
  constructor(code, message, data = null) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

// Mensagens amigáveis
export const FriendlyMessages = {
  CUSTOMER_NOT_FOUND: 'Cliente não encontrado. Por favor, verifique o telefone informado.',
  PET_NOT_FOUND: 'Pet não encontrado. Verifique o nome ou ID do pet.',
  SERVICE_NOT_FOUND: 'Serviço não encontrado. Tente buscar por outro termo.',
  NO_SLOTS_AVAILABLE: 'Não há horários disponíveis para a data solicitada.',
  BOOKING_FAILED: 'Não foi possível realizar o agendamento. Por favor, tente novamente.',
  INVALID_DATE: 'Data inválida. Use o formato DD/MM/YYYY ou YYYY-MM-DD.',
  INVALID_TIME: 'Horário inválido. Use o formato HH:MM.',
  API_ERROR: 'Erro ao comunicar com o servidor. Por favor, tente novamente.'
};

// API Client para VetCare
export const vetcareAPI = {
  client: axios.create({
    baseURL: CONFIG.VETCARE_URL,
    timeout: CONFIG.API_TIMEOUT,
    headers: {
      'Authorization': `Bearer ${CONFIG.VETCARE_TOKEN}`,
      'Content-Type': 'application/json'
    }
  }),

  stats: {
    requests_made: 0,
    errors: 0,
    success_rate: '100%'
  },

  async get(endpoint, params = {}) {
    try {
      this.stats.requests_made++;
      const response = await this.client.get(endpoint, { params });
      systemLogger.debug(`API GET ${endpoint}`, { params, status: response.status });
      return response.data;
    } catch (error) {
      this.stats.errors++;
      systemLogger.error(`API GET ${endpoint} failed`, { error: error.message });
      throw new MCPError(
        ErrorCodes.SERVER_ERROR,
        FriendlyMessages.API_ERROR,
        { originalError: error.message, endpoint }
      );
    }
  },

  async post(endpoint, data = {}) {
    try {
      this.stats.requests_made++;
      const response = await this.client.post(endpoint, data);
      systemLogger.debug(`API POST ${endpoint}`, { data, status: response.status });
      return response.data;
    } catch (error) {
      this.stats.errors++;
      systemLogger.error(`API POST ${endpoint} failed`, { error: error.message });
      throw new MCPError(
        ErrorCodes.SERVER_ERROR,
        FriendlyMessages.API_ERROR,
        { originalError: error.message, endpoint }
      );
    }
  },

  async put(endpoint, data = {}) {
    try {
      this.stats.requests_made++;
      const response = await this.client.put(endpoint, data);
      systemLogger.debug(`API PUT ${endpoint}`, { data, status: response.status });
      return response.data;
    } catch (error) {
      this.stats.errors++;
      systemLogger.error(`API PUT ${endpoint} failed`, { error: error.message });
      throw new MCPError(
        ErrorCodes.SERVER_ERROR,
        FriendlyMessages.API_ERROR,
        { originalError: error.message, endpoint }
      );
    }
  },

  async delete(endpoint) {
    try {
      this.stats.requests_made++;
      const response = await this.client.delete(endpoint);
      systemLogger.debug(`API DELETE ${endpoint}`, { status: response.status });
      return response.data;
    } catch (error) {
      this.stats.errors++;
      systemLogger.error(`API DELETE ${endpoint} failed`, { error: error.message });
      throw new MCPError(
        ErrorCodes.SERVER_ERROR,
        FriendlyMessages.API_ERROR,
        { originalError: error.message, endpoint }
      );
    }
  },

  getStats() {
    const successRate = this.stats.requests_made > 0
      ? ((this.stats.requests_made - this.stats.errors) / this.stats.requests_made * 100).toFixed(2)
      : '100';

    return {
      ...this.stats,
      success_rate: `${successRate}%`
    };
  }
};

// Sistema de cache
export const cache = {
  data: new Map(),
  
  get(key) {
    const item = this.data.get(key);
    if (item && Date.now() < item.expiry) {
      return item.value;
    }
    this.data.delete(key);
    return null;
  },
  
  set(key, value, ttl = CONFIG.CACHE_TTL) {
    this.data.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  },
  
  clear() {
    this.data.clear();
  },
  
  getInfo() {
    return {
      size: this.data.size,
      memory: process.memoryUsage().heapUsed
    };
  },
  
  async preload(api) {
    console.log('Preloading cache...');
    // Implementar pré-carregamento se necessário
  },
  
  destroy() {
    this.clear();
  }
};

// Logger do sistema
export const systemLogger = {
  info(message, data = {}) {
    console.log(`[INFO] ${message}`, JSON.stringify(data));
  },
  
  error(message, data = {}) {
    console.error(`[ERROR] ${message}`, JSON.stringify(data));
  },
  
  debug(message, data = {}) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEBUG] ${message}`, JSON.stringify(data));
    }
  },
  
  critical(message, data = {}) {
    console.error(`[CRITICAL] ${message}`, JSON.stringify(data));
  }
};

// Formatador de resposta MCP
export function formatMCPResponse(id, result = null, error = null) {
  const response = {
    jsonrpc: "2.0",
    id
  };
  
  if (error) {
    response.error = {
      code: error.code || ErrorCodes.INTERNAL_ERROR,
      message: error.message || 'Unknown error',
      data: error.data || null
    };
  } else {
    response.result = result;
  }
  
  return response;
}
