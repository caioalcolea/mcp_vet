#!/usr/bin/env node

/**
 * VetCare MCP Server - Sistema de Gestão Veterinária
 * Versão 4.0.0 - PRODUÇÃO OTIMIZADA
 *
 * ✨ RECURSOS v4.0:
 *  - 45+ ferramentas completas de gestão veterinária
 *  - NOVA: Histórico clínico completo (vacinas, peso, exames, consultas)
 *  - NOVA: Verificação inteligente de vacinas atrasadas
 *  - NOVA: Workflow de agendamento com validação automática
 *  - NOVA: Validação de horários disponíveis em tempo real
 *  - Sistema financeiro integrado (contas, caixa, vendas)
 *  - Dashboard com insights e KPIs
 *  - Gestão de estoque e produtos fracionados
 *  - Validação OBRIGATÓRIA em buscas (proteção anti-overload)
 *  - Cache inteligente multi-nível com cache negativo
 *  - Rate limiting adaptativo
 *  - Compatível com OpenAI ChatGPT e Claude
 *  - Suporte completo ao protocolo MCP 2024-11-05
 *
 * API Base: https://vet.talkhub.me/api (100% funcional)
 *
 * 🔒 SEGURANÇA:
 *  - Nunca retorna listas completas (5000+ clientes protegidos)
 *  - Busca obrigatória com mínimo 3 caracteres
 *  - Limite de 50 resultados por busca
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

global.fetch = fetch;

// ==================== CONFIGURAÇÕES ====================

const CONFIG = {
  PORT: process.env.PORT || 5150,
  HOST: process.env.HOST || '0.0.0.0',
  DOMAIN: process.env.DOMAIN || 'vet.talkhub.me',
  
  // VetCare API
  VETCARE_API_URL: process.env.VETCARE_API_URL || 'https://vet.talkhub.me/api',
  
  // Configurações de rede
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000,
  API_TIMEOUT: 30000,
  
  // Cache TTL (em milissegundos)
  CACHE_TTL: {
    SHORT: 60000,      // 1 min - dados voláteis
    MEDIUM: 300000,    // 5 min - dados normais  
    LONG: 900000,      // 15 min - dados estáticos
    PERMANENT: 3600000,// 1 hora - dados fixos
    NEGATIVE: 30000    // 30 seg - cache de erros
  },
  
  // Rate Limiting
  RATE_LIMIT_WINDOW: 60000,  // 1 minuto
  RATE_LIMIT_MAX: 100,        // máximo de requisições
  
  // Features flags
  FEATURES: {
    CACHE_ENABLED: true,
    NEGATIVE_CACHE_ENABLED: true,
    RATE_LIMIT_ENABLED: true,
    METRICS_ENABLED: true,
    REQUEST_LOGGING: true,
    DEBUG_MODE: process.env.DEBUG === 'true'
  }
};

console.log('🚀 VetCare MCP Server v4.0.0 - Produção Otimizada');
console.log('====================================================');
console.log('📊 45+ ferramentas disponíveis');
console.log('🔒 Proteção anti-overload ativa (buscas obrigatórias)');
console.log('✅ 100% integrado com API real: https://vet.talkhub.me/api');

// ==================== SISTEMA DE LOGGING ====================

const LogLevel = {
  DEBUG: 0,
  INFO: 1, 
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

const currentLogLevel = CONFIG.FEATURES.DEBUG_MODE ? LogLevel.DEBUG : LogLevel.INFO;

function log(category, message, data = null, level = LogLevel.INFO) {
  if (level < currentLogLevel) return;
  
  const timestamp = new Date().toISOString();
  const levelStr = Object.keys(LogLevel)[Object.values(LogLevel).indexOf(level)];
  const dataStr = data ? ` | ${JSON.stringify(data).substring(0, 500)}` : '';
  
  const logMessage = `[${timestamp}] [${levelStr}] [${category}] ${message}${dataStr}`;
  
  if (level >= LogLevel.ERROR) {
    console.error(logMessage);
  } else if (level === LogLevel.WARN) {
    console.warn(logMessage);
  } else {
    console.log(logMessage);
  }
}

// ==================== SISTEMA DE CACHE AVANÇADO ====================

class SmartCache {
  constructor(defaultTTL = CONFIG.CACHE_TTL.MEDIUM) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.hits = 0;
    this.misses = 0;
    this.negativeHits = 0;
    this.enabled = CONFIG.FEATURES.CACHE_ENABLED;
    this.negativeEnabled = CONFIG.FEATURES.NEGATIVE_CACHE_ENABLED;
  }
  
  set(key, value, ttl = null) {
    if (!this.enabled) return;
    
    const expiry = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, { 
      value, 
      expiry, 
      hits: 0, 
      created: Date.now(),
      isNegative: false 
    });
    log('CACHE', `Set: ${key} (TTL: ${(ttl || this.defaultTTL) / 1000}s)`, null, LogLevel.DEBUG);
  }
  
  setNegative(key, error, ttl = CONFIG.CACHE_TTL.NEGATIVE) {
    if (!this.enabled || !this.negativeEnabled) return;
    
    const expiry = Date.now() + ttl;
    this.cache.set(key, { 
      value: null, 
      error: error, 
      expiry, 
      isNegative: true,
      created: Date.now() 
    });
    log('CACHE', `Set negative: ${key} - ${error}`, null, LogLevel.DEBUG);
  }
  
  get(key) {
    if (!this.enabled) return null;
    
    const item = this.cache.get(key);
    if (!item) {
      this.misses++;
      return null;
    }
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    if (item.isNegative) {
      this.negativeHits++;
      return { cached: true, error: item.error };
    }
    
    item.hits++;
    this.hits++;
    return item.value;
  }
  
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      log('CACHE', `Deleted: ${key}`, null, LogLevel.DEBUG);
    }
    return deleted;
  }
  
  deletePattern(pattern) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      log('CACHE', `Deleted ${count} keys matching pattern: ${pattern}`, null, LogLevel.DEBUG);
    }
  }
  
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.negativeHits = 0;
    log('CACHE', `Cleared ${size} entries`);
  }
  
  stats() {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(2) : 0;
    return {
      enabled: this.enabled,
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      negativeHits: this.negativeHits,
      hitRate: `${hitRate}%`
    };
  }
  
  cleanup() {
    let removed = 0;
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      log('CACHE', `Cleanup: removed ${removed} expired entries`, null, LogLevel.DEBUG);
    }
  }
}

// Instâncias de cache especializadas
const cacheInstances = {
  clientes: new SmartCache(CONFIG.CACHE_TTL.MEDIUM),
  pets: new SmartCache(CONFIG.CACHE_TTL.MEDIUM),
  agendamentos: new SmartCache(CONFIG.CACHE_TTL.SHORT),
  servicos: new SmartCache(CONFIG.CACHE_TTL.LONG),
  veterinarios: new SmartCache(CONFIG.CACHE_TTL.LONG),
  vacinas: new SmartCache(CONFIG.CACHE_TTL.LONG),
  produtos: new SmartCache(CONFIG.CACHE_TTL.MEDIUM),
  financeiro: new SmartCache(CONFIG.CACHE_TTL.SHORT),
  dashboard: new SmartCache(CONFIG.CACHE_TTL.SHORT)
};

// Cleanup automático
setInterval(() => {
  Object.values(cacheInstances).forEach(cache => cache.cleanup());
}, 60000);

// ==================== TRATAMENTO DE ERROS ====================

class MCPError extends Error {
  constructor(code, message, data = null) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = 'MCPError';
  }
}

const ErrorCodes = {
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  VALIDATION_ERROR: -32604,
  RATE_LIMIT_ERROR: -32605,
  API_ERROR: -32606,
  TIMEOUT_ERROR: -32607
};

// ==================== RATE LIMITING ====================

class RateLimiter {
  constructor(windowMs = CONFIG.RATE_LIMIT_WINDOW, maxRequests = CONFIG.RATE_LIMIT_MAX) {
    this.requests = new Map();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.enabled = CONFIG.FEATURES.RATE_LIMIT_ENABLED;
  }
  
  checkLimit(identifier) {
    if (!this.enabled) return true;
    
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];
    
    const recentRequests = userRequests.filter(time => now - time < this.windowMs);
    
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    
    if (Math.random() < 0.1) {
      this.cleanup();
    }
    
    return true;
  }
  
  cleanup() {
    const now = Date.now();
    for (const [id, times] of this.requests.entries()) {
      const recent = times.filter(time => now - time < this.windowMs);
      if (recent.length === 0) {
        this.requests.delete(id);
      } else {
        this.requests.set(id, recent);
      }
    }
  }
  
  getRemainingTime(identifier) {
    const userRequests = this.requests.get(identifier) || [];
    if (userRequests.length === 0) return 0;
    
    const oldestRequest = Math.min(...userRequests);
    const remainingMs = (oldestRequest + this.windowMs) - Date.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }
}

const rateLimiter = new RateLimiter();

// ==================== VALIDADORES ====================

const Validators = {
  // Telefone brasileiro com suporte a código de país
  telefone(value) {
    if (!value) return null;
    let numeros = value.replace(/\D/g, '');
    
    // Remover código do país se presente (55)
    if (numeros.startsWith('55') && numeros.length > 11) {
      numeros = numeros.substring(2);
    }
    
    if (numeros.length < 10 || numeros.length > 11) {
      throw new Error('Telefone inválido. Deve ter 10 ou 11 dígitos (sem código do país).');
    }
    return numeros;
  },

  // CPF com verificação completa
  cpf(value) {
    if (!value) return false;
    let cpf = value.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    
    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += parseInt(cpf[i]) * (10 - i);
    }
    let digito1 = 11 - (soma % 11);
    if (digito1 > 9) digito1 = 0;
    if (parseInt(cpf[9]) !== digito1) return false;
    
    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += parseInt(cpf[i]) * (11 - i);
    }
    let digito2 = 11 - (soma % 11);
    if (digito2 > 9) digito2 = 0;
    if (parseInt(cpf[10]) !== digito2) return false;
    
    return true;
  },

  // Email
  email(value) {
    if (!value) return null;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(value)) {
      throw new Error('Email inválido');
    }
    return value.toLowerCase();
  },

  // Data YYYY-MM-DD
  data(value) {
    if (!value) return null;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(value)) {
      throw new Error('Data inválida. Use formato YYYY-MM-DD');
    }
    const date = new Date(value + 'T00:00:00');
    if (isNaN(date.getTime())) {
      throw new Error('Data inválida');
    }
    return value;
  },

  // Data/hora YYYY-MM-DD HH:MM:SS
  dataHora(value) {
    if (!value) {
      throw new Error('Data/hora é obrigatória');
    }
    const regex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    if (!regex.test(value)) {
      throw new Error('Data/hora inválida. Use formato YYYY-MM-DD HH:MM:SS');
    }
    const date = new Date(value.replace(' ', 'T'));
    if (isNaN(date.getTime())) {
      throw new Error('Data/hora inválida');
    }
    return value;
  },

  // Sexo M/F
  sexo(value) {
    if (!value) throw new Error('Sexo é obrigatório');
    const sexoUpper = value.toUpperCase();
    if (sexoUpper !== 'M' && sexoUpper !== 'F') {
      throw new Error('Sexo deve ser M ou F');
    }
    return sexoUpper;
  },

  // Valor monetário
  valor(value) {
    if (value === null || value === undefined) return null;
    const valor = parseFloat(value);
    if (isNaN(valor) || valor < 0) {
      throw new Error('Valor inválido');
    }
    return Number(valor.toFixed(2));
  },

  // Status de agendamento
  statusAgendamento(value) {
    const validos = ['Agendado', 'Confirmado', 'Em Atendimento', 'Concluído', 'Cancelado', 'Faltou'];
    if (!validos.includes(value)) {
      throw new Error(`Status inválido. Valores aceitos: ${validos.join(', ')}`);
    }
    return value;
  },

  // Tipo de agendamento
  tipoAgendamento(value) {
    // Mapear nomes de serviços para tipos válidos
    if (!value) return 'Consulta';
    
    const mapeamento = {
      'Consulta Veterinária Básica': 'Consulta',
      'Consulta Veterinária Completa': 'Consulta',
      'Consulta de Retorno': 'Retorno',
      'Atendimento de Emergência': 'Emergência',
      'Cirurgia': 'Cirurgia'
    };
    
    // Se o valor já é um tipo válido
    const tiposValidos = ['Consulta', 'Retorno', 'Emergência', 'Cirurgia'];
    if (tiposValidos.includes(value)) {
      return value;
    }
    
    // Tentar mapear
    if (mapeamento[value]) {
      return mapeamento[value];
    }
    
    // Tentar inferir pelo conteúdo
    const valueLower = value.toLowerCase();
    if (valueLower.includes('consulta')) return 'Consulta';
    if (valueLower.includes('retorno')) return 'Retorno';
    if (valueLower.includes('emergência') || valueLower.includes('emergencia')) return 'Emergência';
    if (valueLower.includes('cirurgia')) return 'Cirurgia';
    
    return 'Consulta'; // Default
  },

  // Forma de pagamento
  formaPagamento(value) {
    const validas = ['Dinheiro', 'Cartão', 'PIX', 'Boleto', 'Cheque', 'Crediário'];
    if (!validas.includes(value)) {
      throw new Error(`Forma de pagamento inválida. Valores aceitos: ${validas.join(', ')}`);
    }
    return value;
  }
};

// ==================== HELPERS ====================

function generateUniqueCPF() {
  const timestamp = Date.now().toString();
  let cpf = timestamp.slice(-9).padStart(9, '0');
  
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf[i]) * (10 - i);
  }
  let digito1 = 11 - (soma % 11);
  if (digito1 > 9) digito1 = 0;
  
  soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf[i]) * (11 - i);
  }
  soma += digito1 * 2;
  let digito2 = 11 - (soma % 11);
  if (digito2 > 9) digito2 = 0;
  
  cpf = cpf + digito1.toString() + digito2.toString();
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatPhone(phone) {
  if (!phone) return '';
  const numbers = phone.replace(/\D/g, '');
  if (numbers.length === 11) {
    return `(${numbers.substring(0, 2)}) ${numbers.substring(2, 7)}-${numbers.substring(7)}`;
  } else if (numbers.length === 10) {
    return `(${numbers.substring(0, 2)}) ${numbers.substring(2, 6)}-${numbers.substring(6)}`;
  }
  return phone;
}

function formatMCPResponse(requestId, result, error = null) {
  const response = { jsonrpc: "2.0", id: requestId };
  if (error) {
    response.error = { 
      code: error.code || ErrorCodes.INTERNAL_ERROR, 
      message: error.message || "Internal error",
      ...(error.data && { data: error.data })
    };
  } else {
    response.result = result;
  }
  return response;
}

// ==================== WRAPPER PARA VALIDAÇÃO ====================

function handleValidationErrors(fn) {
  return async (params) => {
    try {
      return await fn(params);
    } catch (error) {
      if (error.message.includes('inválid') || error.message.includes('obrigatóri')) {
        log('VALIDATION', `Erro de validação: ${error.message}`, null, LogLevel.WARN);
        return {
          success: false,
          error: error.message,
          validation_error: true
        };
      }
      throw error;
    }
  };
}

// ==================== API REQUEST ====================

async function apiRequest(endpoint, method = 'GET', data = null, retries = CONFIG.RETRY_ATTEMPTS) {
  const url = `${CONFIG.VETCARE_API_URL}${endpoint}`;
  
  // Verificar cache negativo primeiro
  const cacheKey = `api_${method}_${endpoint}_${data ? JSON.stringify(data) : ''}`;
  const cached = cacheInstances.financeiro.get(cacheKey);
  if (cached && cached.cached && cached.error) {
    log('API', `Cache negativo hit: ${endpoint}`, null, LogLevel.DEBUG);
    throw new MCPError(ErrorCodes.API_ERROR, cached.error);
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log('API', `${method} ${endpoint} (tentativa ${attempt}/${retries})`, null, LogLevel.DEBUG);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
      
      const options = {
        method,
        headers: {
          'Accept': 'application/json; charset=UTF-8',
          'Content-Type': 'application/json; charset=UTF-8'
        },
        signal: controller.signal
      };
      
      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(data);
      }
      
      const response = await fetch(url, options);
      clearTimeout(timeout);
      
      if (!response.ok) {
        const errorText = await response.text();
        log('API', `Erro ${response.status}:`, errorText, LogLevel.WARN);
        
        if (response.status >= 400 && response.status < 500) {
          // Erro do cliente - não tentar novamente
          const errorMessage = `API Error ${response.status}: ${errorText}`;
          cacheInstances.financeiro.setNegative(cacheKey, errorMessage);
          throw new Error(errorMessage);
        }
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
          continue;
        }
        
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      log('API', `✓ Sucesso ${method} ${endpoint}`, null, LogLevel.DEBUG);
      return { success: true, data: result };
      
    } catch (error) {
      if (error.name === 'AbortError') {
        log('API', `Timeout na requisição ${method} ${endpoint}`, null, LogLevel.ERROR);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
          continue;
        }
        const errorMessage = 'API timeout';
        cacheInstances.financeiro.setNegative(cacheKey, errorMessage);
        throw new MCPError(ErrorCodes.TIMEOUT_ERROR, errorMessage);
      } else {
        log('API', `✗ Erro na requisição ${method} ${endpoint}:`, error.message, LogLevel.ERROR);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
          continue;
        }
        cacheInstances.financeiro.setNegative(cacheKey, error.message);
        throw new MCPError(ErrorCodes.API_ERROR, error.message);
      }
    }
  }
  
  return { success: false, error: 'Max retries exceeded' };
}

// ==================== FERRAMENTAS - CLIENTES ====================

async function buscarClientePorTelefone({ telefone }) {
  log('TOOL', `buscar_cliente_por_telefone: ${telefone}`);
  try {
    const telefoneLimpo = Validators.telefone(telefone);
    if (!telefoneLimpo) {
      return { success: false, found: false, error: 'Telefone inválido' };
    }
    
    const cacheKey = `cliente_tel_${telefoneLimpo}`;
    const cached = cacheInstances.clientes.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, found: false, error: cached.error };
      }
      log('TOOL', '✓ Cliente encontrado no cache');
      return cached;
    }
    
    const result = await apiRequest(`/clientes?busca=${telefoneLimpo}`);
    
    if (!result.success) {
      cacheInstances.clientes.setNegative(cacheKey, result.error);
      return { success: false, found: false, error: result.error };
    }
    
    const clientes = Array.isArray(result.data) ? result.data : result.data.data || [];
    const cliente = clientes.find(c => {
      const telCliente = (c.telefone || '').replace(/\D/g, '');
      const whatsCliente = (c.whatsapp || '').replace(/\D/g, '');
      return telCliente === telefoneLimpo || whatsCliente === telefoneLimpo;
    });
    
    if (!cliente) {
      const response = { success: true, found: false, message: 'Cliente não encontrado' };
      cacheInstances.clientes.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
      return response;
    }
    
    const response = {
      success: true,
      found: true,
      cliente: cliente
    };
    
    cacheInstances.clientes.set(cacheKey, response, CONFIG.CACHE_TTL.MEDIUM);
    return response;
    
  } catch (error) {
    log('TOOL', 'Erro ao buscar cliente:', error.message, LogLevel.ERROR);
    return { success: false, found: false, error: error.message };
  }
}

async function buscarClientes({ termo_busca }) {
  log('TOOL', 'buscar_clientes', { termo_busca });
  try {
    // VALIDAÇÃO OBRIGATÓRIA: Nunca buscar sem filtro (proteção contra 5000+ registros)
    if (!termo_busca || termo_busca.trim().length < 3) {
      return {
        success: false,
        clientes: [],
        error: 'Termo de busca obrigatório (mínimo 3 caracteres). Informe nome, telefone, CPF ou email do cliente.'
      };
    }

    const termoLimpo = termo_busca.trim();
    const endpoint = `/clientes?busca=${encodeURIComponent(termoLimpo)}`;

    // Cache por termo de busca
    const cacheKey = `clientes_busca_${termoLimpo.toLowerCase()}`;
    const cached = cacheInstances.clientes.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, clientes: [], error: cached.error };
      }
      log('TOOL', '✓ Clientes encontrados no cache');
      return cached;
    }

    const result = await apiRequest(endpoint);

    if (!result.success) {
      cacheInstances.clientes.setNegative(cacheKey, result.error);
      return { success: false, clientes: [], error: result.error };
    }

    const clientes = Array.isArray(result.data) ? result.data : [];

    // Limitar a 50 resultados para performance
    const clientesLimitados = clientes.slice(0, 50);

    const response = {
      success: true,
      clientes: clientesLimitados,
      total: clientesLimitados.length,
      total_encontrado: clientes.length,
      limitado: clientes.length > 50
    };

    cacheInstances.clientes.set(cacheKey, response, CONFIG.CACHE_TTL.MEDIUM);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao buscar clientes:', error.message, LogLevel.ERROR);
    return { success: false, clientes: [], error: error.message };
  }
}

async function criarCliente({ dados }) {
  log('TOOL', 'criar_cliente:', dados.nome);
  try {
    if (!dados.nome || dados.nome.trim() === '') {
      throw new Error('Nome do cliente é obrigatório');
    }
    
    let cpf = dados.cpf;
    if (!cpf) {
      cpf = generateUniqueCPF();
      log('TOOL', `CPF gerado: ${cpf}`, null, LogLevel.DEBUG);
    } else if (!Validators.cpf(cpf)) {
      throw new Error('CPF inválido');
    }
    
    const payload = {
      nome: dados.nome.trim(),
      cpf: cpf,
      telefone: dados.telefone ? Validators.telefone(dados.telefone) : '',
      email: dados.email ? Validators.email(dados.email) : '',
      whatsapp: dados.whatsapp ? Validators.telefone(dados.whatsapp) : dados.telefone || '',
      endereco: dados.endereco || '',
      numero: dados.numero || '',
      complemento: dados.complemento || '',
      bairro: dados.bairro || '',
      cidade: dados.cidade || '',
      estado: dados.estado || '',
      cep: dados.cep ? dados.cep.replace(/\D/g, '') : '',
      observacoes: dados.observacoes || '',
      ativo: dados.ativo !== false ? 1 : 0
    };
    
    const result = await apiRequest('/clientes', 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.clientes.deletePattern(/cliente_tel_/);
    
    return {
      success: true,
      cliente: result.data,
      message: 'Cliente criado com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao criar cliente:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function atualizarCliente({ cliente_id, dados_atualizacao }) {
  log('TOOL', `atualizar_cliente: ${cliente_id}`);
  try {
    const payload = {};
    
    if (dados_atualizacao.nome) payload.nome = dados_atualizacao.nome.trim();
    if (dados_atualizacao.telefone) payload.telefone = Validators.telefone(dados_atualizacao.telefone);
    if (dados_atualizacao.email) payload.email = Validators.email(dados_atualizacao.email);
    if (dados_atualizacao.whatsapp) payload.whatsapp = Validators.telefone(dados_atualizacao.whatsapp);
    if (dados_atualizacao.endereco !== undefined) payload.endereco = dados_atualizacao.endereco;
    if (dados_atualizacao.cidade !== undefined) payload.cidade = dados_atualizacao.cidade;
    if (dados_atualizacao.ativo !== undefined) payload.ativo = dados_atualizacao.ativo;
    
    const result = await apiRequest(`/clientes/${cliente_id}`, 'PUT', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.clientes.deletePattern(/cliente_/);
    
    return {
      success: true,
      cliente: result.data,
      message: 'Cliente atualizado com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao atualizar cliente:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== FERRAMENTAS - PETS ====================

async function listarPetsCliente({ cliente_id }) {
  log('TOOL', `listar_pets_cliente: ${cliente_id}`);
  try {
    const cacheKey = `pets_cliente_${cliente_id}`;
    const cached = cacheInstances.pets.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, pets: [], error: cached.error };
      }
      log('TOOL', '✓ Pets encontrados no cache');
      return cached;
    }
    
    const result = await apiRequest(`/clientes/${cliente_id}/pets`);
    
    if (!result.success) {
      cacheInstances.pets.setNegative(cacheKey, result.error);
      return { success: false, pets: [], error: result.error };
    }
    
    const response = {
      success: true,
      pets: result.data,
      total: result.data.length
    };
    
    cacheInstances.pets.set(cacheKey, response, CONFIG.CACHE_TTL.MEDIUM);
    return response;
    
  } catch (error) {
    log('TOOL', 'Erro ao listar pets:', error.message, LogLevel.ERROR);
    return { success: false, pets: [], error: error.message };
  }
}

async function buscarPetPorId({ pet_id }) {
  log('TOOL', `buscar_pet_por_id: ${pet_id}`);
  try {
    const cacheKey = `pet_${pet_id}`;
    const cached = cacheInstances.pets.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, found: false, error: cached.error };
      }
      return cached;
    }
    
    const result = await apiRequest(`/pets/${pet_id}`);
    
    if (!result.success) {
      cacheInstances.pets.setNegative(cacheKey, result.error);
      return { success: false, found: false, error: result.error };
    }
    
    const response = {
      success: true,
      found: true,
      pet: result.data
    };
    
    cacheInstances.pets.set(cacheKey, response, CONFIG.CACHE_TTL.MEDIUM);
    return response;
    
  } catch (error) {
    log('TOOL', 'Erro ao buscar pet:', error.message, LogLevel.ERROR);
    return { success: false, found: false, error: error.message };
  }
}

async function criarPet({ dados }) {
  log('TOOL', 'criar_pet:', dados.nome);
  try {
    if (!dados.cliente_id) throw new Error('cliente_id é obrigatório');
    if (!dados.nome) throw new Error('nome do pet é obrigatório');
    if (!dados.especie) throw new Error('especie é obrigatória');
    
    const payload = {
      cliente_id: parseInt(dados.cliente_id),
      nome: dados.nome.trim(),
      especie: dados.especie.trim(),
      raca: dados.raca || '',
      sexo: Validators.sexo(dados.sexo),
      castrado: Boolean(dados.castrado),
      data_nascimento: Validators.data(dados.data_nascimento),
      peso: dados.peso ? parseFloat(dados.peso) : null,
      pelagem: dados.pelagem || '',
      microchip: dados.microchip || '',
      alergias: dados.alergias || '',
      observacoes: dados.observacoes || '',
      ativo: dados.ativo !== false ? 1 : 0
    };
    
    const result = await apiRequest('/pets', 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.pets.delete(`pets_cliente_${dados.cliente_id}`);
    
    return {
      success: true,
      pet: result.data.pet || result.data,
      message: 'Pet cadastrado com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao criar pet:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== FERRAMENTAS - AGENDAMENTOS ====================

async function listarAgendamentos({ filtros = {} }) {
  log('TOOL', 'listar_agendamentos', filtros);
  try {
    let endpoint = '/agendamentos';
    const params = [];
    
    if (filtros.cliente_id) params.push(`cliente_id=${filtros.cliente_id}`);
    if (filtros.pet_id) params.push(`pet_id=${filtros.pet_id}`);
    if (filtros.status) params.push(`status=${encodeURIComponent(filtros.status)}`);
    if (filtros.data) params.push(`data=${filtros.data}`);
    if (filtros.data_inicio) params.push(`data_inicio=${filtros.data_inicio}`);
    if (filtros.data_fim) params.push(`data_fim=${filtros.data_fim}`);
    
    if (params.length > 0) {
      endpoint += '?' + params.join('&');
    }
    
    const result = await apiRequest(endpoint);
    
    if (!result.success) {
      return { success: false, agendamentos: [], error: result.error };
    }
    
    return {
      success: true,
      agendamentos: result.data,
      total: result.data.length
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao listar agendamentos:', error.message, LogLevel.ERROR);
    return { success: false, agendamentos: [], error: error.message };
  }
}

async function criarAgendamento({ dados }) {
  log('TOOL', 'criar_agendamento:', dados);
  try {
    if (!dados.cliente_id) throw new Error('cliente_id é obrigatório');
    if (!dados.pet_id) throw new Error('pet_id é obrigatório');
    
    // Ajustar o tipo se vier como nome de serviço
    const tipoAjustado = Validators.tipoAgendamento(dados.tipo);
    
    const payload = {
      cliente_id: parseInt(dados.cliente_id),
      pet_id: parseInt(dados.pet_id),
      servico_id: dados.servico_id ? parseInt(dados.servico_id) : null,
      veterinario_id: dados.veterinario_id ? parseInt(dados.veterinario_id) : null,
      data_hora: Validators.dataHora(dados.data_hora),
      tipo: tipoAjustado,
      duracao_minutos: parseInt(dados.duracao_minutos) || 30,
      valor: dados.valor ? parseFloat(dados.valor) : null,
      observacoes: dados.observacoes || '',
      status: dados.status || 'Agendado'
    };
    
    // Validar conflito de horário se veterinário especificado
    if (payload.veterinario_id) {
      const conflito = await apiRequest('/agendamentos/validar-conflito', 'POST', {
        data_hora: payload.data_hora,
        veterinario_id: payload.veterinario_id,
        duracao_minutos: payload.duracao_minutos
      });
      
      if (conflito.success && !conflito.data.disponivel) {
        return { 
          success: false, 
          error: 'Horário não disponível. Conflito com outro agendamento.' 
        };
      }
    }
    
    const result = await apiRequest('/agendamentos', 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.agendamentos.deletePattern(/agendamento/);
    
    return {
      success: true,
      agendamento: result.data,
      message: 'Agendamento criado com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao criar agendamento:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function atualizarStatusAgendamento({ agendamento_id, status }) {
  log('TOOL', `atualizar_status_agendamento: ${agendamento_id} -> ${status}`);
  try {
    const statusValidado = Validators.statusAgendamento(status);

    const result = await apiRequest(`/agendamentos/${agendamento_id}/status`, 'PUT', {
      status: statusValidado
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    cacheInstances.agendamentos.deletePattern(/agendamento/);

    return {
      success: true,
      message: `Status atualizado para: ${statusValidado}`
    };

  } catch (error) {
    log('TOOL', 'Erro ao atualizar status:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function validarHorarioDisponivel({ data_hora, veterinario_id, duracao_minutos, agendamento_id }) {
  log('TOOL', 'validar_horario_disponivel', { data_hora, veterinario_id });
  try {
    if (!data_hora) throw new Error('data_hora é obrigatória');
    if (!veterinario_id) throw new Error('veterinario_id é obrigatório');

    const payload = {
      data_hora: Validators.dataHora(data_hora),
      veterinario_id: parseInt(veterinario_id),
      duracao_minutos: parseInt(duracao_minutos) || 30
    };

    // Se estiver remarcando, incluir ID do agendamento
    if (agendamento_id) {
      payload.agendamento_id = parseInt(agendamento_id);
    }

    const result = await apiRequest('/agendamentos/validar-conflito', 'POST', payload);

    if (!result.success) {
      return { success: false, disponivel: false, error: result.error };
    }

    return {
      success: true,
      disponivel: result.data.disponivel === true,
      message: result.data.message || '',
      conflito: result.data.conflito || null
    };

  } catch (error) {
    log('TOOL', 'Erro ao validar horário:', error.message, LogLevel.ERROR);
    return { success: false, disponivel: false, error: error.message };
  }
}

async function listarProximosAgendamentos({ cliente_id, limite }) {
  log('TOOL', 'listar_proximos_agendamentos', { cliente_id });
  try {
    if (!cliente_id) throw new Error('cliente_id é obrigatório');

    const hoje = new Date().toISOString().split('T')[0];
    const endpoint = `/agendamentos?cliente_id=${cliente_id}&data_inicio=${hoje}`;

    // Cache curto (1 min) pois agendamentos mudam frequentemente
    const cacheKey = `agendamentos_proximos_${cliente_id}`;
    const cached = cacheInstances.agendamentos.get(cacheKey);
    if (cached) {
      log('TOOL', '✓ Próximos agendamentos encontrados no cache');
      return cached;
    }

    const result = await apiRequest(endpoint);

    if (!result.success) {
      return { success: false, agendamentos: [], error: result.error };
    }

    const agendamentos = Array.isArray(result.data) ? result.data : [];

    // Ordenar por data
    agendamentos.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

    // Limitar resultados se solicitado
    const agendamentosLimitados = limite ? agendamentos.slice(0, limite) : agendamentos;

    const response = {
      success: true,
      agendamentos: agendamentosLimitados,
      total: agendamentosLimitados.length
    };

    cacheInstances.agendamentos.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao listar próximos agendamentos:', error.message, LogLevel.ERROR);
    return { success: false, agendamentos: [], error: error.message };
  }
}

// ==================== FERRAMENTAS - SERVIÇOS ====================

async function listarServicosAtivos() {
  log('TOOL', 'listar_servicos_ativos');
  try {
    const cacheKey = 'servicos_ativos';
    const cached = cacheInstances.servicos.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, servicos: [], error: cached.error };
      }
      log('TOOL', '✓ Serviços encontrados no cache');
      return cached;
    }
    
    const result = await apiRequest('/servicos-ativos');
    
    if (!result.success) {
      cacheInstances.servicos.setNegative(cacheKey, result.error);
      return { success: false, servicos: [], error: result.error };
    }
    
    const response = {
      success: true,
      servicos: result.data,
      total: result.data.length
    };
    
    cacheInstances.servicos.set(cacheKey, response, CONFIG.CACHE_TTL.LONG);
    return response;
    
  } catch (error) {
    log('TOOL', 'Erro ao listar serviços:', error.message, LogLevel.ERROR);
    return { success: false, servicos: [], error: error.message };
  }
}

async function listarVeterinarios() {
  log('TOOL', 'listar_veterinarios');
  try {
    const cacheKey = 'veterinarios_ativos';
    const cached = cacheInstances.veterinarios.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, veterinarios: [], error: cached.error };
      }
      log('TOOL', '✓ Veterinários encontrados no cache');
      return cached;
    }
    
    const result = await apiRequest('/veterinarios');
    
    if (!result.success) {
      cacheInstances.veterinarios.setNegative(cacheKey, result.error);
      return { success: false, veterinarios: [], error: result.error };
    }
    
    const response = {
      success: true,
      veterinarios: result.data,
      total: result.data.length
    };
    
    cacheInstances.veterinarios.set(cacheKey, response, CONFIG.CACHE_TTL.LONG);
    return response;
    
  } catch (error) {
    log('TOOL', 'Erro ao listar veterinários:', error.message, LogLevel.ERROR);
    return { success: false, veterinarios: [], error: error.message };
  }
}

// ==================== FERRAMENTAS - VACINAS ====================

async function listarVacinasAtivas() {
  log('TOOL', 'listar_vacinas_ativas');
  try {
    const cacheKey = 'vacinas_ativas';
    const cached = cacheInstances.vacinas.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, vacinas: [], error: cached.error };
      }
      log('TOOL', '✓ Vacinas encontradas no cache');
      return cached;
    }
    
    const result = await apiRequest('/vacinas-ativas');
    
    if (!result.success) {
      cacheInstances.vacinas.setNegative(cacheKey, result.error);
      return { success: false, vacinas: [], error: result.error };
    }
    
    const response = {
      success: true,
      vacinas: result.data,
      total: result.data.length
    };
    
    cacheInstances.vacinas.set(cacheKey, response, CONFIG.CACHE_TTL.LONG);
    return response;
    
  } catch (error) {
    log('TOOL', 'Erro ao listar vacinas:', error.message, LogLevel.ERROR);
    return { success: false, vacinas: [], error: error.message };
  }
}

async function registrarVacinacao({ dados }) {
  log('TOOL', 'registrar_vacinacao', dados);
  try {
    if (!dados.pet_id) throw new Error('pet_id é obrigatório');
    if (!dados.vacina_id) throw new Error('vacina_id é obrigatório');
    if (!dados.data_aplicacao) throw new Error('data_aplicacao é obrigatória');

    const payload = {
      pet_id: parseInt(dados.pet_id),
      vacina_id: parseInt(dados.vacina_id),
      veterinario_id: dados.veterinario_id ? parseInt(dados.veterinario_id) : null,
      data_aplicacao: Validators.data(dados.data_aplicacao),
      proxima_dose: dados.proxima_dose ? Validators.data(dados.proxima_dose) : null,
      lote: dados.lote || '',
      dose: dados.dose || '',
      observacoes: dados.observacoes || ''
    };

    const result = await apiRequest(`/pets/${dados.pet_id}/vacinacao`, 'POST', payload);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Invalidar cache de vacinações do pet
    cacheInstances.pets.delete(`vacinacoes_pet_${dados.pet_id}`);

    return {
      success: true,
      vacinacao: result.data,
      message: 'Vacinação registrada com sucesso'
    };

  } catch (error) {
    log('TOOL', 'Erro ao registrar vacinação:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function obterHistoricoVacinacao({ pet_id }) {
  log('TOOL', 'obter_historico_vacinacao', { pet_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');

    const cacheKey = `vacinacoes_pet_${pet_id}`;
    const cached = cacheInstances.pets.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, vacinacoes: [], error: cached.error };
      }
      log('TOOL', '✓ Histórico de vacinação encontrado no cache');
      return cached;
    }

    const result = await apiRequest(`/pets/${pet_id}/vacinacoes`);

    if (!result.success) {
      cacheInstances.pets.setNegative(cacheKey, result.error);
      return { success: false, vacinacoes: [], error: result.error };
    }

    const vacinacoes = Array.isArray(result.data) ? result.data : [];

    const response = {
      success: true,
      vacinacoes,
      total: vacinacoes.length
    };

    cacheInstances.pets.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao obter histórico de vacinação:', error.message, LogLevel.ERROR);
    return { success: false, vacinacoes: [], error: error.message };
  }
}

async function obterHistoricoClinico({ pet_id }) {
  log('TOOL', 'obter_historico_clinico', { pet_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');

    const cacheKey = `historico_clinico_${pet_id}`;
    const cached = cacheInstances.pets.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, historico: [], error: cached.error };
      }
      log('TOOL', '✓ Histórico clínico encontrado no cache');
      return cached;
    }

    const result = await apiRequest(`/pets/${pet_id}/historico-medico`);

    if (!result.success) {
      cacheInstances.pets.setNegative(cacheKey, result.error);
      return { success: false, historico: [], error: result.error };
    }

    const historico = Array.isArray(result.data) ? result.data : [];

    const response = {
      success: true,
      historico,
      total: historico.length
    };

    cacheInstances.pets.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao obter histórico clínico:', error.message, LogLevel.ERROR);
    return { success: false, historico: [], error: error.message };
  }
}

async function obterHistoricoPeso({ pet_id }) {
  log('TOOL', 'obter_historico_peso', { pet_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');

    const cacheKey = `historico_peso_${pet_id}`;
    const cached = cacheInstances.pets.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, historico: [], error: cached.error };
      }
      log('TOOL', '✓ Histórico de peso encontrado no cache');
      return cached;
    }

    const result = await apiRequest(`/pets/${pet_id}/historico-peso`);

    if (!result.success) {
      cacheInstances.pets.setNegative(cacheKey, result.error);
      return { success: false, historico: [], error: result.error };
    }

    const historico = Array.isArray(result.data) ? result.data : [];

    const response = {
      success: true,
      historico,
      total: historico.length,
      peso_atual: historico.length > 0 ? historico[0].peso : null
    };

    cacheInstances.pets.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao obter histórico de peso:', error.message, LogLevel.ERROR);
    return { success: false, historico: [], error: error.message };
  }
}

async function obterExamesPet({ pet_id }) {
  log('TOOL', 'obter_exames_pet', { pet_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');

    const cacheKey = `exames_pet_${pet_id}`;
    const cached = cacheInstances.pets.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, exames: [], error: cached.error };
      }
      log('TOOL', '✓ Exames encontrados no cache');
      return cached;
    }

    const result = await apiRequest(`/pets/${pet_id}/exames`);

    if (!result.success) {
      cacheInstances.pets.setNegative(cacheKey, result.error);
      return { success: false, exames: [], error: result.error };
    }

    const exames = Array.isArray(result.data) ? result.data : [];

    const response = {
      success: true,
      exames,
      total: exames.length
    };

    cacheInstances.pets.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao obter exames do pet:', error.message, LogLevel.ERROR);
    return { success: false, exames: [], error: error.message };
  }
}

async function solicitarExame({ pet_id, tipo_exame_id, veterinario_id, observacoes }) {
  log('TOOL', 'solicitar_exame', { pet_id, tipo_exame_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');
    if (!tipo_exame_id) throw new Error('tipo_exame_id é obrigatório');
    if (!veterinario_id) throw new Error('veterinario_id é obrigatório');

    const payload = {
      tipo_exame_id: parseInt(tipo_exame_id),
      veterinario_id: parseInt(veterinario_id),
      observacoes: observacoes || ''
    };

    const result = await apiRequest(`/pets/${pet_id}/solicitar-exame`, 'POST', payload);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Invalidar cache de exames
    cacheInstances.pets.delete(`exames_pet_${pet_id}`);

    return {
      success: true,
      exame: result.data,
      message: 'Exame solicitado com sucesso'
    };

  } catch (error) {
    log('TOOL', 'Erro ao solicitar exame:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function listarTiposExame() {
  log('TOOL', 'listar_tipos_exame');
  try {
    const cacheKey = 'tipos_exame_ativos';
    const cached = cacheInstances.servicos.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, tipos: [], error: cached.error };
      }
      log('TOOL', '✓ Tipos de exame encontrados no cache');
      return cached;
    }

    const result = await apiRequest('/tipos-exame?ativo=1');

    if (!result.success) {
      cacheInstances.servicos.setNegative(cacheKey, result.error);
      return { success: false, tipos: [], error: result.error };
    }

    const tipos = Array.isArray(result.data) ? result.data : [];

    const response = {
      success: true,
      tipos,
      total: tipos.length
    };

    cacheInstances.servicos.set(cacheKey, response, CONFIG.CACHE_TTL.LONG);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao listar tipos de exame:', error.message, LogLevel.ERROR);
    return { success: false, tipos: [], error: error.message };
  }
}

async function registrarAnamnese({ pet_id, veterinario_id, data_consulta, anamnese, diagnostico, peso_atual }) {
  log('TOOL', 'registrar_anamnese', { pet_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');
    if (!veterinario_id) throw new Error('veterinario_id é obrigatório');
    if (!data_consulta) throw new Error('data_consulta é obrigatória');
    if (!anamnese) throw new Error('anamnese é obrigatória');

    const payload = {
      veterinario_id: parseInt(veterinario_id),
      data_consulta: Validators.data(data_consulta),
      anamnese: anamnese.trim(),
      diagnostico: diagnostico?.trim() || '',
      peso_atual: peso_atual ? parseFloat(peso_atual) : null
    };

    const result = await apiRequest(`/pets/${pet_id}/anamnese`, 'POST', payload);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Invalidar caches relacionados
    cacheInstances.pets.delete(`historico_clinico_${pet_id}`);
    if (peso_atual) {
      cacheInstances.pets.delete(`historico_peso_${pet_id}`);
    }

    return {
      success: true,
      anamnese: result.data,
      message: 'Anamnese registrada com sucesso'
    };

  } catch (error) {
    log('TOOL', 'Erro ao registrar anamnese:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function verificarVacinasAtrasadas({ pet_id }) {
  log('TOOL', 'verificar_vacinas_atrasadas', { pet_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');

    // Buscar histórico de vacinação
    const resultVacinas = await obterHistoricoVacinacao({ pet_id });

    if (!resultVacinas.success) {
      return { success: false, error: resultVacinas.error };
    }

    const hoje = new Date();
    const vacinasAtrasadas = [];
    const proximasVacinas = [];

    resultVacinas.vacinacoes.forEach(vacina => {
      if (vacina.proxima_dose || vacina.data_proxima_dose) {
        const proximaDose = new Date(vacina.proxima_dose || vacina.data_proxima_dose);
        const diasDiferenca = Math.ceil((proximaDose - hoje) / (1000 * 60 * 60 * 24));

        if (diasDiferenca < 0) {
          // Vacina atrasada
          vacinasAtrasadas.push({
            ...vacina,
            dias_atraso: Math.abs(diasDiferenca)
          });
        } else if (diasDiferenca <= 30) {
          // Vacina próxima do vencimento (próximos 30 dias)
          proximasVacinas.push({
            ...vacina,
            dias_restantes: diasDiferenca
          });
        }
      }
    });

    return {
      success: true,
      tem_vacinas_atrasadas: vacinasAtrasadas.length > 0,
      vacinas_atrasadas: vacinasAtrasadas,
      proximas_vacinas: proximasVacinas,
      total_atrasadas: vacinasAtrasadas.length,
      total_proximas: proximasVacinas.length,
      mensagem: vacinasAtrasadas.length > 0
        ? `⚠️ Atenção! ${vacinasAtrasadas.length} vacina(s) atrasada(s)`
        : proximasVacinas.length > 0
        ? `📅 ${proximasVacinas.length} vacina(s) próximas do vencimento`
        : '✅ Todas as vacinas em dia!'
    };

  } catch (error) {
    log('TOOL', 'Erro ao verificar vacinas atrasadas:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function buscarServicos({ termo_busca }) {
  log('TOOL', 'buscar_servicos', { termo_busca });
  try {
    // Validação: termo de busca obrigatório
    if (!termo_busca || termo_busca.trim().length < 2) {
      return {
        success: false,
        servicos: [],
        error: 'Termo de busca obrigatório (mínimo 2 caracteres). Ex: consulta, banho, vacina, etc.'
      };
    }

    const endpoint = `/servicos?busca=${encodeURIComponent(termo_busca.trim())}`;

    const cacheKey = `servicos_busca_${termo_busca.trim().toLowerCase()}`;
    const cached = cacheInstances.servicos.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, servicos: [], error: cached.error };
      }
      log('TOOL', '✓ Serviços encontrados no cache');
      return cached;
    }

    const result = await apiRequest(endpoint);

    if (!result.success) {
      cacheInstances.servicos.setNegative(cacheKey, result.error);
      return { success: false, servicos: [], error: result.error };
    }

    const servicos = Array.isArray(result.data) ? result.data : [];

    const response = {
      success: true,
      servicos,
      total: servicos.length
    };

    cacheInstances.servicos.set(cacheKey, response, CONFIG.CACHE_TTL.LONG);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao buscar serviços:', error.message, LogLevel.ERROR);
    return { success: false, servicos: [], error: error.message };
  }
}

async function listarPlanos() {
  log('TOOL', 'listar_planos');
  try {
    const cacheKey = 'planos_disponiveis';
    const cached = cacheInstances.servicos.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, planos: [], error: cached.error };
      }
      log('TOOL', '✓ Planos encontrados no cache');
      return cached;
    }

    const result = await apiRequest('/planos');

    if (!result.success) {
      cacheInstances.servicos.setNegative(cacheKey, result.error);
      return { success: false, planos: [], error: result.error };
    }

    const planos = Array.isArray(result.data) ? result.data : [];

    const response = {
      success: true,
      planos,
      total: planos.length
    };

    cacheInstances.servicos.set(cacheKey, response, CONFIG.CACHE_TTL.LONG);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao listar planos:', error.message, LogLevel.ERROR);
    return { success: false, planos: [], error: error.message };
  }
}

async function obterEstatisticasPet({ pet_id }) {
  log('TOOL', 'obter_estatisticas_pet', { pet_id });
  try {
    if (!pet_id) throw new Error('pet_id é obrigatório');

    const cacheKey = `estatisticas_pet_${pet_id}`;
    const cached = cacheInstances.pets.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, estatisticas: {}, error: cached.error };
      }
      log('TOOL', '✓ Estatísticas encontradas no cache');
      return cached;
    }

    const result = await apiRequest(`/pets/${pet_id}/estatisticas`);

    if (!result.success) {
      cacheInstances.pets.setNegative(cacheKey, result.error);
      return { success: false, estatisticas: {}, error: result.error };
    }

    const response = {
      success: true,
      estatisticas: result.data || {}
    };

    cacheInstances.pets.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao obter estatísticas do pet:', error.message, LogLevel.ERROR);
    return { success: false, estatisticas: {}, error: error.message };
  }
}

async function workflowAgendamentoCompleto({
  cliente_id,
  pet_id,
  servico_descricao,
  veterinario_id,
  data_hora,
  observacoes,
  validar_antes
}) {
  log('TOOL', 'workflow_agendamento_completo', { cliente_id, pet_id });
  try {
    if (!cliente_id) throw new Error('cliente_id é obrigatório');
    if (!pet_id) throw new Error('pet_id é obrigatório');
    if (!data_hora) throw new Error('data_hora é obrigatória');

    const resultado = {
      success: true,
      etapas: {}
    };

    // Etapa 1: Buscar serviço se descrição fornecida
    if (servico_descricao) {
      const servicoResult = await buscarServicos({ termo_busca: servico_descricao });
      if (!servicoResult.success || servicoResult.servicos.length === 0) {
        return {
          success: false,
          etapa_falha: 'buscar_servico',
          error: 'Serviço não encontrado. Tente outro termo de busca.'
        };
      }
      resultado.etapas.servico = servicoResult.servicos[0];
    }

    // Etapa 2: Validar horário (se solicitado ou se veterinário especificado)
    if ((validar_antes === true || veterinario_id) && veterinario_id) {
      const validacaoResult = await validarHorarioDisponivel({
        data_hora,
        veterinario_id,
        duracao_minutos: resultado.etapas.servico?.duracao_minutos || 30
      });

      resultado.etapas.validacao = validacaoResult;

      if (!validacaoResult.disponivel) {
        return {
          success: false,
          etapa_falha: 'validar_horario',
          error: 'Horário não disponível',
          validacao: validacaoResult
        };
      }
    }

    // Etapa 3: Criar agendamento
    const agendamentoResult = await criarAgendamento({
      dados: {
        cliente_id: parseInt(cliente_id),
        pet_id: parseInt(pet_id),
        servico_id: resultado.etapas.servico?.id || null,
        veterinario_id: veterinario_id ? parseInt(veterinario_id) : null,
        data_hora,
        tipo: resultado.etapas.servico?.tipo || 'Consulta',
        duracao_minutos: resultado.etapas.servico?.duracao_minutos || 30,
        valor: resultado.etapas.servico?.preco || null,
        observacoes: observacoes || '',
        status: 'Agendado'
      }
    });

    if (!agendamentoResult.success) {
      return {
        success: false,
        etapa_falha: 'criar_agendamento',
        error: agendamentoResult.error
      };
    }

    resultado.etapas.agendamento = agendamentoResult.agendamento;
    resultado.message = '✅ Agendamento criado com sucesso!';

    return resultado;

  } catch (error) {
    log('TOOL', 'Erro no workflow de agendamento:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== FERRAMENTAS - PRODUTOS ====================

async function buscarProdutos({ termo_busca, categoria, estoque_baixo }) {
  log('TOOL', 'buscar_produtos', { termo_busca, categoria, estoque_baixo });
  try {
    // VALIDAÇÃO OBRIGATÓRIA: Ao menos um filtro deve ser fornecido
    if (!termo_busca && !categoria && !estoque_baixo) {
      return {
        success: false,
        produtos: [],
        error: 'Informe ao menos um filtro: termo_busca (mínimo 3 caracteres), categoria ou estoque_baixo=true'
      };
    }

    // Se termo_busca fornecido, validar mínimo de caracteres
    if (termo_busca && termo_busca.trim().length < 3) {
      return {
        success: false,
        produtos: [],
        error: 'Termo de busca deve ter no mínimo 3 caracteres'
      };
    }

    const params = [];
    if (termo_busca) params.push(`busca=${encodeURIComponent(termo_busca.trim())}`);
    if (categoria) params.push(`categoria=${encodeURIComponent(categoria)}`);
    if (estoque_baixo) params.push(`estoque_baixo=1`);
    params.push('ativo=1'); // Sempre buscar apenas produtos ativos

    const endpoint = `/produtos?${params.join('&')}`;

    // Cache por combinação de filtros
    const cacheKey = `produtos_${params.join('_')}`;
    const cached = cacheInstances.produtos.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, produtos: [], error: cached.error };
      }
      log('TOOL', '✓ Produtos encontrados no cache');
      return cached;
    }

    const result = await apiRequest(endpoint);

    if (!result.success) {
      cacheInstances.produtos.setNegative(cacheKey, result.error);
      return { success: false, produtos: [], error: result.error };
    }

    const produtos = Array.isArray(result.data) ? result.data : [];

    // Limitar a 100 resultados
    const produtosLimitados = produtos.slice(0, 100);

    const response = {
      success: true,
      produtos: produtosLimitados,
      total: produtosLimitados.length,
      limitado: produtos.length > 100
    };

    cacheInstances.produtos.set(cacheKey, response, CONFIG.CACHE_TTL.MEDIUM);
    return response;

  } catch (error) {
    log('TOOL', 'Erro ao buscar produtos:', error.message, LogLevel.ERROR);
    return { success: false, produtos: [], error: error.message };
  }
}

async function criarProduto({ dados }) {
  log('TOOL', 'criar_produto:', dados.nome);
  try {
    if (!dados.nome) throw new Error('nome é obrigatório');
    if (!dados.categoria) throw new Error('categoria é obrigatória');
    if (!dados.preco_venda) throw new Error('preco_venda é obrigatório');
    
    const payload = {
      nome: dados.nome.trim(),
      categoria: dados.categoria.trim(),
      codigo_barras: dados.codigo_barras || '',
      preco_custo: dados.preco_custo ? parseFloat(dados.preco_custo) : null,
      preco_venda: parseFloat(dados.preco_venda),
      estoque_atual: parseInt(dados.estoque_atual) || 0,
      estoque_minimo: parseInt(dados.estoque_minimo) || 0,
      unidade: dados.unidade || 'un',
      ativo: dados.ativo !== false ? 1 : 0
    };
    
    const result = await apiRequest('/produtos', 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.produtos.deletePattern(/produto/);
    
    return {
      success: true,
      produto: result.data.produto || result.data,
      message: 'Produto criado com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao criar produto:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== FERRAMENTAS - FINANCEIRO ====================

async function listarContasReceber({ filtros = {} }) {
  log('TOOL', 'listar_contas_receber', filtros);
  try {
    let endpoint = '/contas-receber';
    const params = [];
    
    if (filtros.status) params.push(`status=${encodeURIComponent(filtros.status)}`);
    if (filtros.vencimento_inicio) params.push(`vencimento_inicio=${filtros.vencimento_inicio}`);
    if (filtros.vencimento_fim) params.push(`vencimento_fim=${filtros.vencimento_fim}`);
    if (filtros.cliente_id) params.push(`cliente_id=${filtros.cliente_id}`);
    
    if (params.length > 0) {
      endpoint += '?' + params.join('&');
    }
    
    const result = await apiRequest(endpoint);
    
    if (!result.success) {
      return { success: false, contas: [], error: result.error };
    }
    
    return {
      success: true,
      contas: result.data,
      total: result.data.length
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao listar contas a receber:', error.message, LogLevel.ERROR);
    return { success: false, contas: [], error: error.message };
  }
}

async function criarContaReceber({ dados }) {
  log('TOOL', 'criar_conta_receber:', dados);
  try {
    if (!dados.descricao) throw new Error('descricao é obrigatória');
    if (!dados.valor) throw new Error('valor é obrigatório');
    if (!dados.vencimento) throw new Error('vencimento é obrigatório');
    
    const payload = {
      descricao: dados.descricao.trim(),
      valor: Validators.valor(dados.valor),
      vencimento: Validators.data(dados.vencimento),
      cliente_id: dados.cliente_id ? parseInt(dados.cliente_id) : null,
      categoria_id: dados.categoria_id ? parseInt(dados.categoria_id) : null,
      forma_pagamento: dados.forma_pagamento || 'Dinheiro',
      status: dados.status || 'Pendente',
      observacoes: dados.observacoes || ''
    };
    
    const result = await apiRequest('/contas-receber', 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.financeiro.deletePattern(/conta/);
    
    return {
      success: true,
      conta: result.data,
      message: 'Conta a receber criada com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao criar conta a receber:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function registrarPagamento({ conta_id, dados }) {
  log('TOOL', `registrar_pagamento: ${conta_id}`);
  try {
    if (!dados.valor_pago) throw new Error('valor_pago é obrigatório');
    if (!dados.data_pagamento) throw new Error('data_pagamento é obrigatória');
    
    const payload = {
      valor_pago: Validators.valor(dados.valor_pago),
      data_pagamento: Validators.data(dados.data_pagamento),
      forma_pagamento: Validators.formaPagamento(dados.forma_pagamento || 'Dinheiro'),
      observacoes: dados.observacoes || ''
    };
    
    const result = await apiRequest(`/contas-receber/${conta_id}/pagar`, 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.financeiro.deletePattern(/conta/);
    
    return {
      success: true,
      message: 'Pagamento registrado com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao registrar pagamento:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== FERRAMENTAS - CAIXA ====================

async function obterCaixaAberto() {
  log('TOOL', 'obter_caixa_aberto');
  try {
    const result = await apiRequest('/caixa/aberto');
    
    if (!result.success) {
      return { success: false, caixa: null, error: result.error };
    }
    
    return {
      success: true,
      caixa: result.data,
      aberto: result.data !== null
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao obter caixa aberto:', error.message, LogLevel.ERROR);
    return { success: false, caixa: null, error: error.message };
  }
}

async function abrirCaixa({ valor_inicial, observacoes }) {
  log('TOOL', 'abrir_caixa');
  try {
    const payload = {
      valor_inicial: Validators.valor(valor_inicial || 0),
      observacoes: observacoes || ''
    };
    
    const result = await apiRequest('/caixa/abrir', 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.financeiro.deletePattern(/caixa/);
    
    return {
      success: true,
      caixa: result.data,
      message: 'Caixa aberto com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao abrir caixa:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

async function fecharCaixa({ caixa_id }) {
  log('TOOL', `fechar_caixa: ${caixa_id}`);
  try {
    const result = await apiRequest(`/caixa/${caixa_id}/fechar`, 'POST');
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.financeiro.deletePattern(/caixa/);
    
    return {
      success: true,
      resumo: result.data,
      message: 'Caixa fechado com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao fechar caixa:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== FERRAMENTAS - VENDAS ====================

async function criarVenda({ dados }) {
  log('TOOL', 'criar_venda:', dados);
  try {
    if (!dados.itens || dados.itens.length === 0) {
      throw new Error('A venda deve ter pelo menos um item');
    }
    
    const payload = {
      cliente_id: dados.cliente_id ? parseInt(dados.cliente_id) : null,
      itens: dados.itens.map(item => ({
        produto_id: parseInt(item.produto_id),
        quantidade: parseInt(item.quantidade),
        valor_unitario: parseFloat(item.valor_unitario),
        desconto: parseFloat(item.desconto || 0)
      })),
      forma_pagamento: Validators.formaPagamento(dados.forma_pagamento || 'Dinheiro'),
      desconto_total: parseFloat(dados.desconto_total || 0),
      observacoes: dados.observacoes || ''
    };
    
    const result = await apiRequest('/vendas', 'POST', payload);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    cacheInstances.financeiro.deletePattern(/venda/);
    cacheInstances.produtos.deletePattern(/produto/);
    
    return {
      success: true,
      venda: result.data,
      message: 'Venda realizada com sucesso'
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao criar venda:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== FERRAMENTAS - DASHBOARD ====================

async function obterIndicadoresDashboard() {
  log('TOOL', 'obter_indicadores_dashboard');
  try {
    const cacheKey = 'dashboard_indicadores';
    const cached = cacheInstances.dashboard.get(cacheKey);
    if (cached) {
      if (cached.cached && cached.error) {
        return { success: false, indicadores: {}, error: cached.error };
      }
      log('TOOL', '✓ Indicadores encontrados no cache');
      return cached;
    }
    
    const result = await apiRequest('/dashboard/indicadores');
    
    if (!result.success) {
      cacheInstances.dashboard.setNegative(cacheKey, result.error);
      return { success: false, indicadores: {}, error: result.error };
    }
    
    const response = {
      success: true,
      indicadores: result.data
    };
    
    cacheInstances.dashboard.set(cacheKey, response, CONFIG.CACHE_TTL.SHORT);
    return response;
    
  } catch (error) {
    log('TOOL', 'Erro ao obter indicadores:', error.message, LogLevel.ERROR);
    return { success: false, indicadores: {}, error: error.message };
  }
}

async function obterInsightsDashboard() {
  log('TOOL', 'obter_insights_dashboard');
  try {
    const result = await apiRequest('/dashboard/insights');
    
    if (!result.success) {
      return { success: false, insights: {}, error: result.error };
    }
    
    return {
      success: true,
      insights: result.data
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao obter insights:', error.message, LogLevel.ERROR);
    return { success: false, insights: {}, error: error.message };
  }
}

async function obterEstatisticasFinanceiras() {
  log('TOOL', 'obter_estatisticas_financeiras');
  try {
    const result = await apiRequest('/dashboard/estatisticas-financeiras');
    
    if (!result.success) {
      return { success: false, estatisticas: {}, error: result.error };
    }
    
    return {
      success: true,
      estatisticas: result.data
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao obter estatísticas financeiras:', error.message, LogLevel.ERROR);
    return { success: false, estatisticas: {}, error: error.message };
  }
}

// ==================== FERRAMENTAS - COMISSÕES ====================

async function listarComissoes({ filtros = {} }) {
  log('TOOL', 'listar_comissoes', filtros);
  try {
    let endpoint = '/comissoes';
    const params = [];
    
    if (filtros.funcionario_id) params.push(`funcionario_id=${filtros.funcionario_id}`);
    if (filtros.mes) params.push(`mes=${filtros.mes}`);
    if (filtros.ano) params.push(`ano=${filtros.ano}`);
    if (filtros.status) params.push(`status=${encodeURIComponent(filtros.status)}`);
    
    if (params.length > 0) {
      endpoint += '?' + params.join('&');
    }
    
    const result = await apiRequest(endpoint);
    
    if (!result.success) {
      return { success: false, comissoes: [], error: result.error };
    }
    
    return {
      success: true,
      comissoes: result.data,
      total: result.data.length
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao listar comissões:', error.message, LogLevel.ERROR);
    return { success: false, comissoes: [], error: error.message };
  }
}

// ==================== FERRAMENTAS - ALERTAS ====================

async function obterAlertas() {
  log('TOOL', 'obter_alertas');
  try {
    const result = await apiRequest('/alertas');
    
    if (!result.success) {
      return { success: false, alertas: [], error: result.error };
    }
    
    return {
      success: true,
      alertas: result.data.alertas || result.data,
      total: result.data.total || 0
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao obter alertas:', error.message, LogLevel.ERROR);
    return { success: false, alertas: [], error: error.message };
  }
}

async function obterBadgeAlertas() {
  log('TOOL', 'obter_badge_alertas');
  try {
    const result = await apiRequest('/alertas/badge');
    
    if (!result.success) {
      return { success: false, badge: { criticos: 0, avisos: 0, total: 0 }, error: result.error };
    }
    
    return {
      success: true,
      badge: result.data
    };
    
  } catch (error) {
    log('TOOL', 'Erro ao obter badge de alertas:', error.message, LogLevel.ERROR);
    return { success: false, badge: { criticos: 0, avisos: 0, total: 0 }, error: error.message };
  }
}

// ==================== FERRAMENTAS - BUSCA GLOBAL ====================

async function buscaGlobal({ termo }) {
  log('TOOL', `busca_global: ${termo}`);
  try {
    const termoLimpo = termo.toLowerCase().trim();
    const resultados = {
      clientes: [],
      pets: [],
      produtos: [],
      servicos: []
    };
    
    // Buscar em paralelo para otimizar
    const [clientesRes, petsRes, produtosRes, servicosRes] = await Promise.allSettled([
      apiRequest(`/clientes?busca=${encodeURIComponent(termo)}`),
      apiRequest('/pets?page=1'),
      apiRequest(`/produtos?busca=${encodeURIComponent(termo)}`),
      apiRequest('/servicos')
    ]);
    
    // Processar clientes
    if (clientesRes.status === 'fulfilled' && clientesRes.value.success) {
      const clientes = Array.isArray(clientesRes.value.data) ? clientesRes.value.data : [];
      resultados.clientes = clientes.slice(0, 10);
    }
    
    // Processar pets
    if (petsRes.status === 'fulfilled' && petsRes.value.success) {
      const petsData = petsRes.value.data?.data || petsRes.value.data || [];
      const pets = Array.isArray(petsData) ? petsData : [];
      resultados.pets = pets.filter(p => 
        (p.nome && p.nome.toLowerCase().includes(termoLimpo)) ||
        (p.especie && p.especie.toLowerCase().includes(termoLimpo))
      ).slice(0, 10);
    }
    
    // Processar produtos
    if (produtosRes.status === 'fulfilled' && produtosRes.value.success) {
      const produtos = Array.isArray(produtosRes.value.data) ? produtosRes.value.data : [];
      resultados.produtos = produtos.slice(0, 10);
    }
    
    // Processar serviços
    if (servicosRes.status === 'fulfilled' && servicosRes.value.success) {
      const servicos = Array.isArray(servicosRes.value.data) ? servicosRes.value.data : [];
      resultados.servicos = servicos.filter(s =>
        (s.nome && s.nome.toLowerCase().includes(termoLimpo)) ||
        (s.tipo && s.tipo.toLowerCase().includes(termoLimpo))
      ).slice(0, 10);
    }
    
    return {
      success: true,
      resultados,
      total: {
        clientes: resultados.clientes.length,
        pets: resultados.pets.length,
        produtos: resultados.produtos.length,
        servicos: resultados.servicos.length
      },
      termo_busca: termo
    };
    
  } catch (error) {
    log('TOOL', 'Erro na busca global:', error.message, LogLevel.ERROR);
    return { success: false, resultados: {}, error: error.message };
  }
}

// ==================== WORKFLOW COMPLETO ====================

async function workflowNovoCliente({ dados }) {
  log('TOOL', 'workflow_novo_cliente');
  try {
    const resultado = { success: true, etapas: {} };
    let clienteId;
    
    // Verificar se cliente já existe
    if (dados.cliente_telefone) {
      const clienteExistente = await buscarClientePorTelefone({ 
        telefone: dados.cliente_telefone 
      });
      
      if (clienteExistente.success && clienteExistente.found) {
        resultado.etapas.cliente = clienteExistente.cliente;
        resultado.etapas.cliente_existente = true;
        clienteId = clienteExistente.cliente.id;
        
        if (dados.usar_cliente_existente === false) {
          return {
            success: false,
            etapa_falha: 'cliente_duplicado',
            cliente_existente: clienteExistente.cliente,
            error: 'Cliente já existe. Configure usar_cliente_existente: true para continuar.'
          };
        }
      }
    }
    
    // Criar cliente se não existe
    if (!clienteId) {
      const novoClienteResult = await criarCliente({ 
        dados: {
          nome: dados.cliente_nome,
          cpf: dados.cliente_cpf,
          telefone: dados.cliente_telefone,
          email: dados.cliente_email,
          whatsapp: dados.cliente_whatsapp || dados.cliente_telefone,
          endereco: dados.cliente_endereco,
          numero: dados.cliente_numero,
          bairro: dados.cliente_bairro,
          cidade: dados.cliente_cidade,
          estado: dados.cliente_estado,
          cep: dados.cliente_cep,
          observacoes: dados.cliente_observacoes
        }
      });
      
      if (!novoClienteResult.success) {
        return { 
          success: false, 
          etapa_falha: 'criar_cliente', 
          error: novoClienteResult.error 
        };
      }
      
      resultado.etapas.cliente = novoClienteResult.cliente;
      resultado.etapas.cliente_existente = false;
      clienteId = novoClienteResult.cliente.id;
    }
    
    // Criar pet se dados fornecidos
    if (dados.pet_nome) {
      const novoPetResult = await criarPet({ 
        dados: {
          cliente_id: clienteId,
          nome: dados.pet_nome,
          especie: dados.pet_especie,
          raca: dados.pet_raca,
          sexo: dados.pet_sexo,
          castrado: dados.pet_castrado,
          data_nascimento: dados.pet_data_nascimento,
          peso: dados.pet_peso,
          pelagem: dados.pet_pelagem,
          microchip: dados.pet_microchip,
          alergias: dados.pet_alergias,
          observacoes: dados.pet_observacoes
        }
      });
      
      if (!novoPetResult.success) {
        return { 
          success: false, 
          etapa_falha: 'criar_pet', 
          cliente: resultado.etapas.cliente, 
          error: novoPetResult.error 
        };
      }
      
      resultado.etapas.pet = novoPetResult.pet;
    }
    
    // Criar agendamento se dados fornecidos
    if (dados.agendamento_data_hora && resultado.etapas.pet) {
      const novoAgendamentoResult = await criarAgendamento({ 
        dados: {
          cliente_id: clienteId,
          pet_id: resultado.etapas.pet.id,
          servico_id: dados.agendamento_servico_id,
          veterinario_id: dados.agendamento_veterinario_id,
          data_hora: dados.agendamento_data_hora,
          tipo: dados.agendamento_tipo || 'Consulta',
          duracao_minutos: dados.agendamento_duracao || 30,
          valor: dados.agendamento_valor,
          observacoes: dados.agendamento_observacoes,
          status: dados.agendamento_status || 'Agendado'
        }
      });
      
      if (!novoAgendamentoResult.success) {
        return { 
          success: false, 
          etapa_falha: 'criar_agendamento',
          cliente: resultado.etapas.cliente,
          pet: resultado.etapas.pet,
          error: novoAgendamentoResult.error 
        };
      }
      
      resultado.etapas.agendamento = novoAgendamentoResult.agendamento;
    }
    
    resultado.message = resultado.etapas.cliente_existente 
      ? 'Workflow concluído (cliente existente utilizado)'
      : 'Workflow concluído (novo cliente criado)';
    
    resultado.resumo = {
      cliente_id: clienteId,
      cliente_nome: resultado.etapas.cliente.nome,
      cliente_novo: !resultado.etapas.cliente_existente,
      pet_id: resultado.etapas.pet?.id,
      pet_nome: resultado.etapas.pet?.nome,
      agendamento_id: resultado.etapas.agendamento?.id,
      agendamento_data: resultado.etapas.agendamento?.data_hora
    };
    
    return resultado;
    
  } catch (error) {
    log('WORKFLOW', 'Erro no workflow:', error.message, LogLevel.ERROR);
    return { success: false, error: error.message };
  }
}

// ==================== DEFINIÇÕES DE FERRAMENTAS ====================

const toolDefinitions = [
  // Clientes
  {
    name: "buscar_cliente_por_telefone",
    description: "Busca cliente por telefone ou WhatsApp",
    inputSchema: {
      type: "object",
      properties: {
        telefone: { type: "string", description: "Número de telefone (aceita com ou sem código do país)" }
      },
      required: ["telefone"]
    }
  },
  {
    name: "buscar_clientes",
    description: "Busca clientes por nome, telefone, CPF ou email. OBRIGATÓRIO informar termo de busca (mínimo 3 caracteres) para evitar retornar milhares de registros",
    inputSchema: {
      type: "object",
      properties: {
        termo_busca: {
          type: "string",
          description: "Termo de busca OBRIGATÓRIO: nome, telefone, CPF ou email do cliente (mínimo 3 caracteres)"
        }
      },
      required: ["termo_busca"]
    }
  },
  {
    name: "criar_cliente",
    description: "Cria novo cliente com geração automática de CPF se não fornecido",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome completo do cliente" },
            cpf: { type: "string", description: "CPF (opcional - será gerado se não fornecido)" },
            telefone: { type: "string", description: "Telefone principal" },
            email: { type: "string", description: "Email" },
            whatsapp: { type: "string", description: "WhatsApp (se diferente do telefone)" },
            endereco: { type: "string", description: "Endereço completo" },
            numero: { type: "string", description: "Número" },
            bairro: { type: "string", description: "Bairro" },
            cidade: { type: "string", description: "Cidade" },
            estado: { type: "string", description: "Estado (sigla com 2 letras)" },
            cep: { type: "string", description: "CEP" },
            observacoes: { type: "string", description: "Observações adicionais" },
            ativo: { type: "boolean", description: "Status ativo (padrão: true)" }
          },
          required: ["nome"]
        }
      },
      required: ["dados"]
    }
  },
  {
    name: "atualizar_cliente",
    description: "Atualiza dados de cliente existente",
    inputSchema: {
      type: "object",
      properties: {
        cliente_id: { type: "integer", description: "ID do cliente" },
        dados_atualizacao: { 
          type: "object",
          description: "Campos a atualizar (apenas enviar campos que deseja modificar)"
        }
      },
      required: ["cliente_id", "dados_atualizacao"]
    }
  },
  
  // Pets
  {
    name: "listar_pets_cliente",
    description: "Lista todos os pets de um cliente específico",
    inputSchema: {
      type: "object",
      properties: {
        cliente_id: { type: "integer", description: "ID do cliente" }
      },
      required: ["cliente_id"]
    }
  },
  {
    name: "buscar_pet_por_id",
    description: "Busca pet por ID com histórico completo",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" }
      },
      required: ["pet_id"]
    }
  },
  {
    name: "criar_pet",
    description: "Cadastra novo pet para um cliente",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            cliente_id: { type: "integer", description: "ID do cliente dono do pet" },
            nome: { type: "string", description: "Nome do pet" },
            especie: { type: "string", description: "Espécie (Cão, Gato, Ave, etc)" },
            raca: { type: "string", description: "Raça do pet" },
            sexo: { type: "string", description: "Sexo (M ou F)" },
            castrado: { type: "boolean", description: "Se é castrado" },
            data_nascimento: { type: "string", description: "Data de nascimento (YYYY-MM-DD)" },
            peso: { type: "number", description: "Peso em kg" },
            pelagem: { type: "string", description: "Cor/tipo de pelagem" },
            microchip: { type: "string", description: "Número do microchip" },
            alergias: { type: "string", description: "Alergias conhecidas" },
            observacoes: { type: "string", description: "Observações gerais" }
          },
          required: ["cliente_id", "nome", "especie", "sexo"]
        }
      },
      required: ["dados"]
    }
  },
  
  // Agendamentos
  {
    name: "listar_agendamentos",
    description: "Lista agendamentos com filtros diversos",
    inputSchema: {
      type: "object",
      properties: {
        filtros: {
          type: "object",
          properties: {
            cliente_id: { type: "integer", description: "Filtrar por cliente" },
            pet_id: { type: "integer", description: "Filtrar por pet" },
            status: { type: "string", description: "Status do agendamento" },
            data: { type: "string", description: "Data específica (YYYY-MM-DD)" },
            data_inicio: { type: "string", description: "Data inicial do período" },
            data_fim: { type: "string", description: "Data final do período" }
          }
        }
      }
    }
  },
  {
    name: "criar_agendamento",
    description: "Cria novo agendamento com validação automática de conflitos de horário",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            cliente_id: { type: "integer", description: "ID do cliente" },
            pet_id: { type: "integer", description: "ID do pet" },
            servico_id: { type: "integer", description: "ID do serviço (opcional)" },
            veterinario_id: { type: "integer", description: "ID do veterinário (opcional)" },
            data_hora: { type: "string", description: "Data e hora (YYYY-MM-DD HH:MM:SS)" },
            tipo: { type: "string", description: "Tipo (Consulta, Retorno, Emergência, Cirurgia)" },
            duracao_minutos: { type: "integer", description: "Duração em minutos (padrão: 30)" },
            valor: { type: "number", description: "Valor do serviço" },
            observacoes: { type: "string", description: "Observações do agendamento" },
            status: { type: "string", description: "Status inicial (padrão: Agendado)" }
          },
          required: ["cliente_id", "pet_id", "data_hora"]
        }
      },
      required: ["dados"]
    }
  },
  {
    name: "atualizar_status_agendamento",
    description: "Atualiza o status de um agendamento",
    inputSchema: {
      type: "object",
      properties: {
        agendamento_id: { type: "integer", description: "ID do agendamento" },
        status: { 
          type: "string", 
          description: "Novo status (Agendado, Confirmado, Em Atendimento, Concluído, Cancelado, Faltou)" 
        }
      },
      required: ["agendamento_id", "status"]
    }
  },
  
  // Serviços e Veterinários
  {
    name: "listar_servicos_ativos",
    description: "Lista todos os serviços disponíveis na clínica",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "listar_veterinarios",
    description: "Lista veterinários ativos da clínica",
    inputSchema: { type: "object", properties: {} }
  },
  
  // Vacinas
  {
    name: "listar_vacinas_ativas",
    description: "Lista todas as vacinas disponíveis",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "registrar_vacinacao",
    description: "Registra aplicação de vacina em um pet",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            pet_id: { type: "integer", description: "ID do pet" },
            vacina_id: { type: "integer", description: "ID da vacina" },
            veterinario_id: { type: "integer", description: "ID do veterinário aplicador" },
            data_aplicacao: { type: "string", description: "Data de aplicação (YYYY-MM-DD)" },
            data_proxima_dose: { type: "string", description: "Data da próxima dose (YYYY-MM-DD)" },
            lote: { type: "string", description: "Número do lote" },
            dose: { type: "string", description: "Número da dose" },
            observacoes: { type: "string", description: "Observações" },
            valor: { type: "number", description: "Valor cobrado" }
          },
          required: ["pet_id", "vacina_id", "data_aplicacao"]
        }
      },
      required: ["dados"]
    }
  },
  
  // Produtos
  {
    name: "buscar_produtos",
    description: "Busca produtos por nome/código, categoria ou estoque baixo. OBRIGATÓRIO ao menos um filtro para evitar retornar centenas de produtos",
    inputSchema: {
      type: "object",
      properties: {
        termo_busca: {
          type: "string",
          description: "Termo de busca (nome ou código do produto, mínimo 3 caracteres)"
        },
        categoria: {
          type: "string",
          description: "Filtrar por categoria específica"
        },
        estoque_baixo: {
          type: "boolean",
          description: "Se true, retorna apenas produtos com estoque abaixo do mínimo"
        }
      }
    }
  },
  {
    name: "criar_produto",
    description: "Cria novo produto no catálogo",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            nome: { type: "string", description: "Nome do produto" },
            categoria: { type: "string", description: "Categoria do produto" },
            codigo_barras: { type: "string", description: "Código de barras" },
            preco_custo: { type: "number", description: "Preço de custo" },
            preco_venda: { type: "number", description: "Preço de venda" },
            estoque_atual: { type: "integer", description: "Estoque inicial" },
            estoque_minimo: { type: "integer", description: "Estoque mínimo para alerta" },
            unidade: { type: "string", description: "Unidade de medida (un, cx, etc)" },
            ativo: { type: "boolean", description: "Se está ativo para venda" }
          },
          required: ["nome", "categoria", "preco_venda"]
        }
      },
      required: ["dados"]
    }
  },
  
  // Financeiro
  {
    name: "listar_contas_receber",
    description: "Lista contas a receber com filtros",
    inputSchema: {
      type: "object",
      properties: {
        filtros: {
          type: "object",
          properties: {
            status: { type: "string", description: "Status (Pendente, Paga, Parcial, Cancelada)" },
            vencimento_inicio: { type: "string", description: "Data inicial de vencimento" },
            vencimento_fim: { type: "string", description: "Data final de vencimento" },
            cliente_id: { type: "integer", description: "Filtrar por cliente" }
          }
        }
      }
    }
  },
  {
    name: "criar_conta_receber",
    description: "Cria nova conta a receber",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "Descrição da conta" },
            valor: { type: "number", description: "Valor total" },
            vencimento: { type: "string", description: "Data de vencimento (YYYY-MM-DD)" },
            cliente_id: { type: "integer", description: "ID do cliente (opcional)" },
            categoria_id: { type: "integer", description: "ID da categoria financeira" },
            forma_pagamento: { type: "string", description: "Forma de pagamento prevista" },
            status: { type: "string", description: "Status inicial (padrão: Pendente)" },
            observacoes: { type: "string", description: "Observações" }
          },
          required: ["descricao", "valor", "vencimento"]
        }
      },
      required: ["dados"]
    }
  },
  {
    name: "registrar_pagamento",
    description: "Registra pagamento de uma conta a receber",
    inputSchema: {
      type: "object",
      properties: {
        conta_id: { type: "integer", description: "ID da conta" },
        dados: {
          type: "object",
          properties: {
            valor_pago: { type: "number", description: "Valor pago" },
            data_pagamento: { type: "string", description: "Data do pagamento (YYYY-MM-DD)" },
            forma_pagamento: { 
              type: "string", 
              description: "Forma de pagamento (Dinheiro, Cartão, PIX, etc)" 
            },
            observacoes: { type: "string", description: "Observações do pagamento" }
          },
          required: ["valor_pago", "data_pagamento"]
        }
      },
      required: ["conta_id", "dados"]
    }
  },
  
  // Caixa
  {
    name: "obter_caixa_aberto",
    description: "Verifica se há caixa aberto e retorna informações",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "abrir_caixa",
    description: "Abre o caixa do dia",
    inputSchema: {
      type: "object",
      properties: {
        valor_inicial: { type: "number", description: "Valor inicial em caixa (padrão: 0)" },
        observacoes: { type: "string", description: "Observações de abertura" }
      }
    }
  },
  {
    name: "fechar_caixa",
    description: "Fecha o caixa e gera resumo",
    inputSchema: {
      type: "object",
      properties: {
        caixa_id: { type: "integer", description: "ID do caixa a fechar" }
      },
      required: ["caixa_id"]
    }
  },
  
  // Vendas
  {
    name: "criar_venda",
    description: "Realiza venda de produtos com atualização automática de estoque",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            cliente_id: { type: "integer", description: "ID do cliente (opcional)" },
            itens: {
              type: "array",
              description: "Lista de itens da venda",
              items: {
                type: "object",
                properties: {
                  produto_id: { type: "integer", description: "ID do produto" },
                  quantidade: { type: "integer", description: "Quantidade vendida" },
                  valor_unitario: { type: "number", description: "Valor unitário" },
                  desconto: { type: "number", description: "Desconto no item" }
                },
                required: ["produto_id", "quantidade", "valor_unitario"]
              }
            },
            forma_pagamento: { type: "string", description: "Forma de pagamento" },
            desconto_total: { type: "number", description: "Desconto total da venda" },
            observacoes: { type: "string", description: "Observações da venda" }
          },
          required: ["itens"]
        }
      },
      required: ["dados"]
    }
  },
  
  // Dashboard
  {
    name: "obter_indicadores_dashboard",
    description: "Obtém KPIs principais do sistema (clientes, pets, agendamentos, financeiro)",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "obter_insights_dashboard",
    description: "Obtém insights e análises inteligentes do negócio",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "obter_estatisticas_financeiras",
    description: "Obtém estatísticas financeiras detalhadas",
    inputSchema: { type: "object", properties: {} }
  },
  
  // Comissões
  {
    name: "listar_comissoes",
    description: "Lista comissões de funcionários com filtros",
    inputSchema: {
      type: "object",
      properties: {
        filtros: {
          type: "object",
          properties: {
            funcionario_id: { type: "integer", description: "ID do funcionário" },
            mes: { type: "string", description: "Mês (MM)" },
            ano: { type: "string", description: "Ano (YYYY)" },
            status: { type: "string", description: "Status (Pendente, Paga)" }
          }
        }
      }
    }
  },
  
  // Alertas
  {
    name: "obter_alertas",
    description: "Obtém lista completa de alertas do sistema",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "obter_badge_alertas",
    description: "Obtém contadores resumidos de alertas (críticos, avisos, total)",
    inputSchema: { type: "object", properties: {} }
  },
  
  // Histórico e Verificações
  {
    name: "obter_historico_vacinacao",
    description: "Obtém histórico completo de vacinação de um pet",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" }
      },
      required: ["pet_id"]
    }
  },
  {
    name: "obter_historico_clinico",
    description: "Obtém histórico médico/clínico completo de um pet (consultas, diagnósticos, anamneses)",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" }
      },
      required: ["pet_id"]
    }
  },
  {
    name: "obter_historico_peso",
    description: "Obtém histórico de peso de um pet ao longo do tempo",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" }
      },
      required: ["pet_id"]
    }
  },
  {
    name: "obter_exames_pet",
    description: "Obtém lista de exames solicitados/realizados para um pet",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" }
      },
      required: ["pet_id"]
    }
  },
  {
    name: "solicitar_exame",
    description: "Solicita um novo exame para um pet",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" },
        tipo_exame_id: { type: "integer", description: "ID do tipo de exame" },
        veterinario_id: { type: "integer", description: "ID do veterinário solicitante" },
        observacoes: { type: "string", description: "Observações sobre o exame" }
      },
      required: ["pet_id", "tipo_exame_id", "veterinario_id"]
    }
  },
  {
    name: "listar_tipos_exame",
    description: "Lista todos os tipos de exames disponíveis",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "registrar_anamnese",
    description: "Registra anamnese/consulta clínica para um pet",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" },
        veterinario_id: { type: "integer", description: "ID do veterinário" },
        data_consulta: { type: "string", description: "Data da consulta (YYYY-MM-DD)" },
        anamnese: { type: "string", description: "Descrição da anamnese" },
        diagnostico: { type: "string", description: "Diagnóstico (opcional)" },
        peso_atual: { type: "number", description: "Peso atual do pet em kg (opcional)" }
      },
      required: ["pet_id", "veterinario_id", "data_consulta", "anamnese"]
    }
  },
  {
    name: "verificar_vacinas_atrasadas",
    description: "Verifica se o pet tem vacinas atrasadas ou próximas do vencimento",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" }
      },
      required: ["pet_id"]
    }
  },
  {
    name: "obter_estatisticas_pet",
    description: "Obtém estatísticas gerais de um pet (total de consultas, vacinas, exames, etc)",
    inputSchema: {
      type: "object",
      properties: {
        pet_id: { type: "integer", description: "ID do pet" }
      },
      required: ["pet_id"]
    }
  },

  // Agendamentos Avançados
  {
    name: "validar_horario_disponivel",
    description: "Valida se um horário está disponível para agendamento com um veterinário específico",
    inputSchema: {
      type: "object",
      properties: {
        data_hora: { type: "string", description: "Data e hora desejada (YYYY-MM-DD HH:MM:SS)" },
        veterinario_id: { type: "integer", description: "ID do veterinário" },
        duracao_minutos: { type: "integer", description: "Duração estimada em minutos (padrão: 30)" },
        agendamento_id: { type: "integer", description: "ID do agendamento (se estiver remarcando)" }
      },
      required: ["data_hora", "veterinario_id"]
    }
  },
  {
    name: "listar_proximos_agendamentos",
    description: "Lista próximos agendamentos futuros de um cliente",
    inputSchema: {
      type: "object",
      properties: {
        cliente_id: { type: "integer", description: "ID do cliente" },
        limite: { type: "integer", description: "Limitar número de resultados (opcional)" }
      },
      required: ["cliente_id"]
    }
  },

  // Serviços e Planos
  {
    name: "buscar_servicos",
    description: "Busca serviços disponíveis por nome/descrição. OBRIGATÓRIO termo de busca",
    inputSchema: {
      type: "object",
      properties: {
        termo_busca: {
          type: "string",
          description: "Termo de busca (mínimo 2 caracteres): consulta, banho, vacina, etc"
        }
      },
      required: ["termo_busca"]
    }
  },
  {
    name: "listar_planos",
    description: "Lista planos de saúde/assinatura disponíveis",
    inputSchema: { type: "object", properties: {} }
  },

  // Workflows
  {
    name: "workflow_agendamento_completo",
    description: "Workflow inteligente: busca serviço, valida horário e cria agendamento em uma única operação",
    inputSchema: {
      type: "object",
      properties: {
        cliente_id: { type: "integer", description: "ID do cliente" },
        pet_id: { type: "integer", description: "ID do pet" },
        servico_descricao: { type: "string", description: "Descrição do serviço desejado (ex: consulta, banho)" },
        veterinario_id: { type: "integer", description: "ID do veterinário (opcional)" },
        data_hora: { type: "string", description: "Data e hora desejada (YYYY-MM-DD HH:MM:SS)" },
        observacoes: { type: "string", description: "Observações (opcional)" },
        validar_antes: { type: "boolean", description: "Se true, valida disponibilidade antes de criar (padrão: true se veterinario_id fornecido)" }
      },
      required: ["cliente_id", "pet_id", "data_hora"]
    }
  },

  // Busca e Workflow Antigo
  {
    name: "busca_global",
    description: "Busca global em clientes, pets, produtos e serviços",
    inputSchema: {
      type: "object",
      properties: {
        termo: { type: "string", description: "Termo de busca" }
      },
      required: ["termo"]
    }
  },
  {
    name: "workflow_novo_cliente",
    description: "Workflow completo para cadastro de cliente, pet e agendamento em uma única operação",
    inputSchema: {
      type: "object",
      properties: {
        dados: {
          type: "object",
          properties: {
            usar_cliente_existente: { 
              type: "boolean", 
              description: "Se true, usa cliente existente caso encontrado" 
            },
            cliente_nome: { type: "string", description: "Nome do cliente" },
            cliente_telefone: { type: "string", description: "Telefone do cliente" },
            cliente_cpf: { type: "string", description: "CPF (opcional)" },
            cliente_email: { type: "string", description: "Email" },
            cliente_endereco: { type: "string", description: "Endereço" },
            cliente_cidade: { type: "string", description: "Cidade" },
            cliente_estado: { type: "string", description: "Estado (sigla)" },
            pet_nome: { type: "string", description: "Nome do pet" },
            pet_especie: { type: "string", description: "Espécie" },
            pet_raca: { type: "string", description: "Raça" },
            pet_sexo: { type: "string", description: "Sexo (M/F)" },
            pet_data_nascimento: { type: "string", description: "Data nascimento (YYYY-MM-DD)" },
            agendamento_data_hora: { type: "string", description: "Data/hora agendamento" },
            agendamento_servico_id: { type: "integer", description: "ID do serviço" },
            agendamento_veterinario_id: { type: "integer", description: "ID do veterinário" }
          },
          required: ["cliente_nome", "cliente_telefone"]
        }
      },
      required: ["dados"]
    }
  }
];

// Mapeamento de funções com validação
const toolFunctions = {
  // Clientes
  buscar_cliente_por_telefone: handleValidationErrors(buscarClientePorTelefone),
  buscar_clientes: handleValidationErrors(buscarClientes),
  criar_cliente: handleValidationErrors(criarCliente),
  atualizar_cliente: handleValidationErrors(atualizarCliente),

  // Pets
  listar_pets_cliente: handleValidationErrors(listarPetsCliente),
  buscar_pet_por_id: handleValidationErrors(buscarPetPorId),
  criar_pet: handleValidationErrors(criarPet),

  // Agendamentos
  listar_agendamentos: handleValidationErrors(listarAgendamentos),
  criar_agendamento: handleValidationErrors(criarAgendamento),
  atualizar_status_agendamento: handleValidationErrors(atualizarStatusAgendamento),
  validar_horario_disponivel: handleValidationErrors(validarHorarioDisponivel),
  listar_proximos_agendamentos: handleValidationErrors(listarProximosAgendamentos),

  // Serviços e Recursos
  listar_servicos_ativos: handleValidationErrors(listarServicosAtivos),
  buscar_servicos: handleValidationErrors(buscarServicos),
  listar_veterinarios: handleValidationErrors(listarVeterinarios),
  listar_planos: handleValidationErrors(listarPlanos),

  // Vacinas
  listar_vacinas_ativas: handleValidationErrors(listarVacinasAtivas),
  registrar_vacinacao: handleValidationErrors(registrarVacinacao),
  obter_historico_vacinacao: handleValidationErrors(obterHistoricoVacinacao),
  verificar_vacinas_atrasadas: handleValidationErrors(verificarVacinasAtrasadas),

  // Histórico Clínico
  obter_historico_clinico: handleValidationErrors(obterHistoricoClinico),
  obter_historico_peso: handleValidationErrors(obterHistoricoPeso),
  registrar_anamnese: handleValidationErrors(registrarAnamnese),

  // Exames
  obter_exames_pet: handleValidationErrors(obterExamesPet),
  solicitar_exame: handleValidationErrors(solicitarExame),
  listar_tipos_exame: handleValidationErrors(listarTiposExame),

  // Estatísticas
  obter_estatisticas_pet: handleValidationErrors(obterEstatisticasPet),

  // Produtos
  buscar_produtos: handleValidationErrors(buscarProdutos),
  criar_produto: handleValidationErrors(criarProduto),

  // Financeiro
  listar_contas_receber: handleValidationErrors(listarContasReceber),
  criar_conta_receber: handleValidationErrors(criarContaReceber),
  registrar_pagamento: handleValidationErrors(registrarPagamento),

  // Caixa
  obter_caixa_aberto: handleValidationErrors(obterCaixaAberto),
  abrir_caixa: handleValidationErrors(abrirCaixa),
  fechar_caixa: handleValidationErrors(fecharCaixa),

  // Vendas
  criar_venda: handleValidationErrors(criarVenda),

  // Dashboard
  obter_indicadores_dashboard: handleValidationErrors(obterIndicadoresDashboard),
  obter_insights_dashboard: handleValidationErrors(obterInsightsDashboard),
  obter_estatisticas_financeiras: handleValidationErrors(obterEstatisticasFinanceiras),

  // Comissões e Alertas
  listar_comissoes: handleValidationErrors(listarComissoes),
  obter_alertas: handleValidationErrors(obterAlertas),
  obter_badge_alertas: handleValidationErrors(obterBadgeAlertas),

  // Busca e Workflows
  busca_global: handleValidationErrors(buscaGlobal),
  workflow_novo_cliente: handleValidationErrors(workflowNovoCliente),
  workflow_agendamento_completo: handleValidationErrors(workflowAgendamentoCompleto)
};

// ==================== MÉTRICAS ====================

const metrics = {
  requests: {
    total: 0,
    successful: 0,
    failed: 0
  },
  tools: {},
  response_times: [],
  startTime: Date.now()
};

// Inicializar métricas
toolDefinitions.forEach(tool => {
  metrics.tools[tool.name] = { calls: 0, success: 0, failed: 0, totalTime: 0 };
});

function updateMetrics(toolName, success, duration) {
  if (!CONFIG.FEATURES.METRICS_ENABLED) return;
  
  metrics.requests.total++;
  if (success) {
    metrics.requests.successful++;
  } else {
    metrics.requests.failed++;
  }
  
  metrics.response_times.push(duration);
  if (metrics.response_times.length > 100) {
    metrics.response_times.shift();
  }
  
  if (metrics.tools[toolName]) {
    metrics.tools[toolName].calls++;
    if (success) {
      metrics.tools[toolName].success++;
    } else {
      metrics.tools[toolName].failed++;
    }
    metrics.tools[toolName].totalTime += duration;
  }
}

function getMetrics() {
  const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);
  const successRate = metrics.requests.total > 0 
    ? ((metrics.requests.successful / metrics.requests.total) * 100).toFixed(2)
    : 0;
  
  const avgResponseTime = metrics.response_times.length > 0
    ? (metrics.response_times.reduce((a, b) => a + b, 0) / metrics.response_times.length).toFixed(2)
    : 0;
  
  return {
    uptime,
    requests: metrics.requests,
    successRate: `${successRate}%`,
    avgResponseTime: `${avgResponseTime}ms`,
    cache: Object.fromEntries(
      Object.entries(cacheInstances).map(([name, cache]) => [name, cache.stats()])
    ),
    topTools: Object.entries(metrics.tools)
      .filter(([_, stats]) => stats.calls > 0)
      .sort((a, b) => b[1].calls - a[1].calls)
      .slice(0, 10)
      .map(([name, stats]) => ({
        name,
        calls: stats.calls,
        successRate: ((stats.success / stats.calls) * 100).toFixed(2) + '%',
        avgTime: (stats.totalTime / stats.calls).toFixed(2) + 'ms'
      }))
  };
}

// ==================== SERVIDOR EXPRESS ====================

const app = express();

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Client-ID'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Content-Type UTF-8
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Middleware de logging
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  req.requestId = requestId;
  req.startTime = Date.now();
  log('HTTP', `${req.method} ${req.path}`, { requestId }, LogLevel.DEBUG);
  next();
});

// Middleware de logging de respostas
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    res.locals.responseData = data;
    originalSend.call(this, data);
    
    // Log apenas para requisições MCP bem-sucedidas
    if (CONFIG.FEATURES.REQUEST_LOGGING && req.path === '/' && res.statusCode === 200) {
      try {
        const parsed = JSON.parse(data);
        if (!parsed.error) {
          const duration = Date.now() - req.startTime;
          log('HTTP', `✓ ${req.method} ${req.path} - Success`, { 
            requestId: req.requestId,
            duration: duration + 'ms'
          }, LogLevel.INFO);
        }
      } catch (e) {
        // Ignorar erros de parsing
      }
    }
  };
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const toolsMatch = Object.keys(toolFunctions).length === toolDefinitions.length;
  
  let apiStatus = 'unknown';
  let apiStats = null;
  try {
    const apiTest = await apiRequest('/health');
    apiStatus = apiTest.success ? 'healthy' : 'degraded';
    apiStats = apiTest.data?.stats || null;
  } catch (e) {
    apiStatus = 'error';
  }
  
  res.json({
    status: toolsMatch && apiStatus !== 'error' ? 'healthy' : 'unhealthy',
    service: 'vetcare-mcp',
    version: '4.0.0',
    environment: 'production',
    api: {
      status: apiStatus,
      base_url: CONFIG.VETCARE_API_URL,
      stats: apiStats
    },
    tools: {
      defined: toolDefinitions.length,
      implemented: Object.keys(toolFunctions).length,
      match: toolsMatch
    },
    metrics: getMetrics(),
    features: Object.keys(CONFIG.FEATURES).filter(f => CONFIG.FEATURES[f]),
    timestamp: new Date().toISOString()
  });
});

// MCP Metadata
app.get('/.well-known/mcp', (req, res) => {
  res.json({
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "vetcare-mcp",
      version: "4.0.0",
      description: "VetCare MCP Server v4.0 - Sistema Completo de Gestão Veterinária com Validação Inteligente"
    },
    capabilities: {
      tools: { listChanged: false }
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'vetcare-mcp',
    version: '4.0.0',
    description: 'VetCare MCP Server v4.0 - Produção Otimizada',
    api_base: CONFIG.VETCARE_API_URL,
    endpoints: {
      mcp: 'POST /',
      health: 'GET /health',
      metadata: 'GET /.well-known/mcp',
      metrics: 'GET /metrics'
    },
    tools_available: toolDefinitions.length,
    documentation: 'https://vet.talkhub.me/docs'
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json(getMetrics());
});

// Main MCP endpoint
app.post('/', async (req, res) => {
  let requestId = null;
  const startTime = Date.now();
  
  try {
    const { jsonrpc, id, method, params = {} } = req.body || {};
    requestId = id;
    
    // Rate limiting
    const clientId = req.headers['x-client-id'] || req.ip;
    if (!rateLimiter.checkLimit(clientId)) {
      const remainingTime = rateLimiter.getRemainingTime(clientId);
      throw new MCPError(
        ErrorCodes.RATE_LIMIT_ERROR, 
        `Rate limit exceeded. Please wait ${remainingTime} seconds before making more requests.`
      );
    }
    
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new MCPError(ErrorCodes.INVALID_REQUEST, "Invalid Request - Empty body");
    }
    
    if (jsonrpc !== "2.0") {
      throw new MCPError(ErrorCodes.INVALID_REQUEST, "Invalid Request - JSON-RPC 2.0 required");
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    
    switch (method) {
      case 'initialize':
        return res.json(formatMCPResponse(requestId, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: "vetcare-mcp",
            version: "4.0.0",
            description: "VetCare MCP Server v4.0 - Produção Otimizada"
          }
        }));
        
      case 'notifications/initialized':
        // Cliente MCP notificando que foi inicializado
        return res.json(formatMCPResponse(requestId, {}));
        
      case 'tools/list':
        return res.json(formatMCPResponse(requestId, { tools: toolDefinitions }));
        
      case 'tools/call':
        const toolName = params.name;
        if (!toolName || !toolFunctions[toolName]) {
          throw new MCPError(
            ErrorCodes.METHOD_NOT_FOUND, 
            `Tool not found: ${toolName}`
          );
        }
        
        try {
          const toolStartTime = Date.now();
          const toolArgs = params.arguments || {};
          
          log('MCP', `Executing tool: ${toolName}`, { requestId: req.requestId });
          
          const result = await toolFunctions[toolName](toolArgs);
          
          const duration = Date.now() - toolStartTime;
          updateMetrics(toolName, result.success, duration);
          
          log('MCP', `Tool completed: ${toolName} (${duration}ms)`, { 
            success: result.success, 
            requestId: req.requestId 
          });
          
          return res.json(formatMCPResponse(requestId, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          }));
          
        } catch (toolError) {
          updateMetrics(toolName, false, Date.now() - startTime);
          
          if (toolError instanceof MCPError) {
            throw toolError;
          } else {
            throw new MCPError(
              ErrorCodes.INTERNAL_ERROR,
              `Tool execution failed: ${toolError.message}`,
              { tool: toolName }
            );
          }
        }
        
      default:
        throw new MCPError(ErrorCodes.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
    
  } catch (err) {
    log('MCP', 'Request error', { 
      error: err.message, 
      requestId: req.requestId 
    }, LogLevel.ERROR);
    
    if (err instanceof MCPError) {
      return res.json(formatMCPResponse(requestId, null, err));
    } else {
      return res.json(formatMCPResponse(requestId, null, {
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Internal server error",
        data: { originalError: err.message }
      }));
    }
  }
});

// 404 handler
app.all('*', (req, res) => {
  res.status(404).json({
    error: {
      code: ErrorCodes.METHOD_NOT_FOUND,
      message: `Endpoint não encontrado: ${req.path}`,
      data: {
        method: req.method,
        path: req.path,
        available_endpoints: ['/', '/health', '/.well-known/mcp', '/metrics']
      }
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  log('ERROR', 'Unhandled exception:', err, LogLevel.CRITICAL);
  res.status(500).json(formatMCPResponse(null, null, {
    code: ErrorCodes.INTERNAL_ERROR,
    message: "Internal server error",
    data: { originalError: err.message }
  }));
});

// ==================== INICIALIZAÇÃO ====================

async function startServer() {
  try {
    console.log('Iniciando VetCare MCP Server v4.0.0...');
    
    // Validar ferramentas
    if (Object.keys(toolFunctions).length !== toolDefinitions.length) {
      console.error('❌ Inconsistência entre ferramentas definidas e implementadas!');
      throw new Error('Tool function mapping mismatch');
    }
    console.log(`✓ ${toolDefinitions.length} ferramentas validadas`);
    
    // Testar conexão com API
    const healthCheck = await apiRequest('/health');
    if (healthCheck.success) {
      console.log('✓ Conexão com API VetCare verificada');
      const stats = healthCheck.data?.stats;
      if (stats) {
        console.log(`📊 Estatísticas: ${stats.clientes || 0} clientes, ${stats.pets || 0} pets`);
      }
    } else {
      console.warn('⚠ Não foi possível verificar conexão com API VetCare');
    }
    
    app.listen(CONFIG.PORT, CONFIG.HOST, () => {
      console.log('');
      console.log('🚀 VetCare MCP Server v4.0.0 - PRODUÇÃO OTIMIZADA');
      console.log(`🔟 Servidor local: http://${CONFIG.HOST}:${CONFIG.PORT}`);
      console.log(`🌐 Domínio: https://${CONFIG.DOMAIN}`);
      console.log(`🔗 API VetCare: ${CONFIG.VETCARE_API_URL}`);
      console.log('');
      console.log('✨ Recursos v4.0:');
      console.log('   ✅ 45+ ferramentas de gestão veterinária');
      console.log('   ✅ Sistema financeiro completo');
      console.log('   ✅ Dashboard com insights e KPIs');
      console.log('   ✅ Gestão de estoque e produtos');
      console.log('   ✅ Controle de caixa e vendas');
      console.log('   ✅ Comissões e relatórios');
      console.log('   🆕 Histórico clínico completo (vacinas, peso, exames)');
      console.log('   🆕 Verificação inteligente de vacinas atrasadas');
      console.log('   🆕 Workflow de agendamento com validação automática');
      console.log('   🆕 Validação OBRIGATÓRIA em buscas (proteção anti-overload)');
      console.log('   ✅ Cache inteligente multi-nível');
      console.log('   ✅ Rate limiting adaptativo');
      console.log('   ✅ Suporte completo MCP 2024-11-05');
      console.log('');
      console.log('🛠 Ferramentas disponíveis: ' + toolDefinitions.length);
      console.log('📊 Endpoint de métricas: /metrics');
      console.log('❤️ Health check: /health');
      console.log('');
      console.log('Sistema pronto para produção! 🎯');
      console.log('');
    });
    
  } catch (error) {
    console.error('[FATAL] Falha ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Signal handlers
process.on('uncaughtException', (error) => {
  log('FATAL', 'Uncaught Exception:', error, LogLevel.CRITICAL);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('FATAL', 'Unhandled Rejection:', reason, LogLevel.CRITICAL);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Desligando servidor...');
  console.log('Cache stats:', Object.fromEntries(
    Object.entries(cacheInstances).map(([name, cache]) => [name, cache.stats()])
  ));
  console.log('Metrics:', getMetrics());
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Desligando servidor (SIGINT)...');
  console.log('Final metrics:', getMetrics());
  process.exit(0);
});

// Start server
startServer();
