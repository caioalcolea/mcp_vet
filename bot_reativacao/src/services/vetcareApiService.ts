import axios, { AxiosInstance } from 'axios';
import { database } from '../config/database';
import { logger } from '../utils/logger';

interface VetCareConfig {
  apiUrl: string;
  apiToken: string;
}

interface VetCareCustomer {
  id: number;
  nome: string;
  telefone: string;
  email?: string;
  cpf?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  data_cadastro?: string;
}

interface VetCarePet {
  id: number;
  nome: string;
  especie: string;
  raca?: string;
  sexo: string;
  data_nascimento?: string;
  cliente_id: number;
  peso?: number;
  cor?: string;
  observacoes?: string;
}

interface VetCareVaccine {
  id: number;
  pet_id: number;
  nome_vacina: string;
  data_aplicacao: string;
  proxima_dose?: string;
  lote?: string;
  veterinario?: string;
  observacoes?: string;
}

interface VetCareAppointment {
  id: number;
  pet_id: number;
  data_hora: string;
  tipo: string;
  status: string;
  veterinario?: string;
  observacoes?: string;
  valor?: number;
}

interface VetCareFinancial {
  id: number;
  cliente_id: number;
  descricao: string;
  valor: number;
  data_vencimento: string;
  data_pagamento?: string;
  status: string;
  tipo: string;
}

export class VetCareApiService {
  private client: AxiosInstance;
  private config: VetCareConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.VETCARE_API_URL || 'https://vet.talkhub.me/api',
      apiToken: process.env.VETCARE_API_TOKEN || '',
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiToken}`,
      },
      timeout: 30000,
    });
  }

  /**
   * Sincroniza todos os clientes do VetCare para o banco local
   */
  async syncCustomers(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de clientes do VetCare');

    try {
      const response = await this.client.get<VetCareCustomer[]>('/clientes');
      const customers = response.data;

      let synced = 0;
      let errors = 0;

      for (const customer of customers) {
        try {
          // Verificar se cliente já existe
          const existing = await database.query(
            'SELECT id FROM customers WHERE id = $1',
            [customer.id]
          );

          if (existing.length > 0) {
            // Atualizar cliente existente
            await database.query(
              `UPDATE customers
               SET name = $1, phone = $2, email = $3, cpf = $4,
                   address = $5, city = $6, state = $7, updated_at = NOW()
               WHERE id = $8`,
              [
                customer.nome,
                customer.telefone,
                customer.email || null,
                customer.cpf || null,
                customer.endereco || null,
                customer.cidade || null,
                customer.estado || null,
                customer.id,
              ]
            );
          } else {
            // Inserir novo cliente
            await database.query(
              `INSERT INTO customers (id, name, phone, email, cpf, address, city, state, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                customer.id,
                customer.nome,
                customer.telefone,
                customer.email || null,
                customer.cpf || null,
                customer.endereco || null,
                customer.cidade || null,
                customer.estado || null,
                customer.data_cadastro || new Date().toISOString(),
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar cliente ${customer.id}:`, error);
          errors++;
        }
      }

      logger.info(`Sincronização de clientes concluída: ${synced} sincronizados, ${errors} erros`);
      return { synced, errors };
    } catch (error: any) {
      logger.error('Erro ao buscar clientes do VetCare:', error);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza todos os pets do VetCare para o banco local
   */
  async syncPets(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de pets do VetCare');

    try {
      const response = await this.client.get<VetCarePet[]>('/pets');
      const pets = response.data;

      let synced = 0;
      let errors = 0;

      for (const pet of pets) {
        try {
          // Verificar se pet já existe
          const existing = await database.query(
            'SELECT id FROM pets WHERE id = $1',
            [pet.id]
          );

          if (existing.length > 0) {
            // Atualizar pet existente
            await database.query(
              `UPDATE pets
               SET name = $1, species = $2, breed = $3, gender = $4,
                   birth_date = $5, customer_id = $6, weight = $7,
                   color = $8, notes = $9, updated_at = NOW()
               WHERE id = $10`,
              [
                pet.nome,
                pet.especie,
                pet.raca || null,
                pet.sexo,
                pet.data_nascimento || null,
                pet.cliente_id,
                pet.peso || null,
                pet.cor || null,
                pet.observacoes || null,
                pet.id,
              ]
            );
          } else {
            // Inserir novo pet
            await database.query(
              `INSERT INTO pets (id, name, species, breed, gender, birth_date, customer_id, weight, color, notes, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
              [
                pet.id,
                pet.nome,
                pet.especie,
                pet.raca || null,
                pet.sexo,
                pet.data_nascimento || null,
                pet.cliente_id,
                pet.peso || null,
                pet.cor || null,
                pet.observacoes || null,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar pet ${pet.id}:`, error);
          errors++;
        }
      }

      logger.info(`Sincronização de pets concluída: ${synced} sincronizados, ${errors} erros`);
      return { synced, errors };
    } catch (error: any) {
      logger.error('Erro ao buscar pets do VetCare:', error);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza vacinas de um pet específico
   */
  async syncPetVaccines(petId: number): Promise<{ synced: number; errors: number }> {
    try {
      const response = await this.client.get<VetCareVaccine[]>(`/pets/${petId}/vacinacoes`);
      const vaccines = response.data;

      let synced = 0;
      let errors = 0;

      for (const vaccine of vaccines) {
        try {
          // Verificar se vacina já existe
          const existing = await database.query(
            'SELECT id FROM vaccines WHERE id = $1',
            [vaccine.id]
          );

          // Determinar se é vacina anual baseado no nome
          const isAnnual = vaccine.nome_vacina.toLowerCase().includes('anual') ||
                          vaccine.nome_vacina.toLowerCase().includes('v8') ||
                          vaccine.nome_vacina.toLowerCase().includes('v10') ||
                          vaccine.nome_vacina.toLowerCase().includes('raiva');

          if (existing.length > 0) {
            // Atualizar vacina existente
            await database.query(
              `UPDATE vaccines
               SET vaccine_name = $1, application_date = $2, next_dose_date = $3,
                   is_annual = $4, batch_number = $5, veterinarian = $6,
                   notes = $7, updated_at = NOW()
               WHERE id = $8`,
              [
                vaccine.nome_vacina,
                vaccine.data_aplicacao,
                vaccine.proxima_dose || null,
                isAnnual,
                vaccine.lote || null,
                vaccine.veterinario || null,
                vaccine.observacoes || null,
                vaccine.id,
              ]
            );
          } else {
            // Inserir nova vacina
            await database.query(
              `INSERT INTO vaccines (id, pet_id, vaccine_name, application_date, next_dose_date, is_annual, batch_number, veterinarian, notes, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
              [
                vaccine.id,
                vaccine.pet_id,
                vaccine.nome_vacina,
                vaccine.data_aplicacao,
                vaccine.proxima_dose || null,
                isAnnual,
                vaccine.lote || null,
                vaccine.veterinario || null,
                vaccine.observacoes || null,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar vacina ${vaccine.id}:`, error);
          errors++;
        }
      }

      return { synced, errors };
    } catch (error: any) {
      logger.error(`Erro ao buscar vacinas do pet ${petId}:`, error);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza todas as vacinas de todos os pets
   */
  async syncAllVaccines(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de vacinas do VetCare');

    try {
      // Buscar todos os pets do banco local
      const pets = await database.query<{ id: number }>('SELECT id FROM pets');

      let totalSynced = 0;
      let totalErrors = 0;

      for (const pet of pets) {
        const result = await this.syncPetVaccines(pet.id);
        totalSynced += result.synced;
        totalErrors += result.errors;

        // Aguardar 100ms entre cada pet para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Sincronização de vacinas concluída: ${totalSynced} sincronizadas, ${totalErrors} erros`);
      return { synced: totalSynced, errors: totalErrors };
    } catch (error: any) {
      logger.error('Erro ao sincronizar vacinas:', error);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza agendamentos do VetCare
   */
  async syncAppointments(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de agendamentos do VetCare');

    try {
      const response = await this.client.get<VetCareAppointment[]>('/agendamentos');
      const appointments = response.data;

      let synced = 0;
      let errors = 0;

      for (const appointment of appointments) {
        try {
          // Verificar se agendamento já existe
          const existing = await database.query(
            'SELECT id FROM appointments WHERE id = $1',
            [appointment.id]
          );

          // Mapear tipo de agendamento
          let appointmentType = 'consulta';
          if (appointment.tipo.toLowerCase().includes('retorno')) appointmentType = 'retorno';
          if (appointment.tipo.toLowerCase().includes('cirurgia')) appointmentType = 'cirurgia';
          if (appointment.tipo.toLowerCase().includes('exame')) appointmentType = 'exame';

          // Mapear status
          let status = 'agendado';
          if (appointment.status.toLowerCase().includes('confirmado')) status = 'confirmado';
          if (appointment.status.toLowerCase().includes('realizado')) status = 'realizado';
          if (appointment.status.toLowerCase().includes('cancelado')) status = 'cancelado';

          if (existing.length > 0) {
            // Atualizar agendamento existente
            await database.query(
              `UPDATE appointments
               SET pet_id = $1, appointment_date = $2, appointment_type = $3,
                   status = $4, veterinarian = $5, notes = $6,
                   amount = $7, updated_at = NOW()
               WHERE id = $8`,
              [
                appointment.pet_id,
                appointment.data_hora,
                appointmentType,
                status,
                appointment.veterinario || null,
                appointment.observacoes || null,
                appointment.valor || null,
                appointment.id,
              ]
            );
          } else {
            // Inserir novo agendamento
            await database.query(
              `INSERT INTO appointments (id, pet_id, appointment_date, appointment_type, status, veterinarian, notes, amount, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
              [
                appointment.id,
                appointment.pet_id,
                appointment.data_hora,
                appointmentType,
                status,
                appointment.veterinario || null,
                appointment.observacoes || null,
                appointment.valor || null,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar agendamento ${appointment.id}:`, error);
          errors++;
        }
      }

      logger.info(`Sincronização de agendamentos concluída: ${synced} sincronizados, ${errors} erros`);
      return { synced, errors };
    } catch (error: any) {
      logger.error('Erro ao buscar agendamentos do VetCare:', error);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza contas a receber (financeiro) do VetCare
   */
  async syncFinancialDebts(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de contas a receber do VetCare');

    try {
      const response = await this.client.get<VetCareFinancial[]>('/contas-receber', {
        params: { status: 'pendente' }
      });
      const financialRecords = response.data;

      let synced = 0;
      let errors = 0;

      for (const record of financialRecords) {
        try {
          // Verificar se débito já existe
          const existing = await database.query(
            'SELECT id FROM financial_debts WHERE id = $1',
            [record.id]
          );

          const isPaid = record.status.toLowerCase() === 'pago' || record.data_pagamento !== null;

          if (existing.length > 0) {
            // Atualizar débito existente
            await database.query(
              `UPDATE financial_debts
               SET customer_id = $1, service_date = $2, amount = $3,
                   description = $4, paid = $5, updated_at = NOW()
               WHERE id = $6`,
              [
                record.cliente_id,
                record.data_vencimento,
                record.valor,
                record.descricao,
                isPaid,
                record.id,
              ]
            );
          } else {
            // Inserir novo débito
            await database.query(
              `INSERT INTO financial_debts (id, customer_id, service_date, amount, description, paid, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
              [
                record.id,
                record.cliente_id,
                record.data_vencimento,
                record.valor,
                record.descricao,
                isPaid,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar conta ${record.id}:`, error);
          errors++;
        }
      }

      logger.info(`Sincronização de contas a receber concluída: ${synced} sincronizadas, ${errors} erros`);
      return { synced, errors };
    } catch (error: any) {
      logger.error('Erro ao buscar contas a receber do VetCare:', error);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza todos os dados do VetCare
   */
  async syncAll(): Promise<void> {
    logger.info('========================================');
    logger.info('Iniciando sincronização completa do VetCare');
    logger.info('========================================');

    const results = {
      customers: await this.syncCustomers(),
      pets: await this.syncPets(),
      vaccines: await this.syncAllVaccines(),
      appointments: await this.syncAppointments(),
      financial: await this.syncFinancialDebts(),
    };

    logger.info('========================================');
    logger.info('Sincronização completa do VetCare finalizada');
    logger.info(`Clientes: ${results.customers.synced} sincronizados, ${results.customers.errors} erros`);
    logger.info(`Pets: ${results.pets.synced} sincronizados, ${results.pets.errors} erros`);
    logger.info(`Vacinas: ${results.vaccines.synced} sincronizadas, ${results.vaccines.errors} erros`);
    logger.info(`Agendamentos: ${results.appointments.synced} sincronizados, ${results.appointments.errors} erros`);
    logger.info(`Financeiro: ${results.financial.synced} sincronizados, ${results.financial.errors} erros`);
    logger.info('========================================');
  }
}

export const vetcareApiService = new VetCareApiService();
