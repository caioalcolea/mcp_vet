/**
 * Exemplo de estrutura para src/tools.js
 * Este arquivo deve exportar todas as ferramentas do sistema
 */

import { vetcareAPI, cache, systemLogger, MCPError, ErrorCodes, FriendlyMessages } from './core.js';

// Verificar cliente existente
export async function check_existing_customer({ phone }) {
  try {
    systemLogger.info('Checking existing customer', { phone });

    // Normalizar telefone
    const normalizedPhone = phone.replace(/\D/g, '');

    // Verificar cache
    const cacheKey = `customer_${normalizedPhone}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return {
        exists: true,
        customer: cached
      };
    }

    // Buscar todos os clientes
    const allClients = await vetcareAPI.get('/clientes');

    // Procurar cliente pelo telefone
    const customer = allClients.find(client => {
      const clientPhone = client.telefone?.replace(/\D/g, '') || '';
      return clientPhone === normalizedPhone;
    });

    if (customer) {
      cache.set(cacheKey, customer);
      return {
        exists: true,
        customer: customer
      };
    }

    return {
      exists: false,
      message: FriendlyMessages.CUSTOMER_NOT_FOUND
    };

  } catch (error) {
    systemLogger.error('Error checking customer', { error: error.message });
    throw error;
  }
}

// Criar ou atualizar cliente
export async function create_or_update_customer({ id, nome, telefone, whatsapp, email, cpf, endereco, cidade, estado }) {
  try {
    const data = {
      nome,
      telefone: telefone.replace(/\D/g, ''),
      whatsapp: whatsapp?.replace(/\D/g, '') || telefone.replace(/\D/g, ''),
      email,
      cpf: cpf?.replace(/\D/g, ''),
      endereco,
      cidade: cidade || 'São Paulo',
      estado: estado || 'SP',
      ativo: true
    };

    let response;
    if (id) {
      // Atualizar cliente existente
      response = await vetcareAPI.put(`/clientes/${id}`, data);
    } else {
      // Criar novo cliente
      response = await vetcareAPI.post('/clientes', data);
    }

    // Limpar cache
    cache.clear();

    return {
      success: true,
      customer: response,
      message: id ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!'
    };

  } catch (error) {
    systemLogger.error('Error creating/updating customer', { error: error.message });
    throw error;
  }
}

// Adicionar pet ao cliente
export async function add_pet_to_customer({
  customer_id,
  nome,
  especie,
  raca,
  sexo,
  data_nascimento,
  peso,
  observacoes,
  castrado
}) {
  try {
    const data = {
      cliente_id: customer_id,
      nome,
      especie,
      raca: raca || 'SRD',
      sexo: sexo || 'I',
      data_nascimento,
      peso: parseFloat(peso) || 0,
      observacoes,
      castrado: castrado || false,
      ativo: true
    };

    const response = await vetcareAPI.post('/pets', data);

    return {
      success: true,
      pet: response,
      message: `Pet ${nome} cadastrado com sucesso!`
    };

  } catch (error) {
    systemLogger.error('Error adding pet', { error: error.message });
    throw error;
  }
}

// Listar pets do cliente
export async function list_customer_pets({ customer_id }) {
  try {
    const response = await vetcareAPI.get(`/clientes/${customer_id}/pets`);

    return {
      success: true,
      pets: response || [],
      count: response?.length || 0
    };

  } catch (error) {
    systemLogger.error('Error listing pets', { error: error.message });
    throw error;
  }
}

// Buscar serviços
export async function search_services({ query, tipo, include_prices = false }) {
  try {
    const response = await vetcareAPI.get('/servicos');
    let services = response || [];

    // Filtrar por tipo se especificado
    if (tipo) {
      services = services.filter(service =>
        service.tipo.toLowerCase().includes(tipo.toLowerCase())
      );
    }

    // Filtrar por query se especificado
    if (query) {
      services = services.filter(service =>
        service.nome.toLowerCase().includes(query.toLowerCase()) ||
        service.tipo.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (!include_prices) {
      // Remover preços se não solicitado
      services = services.map(service => {
        const { preco, ...serviceWithoutPrice } = service;
        return serviceWithoutPrice;
      });
    }

    return {
      success: true,
      services,
      count: services.length
    };

  } catch (error) {
    systemLogger.error('Error searching services', { error: error.message });
    throw error;
  }
}

// Verificar horários disponíveis
export async function check_available_slots({
  date,
  service_id,
  veterinarian_id,
  period_days = 7,
  time_preference
}) {
  try {
    // Para este exemplo, vamos simular horários disponíveis
    // Em uma implementação real, você consultaria a agenda real
    const slots = [];
    const startDate = new Date(date);

    for (let i = 0; i < period_days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      // Horários padrão de funcionamento
      const times = ['08:00', '09:00', '10:00', '14:00', '15:00', '16:00', '17:00'];

      times.forEach(time => {
        slots.push({
          data: currentDate.toISOString().split('T')[0],
          horario: time,
          veterinario_id: veterinarian_id || 1,
          servico_id: service_id,
          disponivel: true
        });
      });
    }

    // Filtrar por preferência de horário
    let filteredSlots = slots;
    if (time_preference) {
      filteredSlots = slots.filter(slot => {
        const hour = parseInt(slot.horario.split(':')[0]);
        if (time_preference === 'manhã') return hour < 12;
        if (time_preference === 'tarde') return hour >= 12 && hour < 18;
        if (time_preference === 'noite') return hour >= 18;
        return true;
      });
    }

    return {
      success: true,
      slots: filteredSlots,
      count: filteredSlots.length,
      message: filteredSlots.length > 0 ?
        'Horários disponíveis encontrados!' :
        FriendlyMessages.NO_SLOTS_AVAILABLE
    };

  } catch (error) {
    systemLogger.error('Error checking slots', { error: error.message });
    throw error;
  }
}

// Agendamento inteligente
export async function intelligent_booking({ 
  customer_id, 
  pet_id, 
  pet_name,
  service_description, 
  preferred_date, 
  preferred_time, 
  flexible, 
  auto_confirm,
  context 
}) {
  try {
    systemLogger.info('Intelligent booking request', { 
      customer_id, 
      service_description,
      preferred_date 
    });
    
    // Buscar serviço baseado na descrição
    const servicesResult = await search_services({ query: service_description });
    if (!servicesResult.services || servicesResult.services.length === 0) {
      throw new MCPError(ErrorCodes.APPLICATION_ERROR, FriendlyMessages.SERVICE_NOT_FOUND);
    }
    
    const service = servicesResult.services[0];
    
    // Se não tiver pet_id, buscar pelo nome
    if (!pet_id && pet_name) {
      const petsResult = await list_customer_pets({ customer_id });
      const pet = petsResult.pets.find(p => 
        p.nome.toLowerCase() === pet_name.toLowerCase()
      );
      if (pet) {
        pet_id = pet.id;
      } else {
        throw new MCPError(ErrorCodes.APPLICATION_ERROR, FriendlyMessages.PET_NOT_FOUND);
      }
    }
    
    // Verificar horários
    const slotsResult = await check_available_slots({ 
      date: preferred_date,
      service_id: service.id,
      period_days: flexible ? 14 : 7
    });
    
    if (slotsResult.count === 0) {
      return {
        success: false,
        message: FriendlyMessages.NO_SLOTS_AVAILABLE,
        suggestion: 'Tente outra data ou seja mais flexível com os horários.'
      };
    }
    
    // Encontrar melhor horário
    let bestSlot = slotsResult.slots[0];
    if (preferred_time) {
      const preferredHour = parseInt(preferred_time.split(':')[0]);
      bestSlot = slotsResult.slots.reduce((best, slot) => {
        const slotHour = parseInt(slot.horario.split(':')[0]);
        const bestHour = parseInt(best.horario.split(':')[0]);
        const slotDiff = Math.abs(slotHour - preferredHour);
        const bestDiff = Math.abs(bestHour - preferredHour);
        return slotDiff < bestDiff ? slot : best;
      }, slotsResult.slots[0]);
    }
    
    // Se auto_confirm, fazer o agendamento
    if (auto_confirm) {
      const bookingResult = await book_appointment({
        cliente_id: customer_id,
        animal_id: pet_id,
        servico_id: service.id,
        data: bestSlot.data,
        horario: bestSlot.horario,
        veterinario_id: bestSlot.veterinario_id,
        observacoes: `Agendamento automático: ${service_description}`
      });
      
      return {
        success: true,
        booking_confirmed: true,
        appointment: bookingResult.appointment,
        message: `Agendamento confirmado para ${bestSlot.data} às ${bestSlot.horario}!`
      };
    }
    
    // Retornar sugestão
    return {
      success: true,
      booking_confirmed: false,
      suggestion: {
        service,
        slot: bestSlot,
        alternatives: slotsResult.slots.slice(0, 3)
      },
      message: `Melhor horário encontrado: ${bestSlot.data} às ${bestSlot.horario}. Confirma?`
    };
    
  } catch (error) {
    systemLogger.error('Error in intelligent booking', { error: error.message });
    throw error;
  }
}

// Confirmar agendamento
export async function book_appointment({
  cliente_id,
  animal_id,
  servico_id,
  data,
  horario,
  veterinario_id,
  observacoes,
  payment_method
}) {
  try {
    // Combinar data e horário no formato correto
    const dataHora = `${data} ${horario}:00`;

    const appointmentData = {
      cliente_id,
      pet_id: animal_id,
      servico_id,
      veterinario_id: veterinario_id || 1,
      data_hora: dataHora,
      tipo: 'Consulta',
      status: 'Agendado',
      duracao_minutos: 30,
      observacoes: observacoes || '',
      valor: 0
    };

    const response = await vetcareAPI.post('/agendamentos', appointmentData);

    return {
      success: true,
      appointment: response,
      message: 'Agendamento confirmado com sucesso!'
    };

  } catch (error) {
    systemLogger.error('Error booking appointment', { error: error.message });
    throw new MCPError(
      ErrorCodes.APPLICATION_ERROR,
      FriendlyMessages.BOOKING_FAILED,
      { originalError: error.message }
    );
  }
}

// Listar agendamentos
export async function list_appointments({ customer_id, pet_id, status, upcoming_only }) {
  try {
    const response = await vetcareAPI.get('/agendamentos');
    let appointments = response || [];

    // Filtrar por cliente
    if (customer_id) {
      appointments = appointments.filter(apt => apt.cliente_id === customer_id);
    }

    // Filtrar por pet
    if (pet_id) {
      appointments = appointments.filter(apt => apt.pet_id === pet_id);
    }

    // Filtrar por status
    if (status) {
      appointments = appointments.filter(apt => apt.status === status);
    }

    // Filtrar apenas futuros
    if (upcoming_only) {
      const now = new Date();
      appointments = appointments.filter(apt => new Date(apt.data_hora) > now);
    }

    return {
      success: true,
      appointments,
      count: appointments.length
    };

  } catch (error) {
    systemLogger.error('Error listing appointments', { error: error.message });
    throw error;
  }
}

// Cancelar agendamento
export async function cancel_appointment({ appointment_id, reason }) {
  try {
    await vetcareAPI.delete(`/agendamentos/${appointment_id}`);

    return {
      success: true,
      message: `Agendamento ${appointment_id} cancelado com sucesso.`,
      reason: reason || 'Cancelado pelo cliente'
    };

  } catch (error) {
    systemLogger.error('Error canceling appointment', { error: error.message });
    throw error;
  }
}

// Remarcar agendamento
export async function reschedule_appointment({ appointment_id, new_date, new_time, keep_same_veterinarian, reason }) {
  try {
    const newDataHora = `${new_date} ${new_time}:00`;

    const updateData = {
      data_hora: newDataHora
    };

    const response = await vetcareAPI.put(`/agendamentos/${appointment_id}`, updateData);

    return {
      success: true,
      appointment: response,
      message: `Agendamento remarcado para ${new_date} às ${new_time}`,
      reason: reason || 'Remarcado a pedido do cliente'
    };

  } catch (error) {
    systemLogger.error('Error rescheduling appointment', { error: error.message });
    throw error;
  }
}

export async function get_customer_balance({ customer_id, include_details }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function create_invoice({ customer_id, items, due_date, payment_method, notes }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function get_pet_history({ pet_id, include_vaccines, include_appointments, date_from, date_to }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function list_veterinarians({ specialty, available_only, include_schedule, date }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function send_reminder({ appointment_id, customer_phone, reminder_type, custom_message }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function notify_team_member({ target_person, reason, context, priority }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function analyze_intent({ message, context, check_emergency }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function process_pix_payment({ customer_id, amount, invoice_id, appointment_id, apply_discount, description }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}

export async function get_dashboard_stats({ period, include_financial, include_appointments, include_pets, include_performance }) {
  // Implementação
  return { success: true, message: 'Função ainda não implementada' };
}
