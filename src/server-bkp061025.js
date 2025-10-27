#!/usr/bin/env node

/**
 * VetCare MCP Server - Sistema de Agendamento Veterinário
 * Versão 1.0.0 - PRODUÇÃO (Monolítico)
 * API Base: https://vet.talkhub.me/api
 * 
 * Funcionalidades validadas e testadas:
 *  - Busca de cliente por telefone (lista todos e filtra)
 *  - CRUD completo de Clientes (listar, criar, atualizar)
 *  - CRUD completo de Pets (listar pets de cliente, criar, atualizar, ver pet com histórico)
 *  - CRUD completo de Agendamentos (listar, criar, atualizar, ver agendamento com relacionamentos)
 *  - Listagem de Veterinários ativos
 *  - Listagem de Serviços ativos
 *  - Listagem de Vacinas ativas
 *  - Busca global (clientes, pets, produtos) via endpoint unificado
 *  - Workflow completo (criar cliente + pet + agendamento)
 * 
 * Compatível com OpenAI ChatGPT (MCP)
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

global.fetch = fetch;

// ==================== CONFIGURAÇÕES ====================

const CONFIG = {
  PORT: process.env.PORT || 5150,
  HOST: process.env.HOST || '0.0.0.0',
  DOMAIN: process.env.DOMAIN || 'localhost',
  
  // VetCare API (Base URL)
  VETCARE_API_URL: process.env.VETCARE_API_URL || 'https://vet.talkhub.me/api',
  
  // Configurações de tentativas (retry) e timeout
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000,     // 2 segundos entre tentativas
  API_TIMEOUT: 30000     // 30 segundos timeout das requisições à API VetCare
};

console.log('🚀 VetCare MCP Server v1.0.0 (produção)');
console.log('==============================================');

// ==================== SISTEMA DE LOGGING ====================

function log(category, message, data = null) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data).substring(0, 200)}` : '';
  console.log(`[${timestamp}] [${category}] ${message}${dataStr}`);
}

// ==================== SISTEMA DE CACHE SIMPLES ====================

class SimpleCache {
  constructor(ttl = 300000) { // TTL default 5 minutos
    this.cache = new Map();
    this.ttl = ttl;
  }
  
  set(key, value) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl
    });
  }
  
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }
  
  clear() {
    this.cache.clear();
  }
}

const clienteCache = new SimpleCache(300000);
const petsCache = new SimpleCache(300000);

// ==================== TRATAMENTO DE ERROS MCP ====================

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
  INTERNAL_ERROR: -32603
};

// ==================== HELPERS ====================

/**
 * Formatar número de telefone para padrão (##) #####-####
 */
function formatPhone(phone) {
  const numbers = phone.replace(/\D/g, '');
  if (numbers.length === 11) {
    return `(${numbers.substring(0, 2)}) ${numbers.substring(2, 7)}-${numbers.substring(7)}`;
  } else if (numbers.length === 10) {
    return `(${numbers.substring(0, 2)}) ${numbers.substring(2, 6)}-${numbers.substring(6)}`;
  }
  return phone;
}

/**
 * Gerar um CPF único fictício (baseado em timestamp) para cadastros sem CPF fornecido.
 */
function generateUniqueCPF() {
  const timestamp = Date.now().toString();
  // CPF fictício: [últimos 8 dígitos do timestamp].999.[000-99 aleatórios]
  return `${timestamp.substring(5)}.999.${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
}

/**
 * Formatar resposta JSON-RPC MCP
 */
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

/**
 * Requisitar API VetCare com retries automáticos e timeout.
 */
async function apiRequest(endpoint, method = 'GET', data = null, retries = CONFIG.RETRY_ATTEMPTS) {
  const url = `${CONFIG.VETCARE_API_URL}${endpoint}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log('API', `${method} ${endpoint} (tentativa ${attempt}/${retries})`);
      const options = {
        method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: CONFIG.API_TIMEOUT
      };
      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }
      const response = await fetch(url, options);
      if (!response.ok) {
        // Ler resposta de erro como texto (pode ser JSON ou HTML de erro)
        const errorText = await response.text();
        log('API', `Erro ${response.status}:`, errorText);
        // Se for erro 4xx, não tenta novamente (parâmetros inválidos ou não encontrado)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`API Error ${response.status}: ${errorText}`);
        }
        // Se for erro 5xx, pode tentar novamente (até atingir tentativas máximas)
        if (attempt < retries) {
          log('API', `Aguardando ${CONFIG.RETRY_DELAY}ms antes de nova tentativa...`);
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
          continue;
        }
        // Se esgotou tentativas, lança erro final
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      // Sucesso: retorna JSON parseado
      const result = await response.json();
      log('API', `✓ Sucesso ${method} ${endpoint}`);
      return { success: true, data: result };
    } catch (error) {
      log('API', `✗ Erro na requisição ${method} ${endpoint}:`, error.message);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        continue;
      }
      return { success: false, error: error.message };
    }
  }
}

// ==================== FERRAMENTAS (TOOLS) MCP ====================

/**
 * Buscar cliente por número de telefone (consulta todos os clientes e filtra por telefone ou whatsapp).
 * Retorna success, found e dados do cliente se encontrado.
 */
async function buscarClientePorTelefone({ telefone }) {
  log('TOOL', `buscar_cliente_por_telefone: ${telefone}`);
  try {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    // Verificar cache
    const cacheKey = `cliente_tel_${telefoneLimpo}`;
    const cached = clienteCache.get(cacheKey);
    if (cached) {
      log('TOOL', 'Cliente encontrado no cache');
      return cached;
    }
    // Buscar lista de clientes na API
    const result = await apiRequest('/clientes');
    if (!result.success) {
      return { success: false, found: false, error: result.error };
    }
    const clientes = result.data;
    // Filtrar cliente por telefone ou whatsapp (normalizando para dígitos)
    const cliente = clientes.find(c => {
      const telCliente = (c.telefone || '').replace(/\D/g, '');
      const whatsCliente = (c.whatsapp || '').replace(/\D/g, '');
      return telCliente === telefoneLimpo || whatsCliente === telefoneLimpo;
    });
    if (cliente) {
      const response = {
        success: true,
        found: true,
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          cpf: cliente.cpf,
          email: cliente.email,
          telefone: cliente.telefone,
          whatsapp: cliente.whatsapp,
          endereco: cliente.endereco,
          numero: cliente.numero,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          estado: cliente.estado,
          cep: cliente.cep,
          pets_count: cliente.pets_count || 0
        }
      };
      clienteCache.set(cacheKey, response);
      return response;
    }
    return { success: true, found: false, message: 'Cliente não encontrado' };
  } catch (error) {
    log('TOOL', 'Erro ao buscar cliente por telefone:', error);
    return { success: false, found: false, error: error.message };
  }
}

/**
 * Criar um novo cliente.
 * Campos obrigatórios: nome (cpf será gerado se não fornecido).
 */
async function criarCliente({ dados }) {
  log('TOOL', 'criar_cliente:', dados.nome);
  try {
    if (!dados.nome) {
      throw new Error('Nome do cliente é obrigatório');
    }
    // Gerar CPF único se não fornecido
    const cpf = dados.cpf || generateUniqueCPF();
    const payload = {
      nome: dados.nome,
      cpf: cpf,
      telefone: dados.telefone || '',
      email: dados.email || '',
      whatsapp: dados.whatsapp || dados.telefone || '',
      endereco: dados.endereco || '',
      numero: dados.numero || '',
      bairro: dados.bairro || '',
      cidade: dados.cidade || '',
      estado: dados.estado || '',
      cep: dados.cep || '',
      observacoes: dados.observacoes || '',
      ativo: 1
    };
    const result = await apiRequest('/clientes', 'POST', payload);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // Limpar cache de clientes (novo cliente adicionado)
    clienteCache.clear();
    const novoCliente = result.data;
    // Pode retornar somente alguns campos relevantes
    return {
      success: true,
      cliente: {
        id: novoCliente.id,
        nome: novoCliente.nome,
        cpf: novoCliente.cpf,
        telefone: novoCliente.telefone,
        email: novoCliente.email
      },
      message: 'Cliente criado com sucesso'
    };
  } catch (error) {
    log('TOOL', 'Erro ao criar cliente:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Atualizar dados de um cliente existente.
 * IMPORTANTE: A API requer todos os campos obrigatórios (nome, cpf, ativo) no update.
 * A função busca o cliente atual e faz merge com os novos dados.
 */
async function atualizarCliente({ cliente_id, dados_atualizacao }) {
  log('TOOL', `atualizar_cliente: ${cliente_id}`);
  try {
    // Buscar dados atuais do cliente
    const clienteAtualResult = await apiRequest(`/clientes/${cliente_id}`);
    if (!clienteAtualResult.success) {
      return { success: false, error: 'Cliente não encontrado' };
    }
    const clienteAtual = clienteAtualResult.data;
    // Preparar payload mantendo campos obrigatórios e atualizando campos fornecidos
    const payload = {
      nome: dados_atualizacao.nome || clienteAtual.nome,
      cpf: clienteAtual.cpf,  // CPF não pode ser alterado (mantém o atual)
      ativo: dados_atualizacao.ativo !== undefined ? dados_atualizacao.ativo : clienteAtual.ativo,
      telefone: dados_atualizacao.telefone || clienteAtual.telefone || '',
      email: dados_atualizacao.email || clienteAtual.email || '',
      whatsapp: dados_atualizacao.whatsapp || clienteAtual.whatsapp || '',
      endereco: dados_atualizacao.endereco || clienteAtual.endereco || '',
      numero: dados_atualizacao.numero || clienteAtual.numero || '',
      bairro: dados_atualizacao.bairro || clienteAtual.bairro || '',
      cidade: dados_atualizacao.cidade || clienteAtual.cidade || '',
      estado: dados_atualizacao.estado || clienteAtual.estado || '',
      cep: dados_atualizacao.cep || clienteAtual.cep || '',
      observacoes: dados_atualizacao.observacoes || clienteAtual.observacoes || ''
    };
    const result = await apiRequest(`/clientes/${cliente_id}`, 'PUT', payload);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // Limpar cache (dados de cliente atualizados)
    clienteCache.clear();
    return {
      success: true,
      cliente: result.data,
      message: 'Cliente atualizado com sucesso'
    };
  } catch (error) {
    log('TOOL', 'Erro ao atualizar cliente:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Listar todos os pets de um cliente (por cliente_id).
 */
async function listarPetsCliente({ cliente_id }) {
  log('TOOL', `listar_pets_cliente: ${cliente_id}`);
  try {
    const cacheKey = `pets_cliente_${cliente_id}`;
    const cached = petsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await apiRequest(`/clientes/${cliente_id}/pets`);
    if (!result.success) {
      return { success: false, pets: [], error: result.error };
    }
    const pets = result.data;
    const response = {
      success: true,
      pets: pets,
      total: pets.length
    };
    petsCache.set(cacheKey, response);
    return response;
  } catch (error) {
    log('TOOL', 'Erro ao listar pets do cliente:', error);
    return { success: false, pets: [], error: error.message };
  }
}

/**
 * Buscar pet por ID, incluindo todo o histórico (vacinas, consultas, cliente).
 */
async function buscarPetPorId({ pet_id }) {
  log('TOOL', `buscar_pet_por_id: ${pet_id}`);
  try {
    const result = await apiRequest(`/pets/${pet_id}`);
    if (!result.success) {
      return { success: false, found: false, error: result.error };
    }
    const pet = result.data;
    // Montar objeto pet com histórico se disponível
    return {
      success: true,
      found: true,
      pet: {
        id: pet.id,
        nome: pet.nome,
        especie: pet.especie,
        raca: pet.raca,
        sexo: pet.sexo,
        castrado: pet.castrado,
        data_nascimento: pet.data_nascimento,
        idade: pet.idade,
        peso: pet.peso,
        cliente: pet.cliente,
        vacinacoes: pet.vacinacoes || [],
        consultas: pet.consultas || []
      }
    };
  } catch (error) {
    log('TOOL', 'Erro ao buscar pet por ID:', error);
    return { success: false, found: false, error: error.message };
  }
}

/**
 * Criar um novo pet para um cliente.
 * Campos obrigatórios: cliente_id, nome, especie, sexo.
 */
async function criarPet({ dados }) {
  log('TOOL', 'criar_pet:', dados.nome);
  try {
    if (!dados.cliente_id) throw new Error('cliente_id é obrigatório');
    if (!dados.nome) throw new Error('nome do pet é obrigatório');
    if (!dados.especie) throw new Error('especie do pet é obrigatória');
    if (!dados.sexo) throw new Error('sexo do pet é obrigatório');
    const payload = {
      cliente_id: dados.cliente_id,
      nome: dados.nome,
      especie: dados.especie,
      raca: dados.raca || '',
      sexo: dados.sexo,
      castrado: dados.castrado || false,
      data_nascimento: dados.data_nascimento || null,
      peso: dados.peso || null,
      pelagem: dados.pelagem || '',
      alergias: dados.alergias || '',
      observacoes: dados.observacoes || '',
      ativo: 1
    };
    const result = await apiRequest('/pets', 'POST', payload);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // Limpar cache de pets (novo pet adicionado)
    petsCache.clear();
    // A resposta da API pode retornar { success: true, pet: {...} }
    const novoPet = result.data.pet || result.data;
    return {
      success: true,
      pet: novoPet,
      message: 'Pet cadastrado com sucesso'
    };
  } catch (error) {
    log('TOOL', 'Erro ao criar pet:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Atualizar dados de um pet.
 * Aceita atualização parcial, mas mantém campos obrigatórios do pet.
 */
async function atualizarPet({ pet_id, dados_atualizacao }) {
  log('TOOL', `atualizar_pet: ${pet_id}`);
  try {
    // Buscar dados atuais do pet
    const petAtualResult = await apiRequest(`/pets/${pet_id}`);
    if (!petAtualResult.success) {
      return { success: false, error: 'Pet não encontrado' };
    }
    const petAtual = petAtualResult.data;
    // Montar payload com merge dos dados
    const payload = {
      cliente_id: petAtual.cliente_id,
      nome: dados_atualizacao.nome || petAtual.nome,
      especie: dados_atualizacao.especie || petAtual.especie,
      raca: dados_atualizacao.raca || petAtual.raca || '',
      sexo: dados_atualizacao.sexo || petAtual.sexo,
      castrado: dados_atualizacao.castrado !== undefined ? dados_atualizacao.castrado : petAtual.castrado,
      data_nascimento: dados_atualizacao.data_nascimento || petAtual.data_nascimento,
      peso: dados_atualizacao.peso || petAtual.peso,
      pelagem: dados_atualizacao.pelagem || petAtual.pelagem || '',
      alergias: dados_atualizacao.alergias || petAtual.alergias || '',
      observacoes: dados_atualizacao.observacoes || petAtual.observacoes || '',
      ativo: dados_atualizacao.ativo !== undefined ? dados_atualizacao.ativo : petAtual.ativo
    };
    const result = await apiRequest(`/pets/${pet_id}`, 'PUT', payload);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // Limpar cache de pets (pet atualizado)
    petsCache.clear();
    const petAtualizado = result.data.pet || result.data;
    return {
      success: true,
      pet: petAtualizado,
      message: 'Pet atualizado com sucesso'
    };
  } catch (error) {
    log('TOOL', 'Erro ao atualizar pet:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Listar agendamentos (com filtros opcionais).
 * Filtros disponíveis: cliente_id, pet_id, status, data (exata), data_inicio, data_fim.
 */
async function listarAgendamentos({ filtros = {} }) {
  log('TOOL', 'listar_agendamentos', filtros);
  try {
    let endpoint = '/agendamentos';
    const params = [];
    if (filtros.cliente_id) params.push(`cliente_id=${filtros.cliente_id}`);
    if (filtros.pet_id) params.push(`pet_id=${filtros.pet_id}`);
    if (filtros.status) params.push(`status=${encodeURIComponent(filtros.status)}`);
    if (filtros.data) params.push(`data=${encodeURIComponent(filtros.data)}`);
    if (params.length > 0) {
      endpoint += '?' + params.join('&');
    }
    const result = await apiRequest(endpoint);
    if (!result.success) {
      return { success: false, agendamentos: [], error: result.error };
    }
    let agendamentos = result.data;
    // Filtros adicionais (data_inicio, data_fim) aplicados em código caso fornecidos
    if (filtros.data_inicio) {
      const dataInicio = new Date(filtros.data_inicio);
      agendamentos = agendamentos.filter(a => new Date(a.data_hora) >= dataInicio);
    }
    if (filtros.data_fim) {
      const dataFim = new Date(filtros.data_fim);
      agendamentos = agendamentos.filter(a => new Date(a.data_hora) <= dataFim);
    }
    return {
      success: true,
      agendamentos: agendamentos,
      total: agendamentos.length
    };
  } catch (error) {
    log('TOOL', 'Erro ao listar agendamentos:', error);
    return { success: false, agendamentos: [], error: error.message };
  }
}

/**
 * Buscar um agendamento específico por ID (inclui cliente, pet, serviço, veterinário).
 */
async function buscarAgendamentoPorId({ agendamento_id }) {
  log('TOOL', `buscar_agendamento_por_id: ${agendamento_id}`);
  try {
    const result = await apiRequest(`/agendamentos/${agendamento_id}`);
    if (!result.success) {
      return { success: false, found: false, error: result.error };
    }
    return {
      success: true,
      found: true,
      agendamento: result.data
    };
  } catch (error) {
    log('TOOL', 'Erro ao buscar agendamento por ID:', error);
    return { success: false, found: false, error: error.message };
  }
}

/**
 * Criar um novo agendamento.
 * Campos obrigatórios: cliente_id, pet_id, data_hora, tipo, duracao_minutos, status.
 * Observação: servico_id e veterinario_id devem ser fornecidos ou null explicitamente.
 */
async function criarAgendamento({ dados }) {
  log('TOOL', 'criar_agendamento:', { cliente_id: dados.cliente_id, pet_id: dados.pet_id, data_hora: dados.data_hora });
  try {
    if (!dados.cliente_id) throw new Error('cliente_id é obrigatório');
    if (!dados.pet_id) throw new Error('pet_id é obrigatório');
    if (!dados.data_hora) throw new Error('data_hora é obrigatório');
    if (!dados.tipo) throw new Error('tipo é obrigatório');
    if (!dados.duracao_minutos) throw new Error('duracao_minutos é obrigatório');
    if (!dados.status) throw new Error('status é obrigatório');
    const payload = {
      cliente_id: dados.cliente_id,
      pet_id: dados.pet_id,
      servico_id: dados.servico_id !== undefined ? dados.servico_id : null,
      veterinario_id: dados.veterinario_id !== undefined ? dados.veterinario_id : null,
      data_hora: dados.data_hora,
      tipo: dados.tipo,
      duracao_minutos: dados.duracao_minutos,
      valor: dados.valor !== undefined ? dados.valor : null,
      observacoes: dados.observacoes || '',
      status: dados.status
    };
    const result = await apiRequest('/agendamentos', 'POST', payload);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // A resposta pode ser { success: true, agendamento: {...} }
    const novoAgendamento = result.data.agendamento || result.data;
    // Retornar apenas campos principais no resultado
    return {
      success: true,
      agendamento: {
        id: novoAgendamento.id,
        cliente_id: novoAgendamento.cliente_id,
        pet_id: novoAgendamento.pet_id,
        data_hora: novoAgendamento.data_hora,
        tipo: novoAgendamento.tipo,
        status: novoAgendamento.status,
        cliente: novoAgendamento.cliente,
        pet: novoAgendamento.pet
      },
      message: 'Agendamento criado com sucesso'
    };
  } catch (error) {
    log('TOOL', 'Erro ao criar agendamento:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Atualizar um agendamento existente.
 * A API exige todos os campos obrigatórios no update; a função faz merge dos campos atuais com novos.
 */
async function atualizarAgendamento({ agendamento_id, dados_atualizacao }) {
  log('TOOL', `atualizar_agendamento: ${agendamento_id}`);
  try {
    // Buscar agendamento atual para obter campos existentes
    const agendamentoAtualResult = await apiRequest(`/agendamentos/${agendamento_id}`);
    if (!agendamentoAtualResult.success) {
      return { success: false, error: 'Agendamento não encontrado' };
    }
    const agendamentoAtual = agendamentoAtualResult.data;
    // Montar payload com campos obrigatórios mantidos e atualizações aplicadas
    const payload = {
      cliente_id: agendamentoAtual.cliente_id,
      pet_id: agendamentoAtual.pet_id,
      servico_id: dados_atualizacao.servico_id !== undefined ? dados_atualizacao.servico_id : agendamentoAtual.servico_id,
      veterinario_id: dados_atualizacao.veterinario_id !== undefined ? dados_atualizacao.veterinario_id : agendamentoAtual.veterinario_id,
      data_hora: dados_atualizacao.data_hora || agendamentoAtual.data_hora,
      tipo: dados_atualizacao.tipo || agendamentoAtual.tipo,
      duracao_minutos: dados_atualizacao.duracao_minutos || agendamentoAtual.duracao_minutos,
      valor: dados_atualizacao.valor !== undefined ? dados_atualizacao.valor : agendamentoAtual.valor,
      observacoes: dados_atualizacao.observacoes || agendamentoAtual.observacoes || '',
      status: dados_atualizacao.status || agendamentoAtual.status
    };
    const result = await apiRequest(`/agendamentos/${agendamento_id}`, 'PUT', payload);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    const agendamentoAtualizado = result.data.agendamento || result.data;
    return {
      success: true,
      agendamento: agendamentoAtualizado,
      message: 'Agendamento atualizado com sucesso'
    };
  } catch (error) {
    log('TOOL', 'Erro ao atualizar agendamento:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Listar todos os veterinários ativos.
 */
async function listarVeterinarios() {
  log('TOOL', 'listar_veterinarios');
  try {
    const result = await apiRequest('/veterinarios');
    if (!result.success) {
      return { success: false, veterinarios: [], error: result.error };
    }
    return {
      success: true,
      veterinarios: result.data,
      total: result.data.length
    };
  } catch (error) {
    log('TOOL', 'Erro ao listar veterinários:', error);
    return { success: false, veterinarios: [], error: error.message };
  }
}

/**
 * Listar todos os serviços ativos.
 */
async function listarServicosAtivos() {
  log('TOOL', 'listar_servicos_ativos');
  try {
    const result = await apiRequest('/servicos-ativos');
    if (!result.success) {
      return { success: false, servicos: [], error: result.error };
    }
    return {
      success: true,
      servicos: result.data,
      total: result.data.length
    };
  } catch (error) {
    log('TOOL', 'Erro ao listar serviços ativos:', error);
    return { success: false, servicos: [], error: error.message };
  }
}

/**
 * Listar todas as vacinas ativas.
 */
async function listarVacinasAtivas() {
  log('TOOL', 'listar_vacinas_ativas');
  try {
    const result = await apiRequest('/vacinas-ativas');
    if (!result.success) {
      return { success: false, vacinas: [], error: result.error };
    }
    return {
      success: true,
      vacinas: result.data,
      total: result.data.length
    };
  } catch (error) {
    log('TOOL', 'Erro ao listar vacinas ativas:', error);
    return { success: false, vacinas: [], error: error.message };
  }
}

/**
 * Busca global por um termo (clientes, pets, produtos).
 * Retorna resultados separados por categoria.
 */
async function buscaGlobal({ termo }) {
  log('TOOL', `busca_global: ${termo}`);
  try {
    const result = await apiRequest(`/buscar?q=${encodeURIComponent(termo)}`);
    if (!result.success) {
      return { success: false, resultados: {}, error: result.error };
    }
    return {
      success: true,
      resultados: {
        clientes: result.data.clientes || [],
        pets: result.data.pets || [],
        produtos: result.data.produtos || []
      },
      total: {
        clientes: (result.data.clientes || []).length,
        pets: (result.data.pets || []).length,
        produtos: (result.data.produtos || []).length
      }
    };
  } catch (error) {
    log('TOOL', 'Erro na busca global:', error);
    return { success: false, resultados: {}, error: error.message };
  }
}

/**
 * Workflow completo para novos clientes: cria cliente, pet e agendamento.
 * Recebe dados do cliente, pet e agendamento, executa as etapas sequencialmente.
 */
async function workflowNovoCliente({ dados }) {
  log('TOOL', 'workflow_novo_cliente');
  try {
    const resultado = { success: true, etapas: {} };
    // Etapa 1: Criar cliente (ou usar existente se telefone já cadastrado, se desejado)
    log('WORKFLOW', '1/3: Criando cliente...');
    const novoClienteResult = await criarCliente({ dados: {
      nome: dados.cliente_nome,
      cpf: dados.cliente_cpf,        // CPF opcional
      telefone: dados.cliente_telefone,
      email: dados.cliente_email,
      whatsapp: dados.cliente_whatsapp,
      endereco: dados.cliente_endereco,
      numero: dados.cliente_numero,
      bairro: dados.cliente_bairro,
      cidade: dados.cliente_cidade,
      estado: dados.cliente_estado,
      cep: dados.cliente_cep,
      observacoes: dados.cliente_observacoes
    }});
    if (!novoClienteResult.success) {
      return { success: false, etapa_falha: 'criar_cliente', error: novoClienteResult.error };
    }
    resultado.etapas.cliente = novoClienteResult.cliente;
    log('WORKFLOW', `✓ Cliente criado: ID ${novoClienteResult.cliente.id}`);
    // Etapa 2: Criar pet (se dados do pet fornecidos)
    if (dados.pet_nome) {
      log('WORKFLOW', '2/3: Criando pet...');
      const novoPetResult = await criarPet({ dados: {
        cliente_id: novoClienteResult.cliente.id,
        nome: dados.pet_nome,
        especie: dados.pet_especie,
        raca: dados.pet_raca,
        sexo: dados.pet_sexo,
        castrado: dados.pet_castrado,
        data_nascimento: dados.pet_data_nascimento,
        peso: dados.pet_peso,
        pelagem: dados.pet_pelagem,
        alergias: dados.pet_alergias,
        observacoes: dados.pet_observacoes
      }});
      if (!novoPetResult.success) {
        return { 
          success: false, 
          etapa_falha: 'criar_pet', 
          cliente_criado: novoClienteResult.cliente, 
          error: novoPetResult.error 
        };
      }
      resultado.etapas.pet = novoPetResult.pet;
      log('WORKFLOW', `✓ Pet criado: ID ${novoPetResult.pet.id}`);
    }
    // Etapa 3: Criar agendamento (se dados fornecidos e pet criado com sucesso)
    if (dados.agendamento_data_hora && resultado.etapas.pet) {
      log('WORKFLOW', '3/3: Criando agendamento...');
      const novoAgendamentoResult = await criarAgendamento({ dados: {
        cliente_id: novoClienteResult.cliente.id,
        pet_id: resultado.etapas.pet.id,
        servico_id: dados.agendamento_servico_id,      // pode ser undefined ou null
        veterinario_id: dados.agendamento_veterinario_id,  // pode ser undefined ou null
        data_hora: dados.agendamento_data_hora,
        tipo: dados.agendamento_tipo || 'Consulta',
        duracao_minutos: dados.agendamento_duracao || 30,
        valor: dados.agendamento_valor,
        observacoes: dados.agendamento_observacoes,
        status: dados.agendamento_status || 'Agendado'
      }});
      if (!novoAgendamentoResult.success) {
        return { 
          success: false, 
          etapa_falha: 'criar_agendamento',
          cliente_criado: novoClienteResult.cliente,
          pet_criado: resultado.etapas.pet,
          error: novoAgendamentoResult.error 
        };
      }
      resultado.etapas.agendamento = novoAgendamentoResult.agendamento;
      log('WORKFLOW', `✓ Agendamento criado: ID ${novoAgendamentoResult.agendamento.id}`);
    }
    return resultado;
  } catch (error) {
    log('WORKFLOW', 'Erro no workflow completo:', error);
    return { success: false, error: error.message };
  }
}

// ==================== DEFINIÇÕES DE FERRAMENTAS (TOOLS) ====================

const toolDefinitions = [
  {
    "name": "buscar_cliente_por_telefone",
    "description": "Busca um cliente pelo número de telefone (ou WhatsApp). Lista todos os clientes e retorna aquele cujo telefone ou WhatsApp coincide com o fornecido.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "telefone": {
          "type": "string",
          "description": "Número de telefone do cliente (qualquer formato, será normalizado). Ex: (11) 98888-7777 ou 11988887777"
        }
      },
      "required": ["telefone"]
    }
  },
  {
    "name": "criar_cliente",
    "description": "Cria um novo cliente no sistema VetCare. CPF será gerado automaticamente se não fornecido. Campos obrigatórios: nome.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "dados": {
          "type": "object",
          "properties": {
            "nome": { "type": "string", "description": "Nome completo do cliente" },
            "cpf": { "type": "string", "description": "CPF do cliente (opcional, deve ser único)" },
            "telefone": { "type": "string", "description": "Telefone de contato" },
            "email": { "type": "string", "description": "Endereço de e-mail" },
            "whatsapp": { "type": "string", "description": "Número de WhatsApp (opcional, padrão é o telefone se não fornecido)" },
            "endereco": { "type": "string", "description": "Endereço (rua)" },
            "numero": { "type": "string", "description": "Número do endereço" },
            "bairro": { "type": "string", "description": "Bairro" },
            "cidade": { "type": "string", "description": "Cidade" },
            "estado": { "type": "string", "description": "Estado (UF, ex: SP)" },
            "cep": { "type": "string", "description": "CEP" },
            "observacoes": { "type": "string", "description": "Observações adicionais sobre o cliente" }
          },
          "required": ["nome"]
        }
      },
      "required": ["dados"]
    }
  },
  {
    "name": "atualizar_cliente",
    "description": "Atualiza os dados de um cliente existente. Importante: nome, cpf e ativo são campos obrigatórios e não devem ser omitidos. Esta ferramenta cuida de obter os dados atuais e mesclar com as atualizações fornecidas.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "cliente_id": { "type": "integer", "description": "ID do cliente a ser atualizado" },
        "dados_atualizacao": {
          "type": "object",
          "description": "Campos do cliente para atualizar. Apenas os campos fornecidos serão atualizados, os demais permanecerão iguais.",
          "properties": {
            "nome": { "type": "string" },
            "telefone": { "type": "string" },
            "email": { "type": "string" },
            "whatsapp": { "type": "string" },
            "endereco": { "type": "string" },
            "numero": { "type": "string" },
            "bairro": { "type": "string" },
            "cidade": { "type": "string" },
            "estado": { "type": "string" },
            "cep": { "type": "string" },
            "observacoes": { "type": "string" },
            "ativo": { "type": "boolean", "description": "Se o cliente está ativo (true/false)" }
          }
        }
      },
      "required": ["cliente_id", "dados_atualizacao"]
    }
  },
  {
    "name": "listar_pets_cliente",
    "description": "Lista todos os pets de um determinado cliente.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "cliente_id": { "type": "integer", "description": "ID do cliente cujos pets deseja listar" }
      },
      "required": ["cliente_id"]
    }
  },
  {
    "name": "buscar_pet_por_id",
    "description": "Recupera informações detalhadas de um pet pelo ID, incluindo histórico de vacinações e consultas, além dos dados do dono (cliente).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pet_id": { "type": "integer", "description": "ID do pet a ser consultado" }
      },
      "required": ["pet_id"]
    }
  },
  {
    "name": "criar_pet",
    "description": "Cadastra um novo pet para um cliente. Campos obrigatórios: cliente_id, nome, especie, sexo.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "dados": {
          "type": "object",
          "properties": {
            "cliente_id": { "type": "integer", "description": "ID do cliente dono do pet" },
            "nome": { "type": "string", "description": "Nome do pet" },
            "especie": { "type": "string", "description": "Espécie do pet (ex: Cão, Gato, etc.)" },
            "raca": { "type": "string", "description": "Raça do pet (opcional)" },
            "sexo": { "type": "string", "description": "Sexo do pet (M ou F)" },
            "castrado": { "type": "boolean", "description": "Indica se o pet é castrado (true/false)" },
            "data_nascimento": { "type": "string", "description": "Data de nascimento do pet (YYYY-MM-DD)" },
            "peso": { "type": "number", "description": "Peso do pet em Kg" },
            "pelagem": { "type": "string", "description": "Descrição da pelagem (opcional)" },
            "alergias": { "type": "string", "description": "Alergias conhecidas (opcional)" },
            "observacoes": { "type": "string", "description": "Observações adicionais sobre o pet" }
          },
          "required": ["cliente_id", "nome", "especie", "sexo"]
        }
      },
      "required": ["dados"]
    }
  },
  {
    "name": "atualizar_pet",
    "description": "Atualiza os dados de um pet existente. Aceita atualização parcial (somente campos fornecidos serão alterados).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pet_id": { "type": "integer", "description": "ID do pet a ser atualizado" },
        "dados_atualizacao": {
          "type": "object",
          "description": "Campos do pet para atualizar. Campos não fornecidos permanecerão inalterados.",
          "properties": {
            "nome": { "type": "string" },
            "especie": { "type": "string" },
            "raca": { "type": "string" },
            "sexo": { "type": "string" },
            "castrado": { "type": "boolean" },
            "data_nascimento": { "type": "string" },
            "peso": { "type": "number" },
            "pelagem": { "type": "string" },
            "alergias": { "type": "string" },
            "observacoes": { "type": "string" },
            "ativo": { "type": "boolean" }
          }
        }
      },
      "required": ["pet_id", "dados_atualizacao"]
    }
  },
  {
    "name": "listar_agendamentos",
    "description": "Lista agendamentos cadastrados, podendo filtrar por cliente, pet, status ou data específica. Também aceita filtrar por intervalo de datas (data_inicio e data_fim).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "filtros": {
          "type": "object",
          "properties": {
            "cliente_id": { "type": "integer", "description": "Filtrar agendamentos por ID do cliente" },
            "pet_id": { "type": "integer", "description": "Filtrar agendamentos por ID do pet" },
            "status": { "type": "string", "description": "Filtrar por status do agendamento (Agendado, Confirmado, etc.)" },
            "data": { "type": "string", "description": "Filtrar por data exata (YYYY-MM-DD)" },
            "data_inicio": { "type": "string", "description": "Filtrar agendamentos a partir desta data (inclusive)" },
            "data_fim": { "type": "string", "description": "Filtrar agendamentos até esta data (inclusive)" }
          }
        }
      }
    }
  },
  {
    "name": "buscar_agendamento_por_id",
    "description": "Recupera um agendamento específico pelo ID, incluindo informações do cliente, pet, serviço e veterinário associados.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agendamento_id": { "type": "integer", "description": "ID do agendamento a ser consultado" }
      },
      "required": ["agendamento_id"]
    }
  },
  {
    "name": "criar_agendamento",
    "description": "Cria um novo agendamento (compromisso) para um pet de um cliente. Campos obrigatórios: cliente_id, pet_id, data_hora, tipo, duracao_minutos, status. Campos opcionais: servico_id, veterinario_id, valor, observacoes.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "dados": {
          "type": "object",
          "properties": {
            "cliente_id": { "type": "integer" },
            "pet_id": { "type": "integer" },
            "servico_id": { "type": "integer", "description": "ID do serviço agendado (ou null)" },
            "veterinario_id": { "type": "integer", "description": "ID do veterinário responsável (ou null)" },
            "data_hora": { "type": "string", "description": "Data e hora do agendamento (formato YYYY-MM-DD HH:MM:SS)" },
            "tipo": { "type": "string", "description": "Tipo de agendamento (Consulta, Vacina, Cirurgia, etc.)" },
            "duracao_minutos": { "type": "integer", "description": "Duração prevista do atendimento em minutos" },
            "valor": { "type": "number", "description": "Valor previsto do atendimento (opcional)" },
            "observacoes": { "type": "string", "description": "Observações adicionais sobre o agendamento" },
            "status": { "type": "string", "description": "Status inicial do agendamento (ex: Agendado, Confirmado)" }
          },
          "required": ["cliente_id", "pet_id", "data_hora", "tipo", "duracao_minutos", "status"]
        }
      },
      "required": ["dados"]
    }
  },
  {
    "name": "atualizar_agendamento",
    "description": "Atualiza um agendamento existente. Deve enviar todos os campos obrigatórios do agendamento. Esta ferramenta obtém o agendamento atual e faz merge com os novos valores fornecidos.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "agendamento_id": { "type": "integer", "description": "ID do agendamento a ser atualizado" },
        "dados_atualizacao": {
          "type": "object",
          "properties": {
            "data_hora": { "type": "string", "description": "Nova data e hora (YYYY-MM-DD HH:MM:SS)" },
            "tipo": { "type": "string", "description": "Tipo do agendamento (Consulta, etc.)" },
            "duracao_minutos": { "type": "integer", "description": "Duração (minutos)" },
            "valor": { "type": "number", "description": "Valor (opcional)" },
            "observacoes": { "type": "string", "description": "Observações (opcional)" },
            "status": { "type": "string", "description": "Novo status do agendamento" },
            "servico_id": { "type": "integer", "description": "ID do serviço (ou null para nenhum)" },
            "veterinario_id": { "type": "integer", "description": "ID do veterinário (ou null)" }
          }
        }
      },
      "required": ["agendamento_id", "dados_atualizacao"]
    }
  },
  {
    "name": "listar_veterinarios",
    "description": "Lista todos os veterinários ativos cadastrados no sistema.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "listar_servicos_ativos",
    "description": "Lista todos os serviços disponíveis (ativos) cadastrados no sistema.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "listar_vacinas_ativas",
    "description": "Lista todas as vacinas disponíveis (ativas) cadastradas no sistema.",
    "inputSchema": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "name": "busca_global",
    "description": "Realiza uma busca global pelo termo fornecido, retornando resultados em clientes, pets e produtos que correspondam ao termo.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "termo": { "type": "string", "description": "Termo de busca (nome, parte do nome, etc.)" }
      },
      "required": ["termo"]
    }
  },
  {
    "name": "workflow_novo_cliente",
    "description": "Executa o workflow completo de cadastro: cria um novo cliente, um novo pet (se fornecido) e um agendamento (se fornecido), em sequência.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "dados": {
          "type": "object",
          "properties": {
            "cliente_nome": { "type": "string", "description": "Nome completo do novo cliente" },
            "cliente_cpf": { "type": "string", "description": "CPF do cliente (opcional)" },
            "cliente_telefone": { "type": "string", "description": "Telefone do cliente" },
            "cliente_email": { "type": "string", "description": "Email do cliente" },
            "cliente_whatsapp": { "type": "string", "description": "WhatsApp do cliente (opcional)" },
            "cliente_endereco": { "type": "string", "description": "Endereço (rua) do cliente" },
            "cliente_numero": { "type": "string", "description": "Número do endereço" },
            "cliente_bairro": { "type": "string", "description": "Bairro" },
            "cliente_cidade": { "type": "string", "description": "Cidade" },
            "cliente_estado": { "type": "string", "description": "Estado (UF)" },
            "cliente_cep": { "type": "string", "description": "CEP" },
            "cliente_observacoes": { "type": "string", "description": "Observações sobre o cliente" },
            "pet_nome": { "type": "string", "description": "Nome do pet (se for cadastrar um pet)" },
            "pet_especie": { "type": "string", "description": "Espécie do pet" },
            "pet_raca": { "type": "string", "description": "Raça do pet" },
            "pet_sexo": { "type": "string", "description": "Sexo do pet (M/F)" },
            "pet_castrado": { "type": "boolean", "description": "Indica se o pet é castrado" },
            "pet_data_nascimento": { "type": "string", "description": "Data de nascimento do pet" },
            "pet_peso": { "type": "number", "description": "Peso do pet" },
            "pet_pelagem": { "type": "string", "description": "Pelagem do pet" },
            "pet_alergias": { "type": "string", "description": "Alergias do pet" },
            "pet_observacoes": { "type": "string", "description": "Observações sobre o pet" },
            "agendamento_data_hora": { "type": "string", "description": "Data e hora do agendamento (YYYY-MM-DD HH:MM:SS)" },
            "agendamento_tipo": { "type": "string", "description": "Tipo do agendamento (Consulta, Vacina, etc.)" },
            "agendamento_duracao": { "type": "integer", "description": "Duração em minutos do agendamento" },
            "agendamento_valor": { "type": "number", "description": "Valor do agendamento (opcional)" },
            "agendamento_observacoes": { "type": "string", "description": "Observações do agendamento" },
            "agendamento_status": { "type": "string", "description": "Status inicial do agendamento (padrão 'Agendado')" },
            "agendamento_servico_id": { "type": "integer", "description": "ID do serviço a ser associado (opcional)" },
            "agendamento_veterinario_id": { "type": "integer", "description": "ID do veterinário a ser associado (opcional)" }
          },
          "required": ["cliente_nome", "cliente_telefone"]
        }
      },
      "required": ["dados"]
    }
  }
];

// Mapear as funções de ferramentas para seus nomes
const toolFunctions = {
  buscar_cliente_por_telefone: buscarClientePorTelefone,
  criar_cliente: criarCliente,
  atualizar_cliente: atualizarCliente,
  listar_pets_cliente: listarPetsCliente,
  buscar_pet_por_id: buscarPetPorId,
  criar_pet: criarPet,
  atualizar_pet: atualizarPet,
  listar_agendamentos: listarAgendamentos,
  buscar_agendamento_por_id: buscarAgendamentoPorId,
  criar_agendamento: criarAgendamento,
  atualizar_agendamento: atualizarAgendamento,
  listar_veterinarios: listarVeterinarios,
  listar_servicos_ativos: listarServicosAtivos,
  listar_vacinas_ativas: listarVacinasAtivas,
  busca_global: buscaGlobal,
  workflow_novo_cliente: workflowNovoCliente
};

// ==================== CONFIGURAÇÃO DO SERVIDOR EXPRESS ====================

const app = express();

// CORS liberado para qualquer origem (necessário para integração ChatGPT)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Endpoint de pré-flight (CORS)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// Endpoint de verificação de saúde do servidor
app.get('/health', (req, res) => {
  const toolsMatch = Object.keys(toolFunctions).length === toolDefinitions.length;
  res.json({
    status: toolsMatch ? 'healthy' : 'unhealthy',
    service: 'vetcare-mcp',
    version: '1.0.0',
    api_base: CONFIG.VETCARE_API_URL,
    tools_defined: toolDefinitions.length,
    tools_implemented: Object.keys(toolFunctions).length,
    tools_match: toolsMatch,
    features: [
      'busca_cliente_por_telefone',
      'crud_clientes',
      'crud_pets',
      'crud_agendamentos',
      'workflow_completo',
      'cache_system',
      'retry_mechanism',
      'validated_endpoints_only'
    ],
    cache_stats: {
      clientes_cached: clienteCache.cache.size,
      pets_cached: petsCache.cache.size
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Metadata MCP endpoint (well-known)
app.get('/.well-known/mcp', (req, res) => {
  res.json({
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "vetcare-mcp",
      version: "1.0.0",
      description: "VetCare MCP Server - Sistema de Agendamento Veterinário"
    },
    capabilities: {
      tools: { listChanged: false }
    }
  });
});

// Endpoint raiz informativo
app.get('/', (req, res) => {
  res.json({
    name: 'vetcare-mcp',
    version: '1.0.0',
    description: 'VetCare MCP Server - Sistema Veterinário (MCP)',
    api_base: CONFIG.VETCARE_API_URL,
    endpoints: {
      mcp: 'POST /',
      health: 'GET /health',
      metadata: 'GET /.well-known/mcp'
    },
    tools_available: toolDefinitions.length,
    documentation: 'https://vet.talkhub.me/DOCUMENTACAO_API_FINAL'
  });
});

// Endpoint principal MCP (JSON-RPC 2.0)
app.post('/', async (req, res) => {
  let requestId = null;
  try {
    const { jsonrpc, id, method, params = {} } = req.body || {};
    requestId = id;
    if (!req.body || Object.keys(req.body).length === 0) {
      throw new MCPError(ErrorCodes.INVALID_REQUEST, "Invalid Request - Empty body");
    }
    if (jsonrpc !== "2.0") {
      throw new MCPError(ErrorCodes.INVALID_REQUEST, "Invalid Request - JSON-RPC 2.0 required");
    }
    res.setHeader('Content-Type', 'application/json');
    switch (method) {
      case 'initialize':
        // Resposta de inicialização
        return res.json(formatMCPResponse(requestId, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "vetcare-mcp", version: "1.0.0" }
        }));
      case 'tools/list':
        // Retorna a lista de definições de ferramentas disponíveis
        return res.json(formatMCPResponse(requestId, { tools: toolDefinitions }));
      case 'tools/call':
        const toolName = params.name;
        if (!toolName || !toolFunctions[toolName]) {
          const availableTools = Object.keys(toolFunctions);
          throw new MCPError(ErrorCodes.METHOD_NOT_FOUND, `Tool not found: ${toolName}. Ferramentas disponíveis: ${availableTools.join(', ')}`);
        }
        try {
          const toolArgs = params.arguments || {};
          const result = await toolFunctions[toolName](toolArgs);
          // Retorna o resultado da ferramenta como conteúdo textual (JSON formatado)
          return res.json(formatMCPResponse(requestId, {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          }));
        } catch (toolError) {
          if (toolError instanceof MCPError) {
            throw toolError;
          } else {
            throw new MCPError(
              ErrorCodes.INTERNAL_ERROR,
              `Tool execution failed: ${toolError.message}`,
              { tool: toolName, originalError: toolError.message }
            );
          }
        }
      default:
        throw new MCPError(ErrorCodes.METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  } catch (err) {
    if (err instanceof MCPError) {
      return res.json(formatMCPResponse(requestId, null, err));
    } else {
      console.error('Unhandled error:', err);
      return res.json(formatMCPResponse(requestId, null, {
        code: ErrorCodes.INTERNAL_ERROR,
        message: "Internal server error",
        data: { originalError: err.message }
      }));
    }
  }
});

// Handler para rotas não encontradas (404)
app.all('*', (req, res) => {
  res.status(404).json({
    error: {
      code: ErrorCodes.METHOD_NOT_FOUND,
      message: `Endpoint não encontrado: ${req.path}`,
      data: {
        method: req.method,
        path: req.path,
        available_endpoints: ['/', '/health', '/.well-known/mcp']
      }
    }
  });
});

// Tratamento global de erros não tratados
app.use((err, req, res, next) => {
  console.error('[ERROR] Unhandled exception:', err);
  res.status(500).json(formatMCPResponse(null, null, {
    code: ErrorCodes.INTERNAL_ERROR,
    message: "Internal server error",
    data: { originalError: err.message }
  }));
});

// ==================== INICIALIZAÇÃO DO SERVIDOR ====================

async function startServer() {
  try {
    console.log('Iniciando VetCare MCP Server v1.0.0...');
    // Validar se todas as ferramentas definidas têm funções implementadas
    if (Object.keys(toolFunctions).length !== toolDefinitions.length) {
      console.error('❌ Inconsistência entre ferramentas definidas e implementadas!');
      console.error(`Definições: ${toolDefinitions.length}, Implementações: ${Object.keys(toolFunctions).length}`);
      throw new Error('Tool function mapping mismatch');
    }
    console.log('✓ Definições de ferramentas validadas');
    // Testar conexão básica com API VetCare (opcional: /test ou /health se disponível)
    const healthCheck = await apiRequest('/test');
    if (healthCheck.success) {
      console.log('✓ Conexão com API VetCare verificada com sucesso');
    } else {
      console.warn('⚠ Não foi possível verificar conexão com API VetCare (continuando assim mesmo)');
    }
    app.listen(CONFIG.PORT, CONFIG.HOST, () => {
      console.log('');
      console.log('🚀 VetCare MCP Server rodando!');
      console.log(`📟 Servidor local: http://${CONFIG.HOST}:${CONFIG.PORT}`);
      console.log(`🌐 Endpoint público (configure DNS): https://${CONFIG.DOMAIN}`);
      console.log(`🔗 API VetCare (Base): ${CONFIG.VETCARE_API_URL}`);
      console.log('🛠️  Ferramentas disponíveis:', Object.keys(toolFunctions).length);
      console.log('');
      console.log('📋 Funcionalidades disponíveis:');
      console.log('   ✅ Busca de clientes por telefone');
      console.log('   ✅ CRUD de Clientes (listar, criar, atualizar)');
      console.log('   ✅ CRUD de Pets (listar do cliente, criar, atualizar, detalhes)');
      console.log('   ✅ CRUD de Agendamentos (listar, criar, atualizar, detalhes)');
      console.log('   ✅ Listagem de Veterinários, Serviços, Vacinas');
      console.log('   ✅ Busca Global unificada');
      console.log('   ✅ Workflow completo (Cliente+Pet+Agendamento)');
      console.log('   ✅ Sistema de cache em memória para otimização');
      console.log('   ✅ Mecanismo de tentativas (retry) para resilência');
      console.log('');
      console.log('🎯 Endpoints críticos e validados apenas estão habilitados.');
      console.log('');
    });
  } catch (error) {
    console.error('[FATAL] Falha ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de sinais do processo para desligamento gracioso
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  process.exit(1);
});
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Desligando servidor...');
  clienteCache.clear();
  petsCache.clear();
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Desligando servidor...');
  clienteCache.clear();
  petsCache.clear();
  process.exit(0);
});

// Inicializar o servidor
startServer();

