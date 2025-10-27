import axios, { AxiosInstance } from 'axios';
import { database } from '../config/database';
import { logger } from '../utils/logger';

interface VetCareConfig {
  apiUrl: string;
}

// Tipos baseados na documentação real da API
interface VetCareCliente {
  id: number;
  nome: string;
  cpf?: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  ativo?: boolean;
}

interface VetCarePet {
  id: number;
  nome: string;
  especie: string;
  raca?: string;
  sexo: string;
  data_nascimento?: string;
  peso?: number;
  castrado?: boolean;
  pelagem?: string;
  microchip?: string;
  alergias?: string;
  observacoes?: string;
  cliente_id?: number;
  ativo?: boolean;
}

interface VetCareVacinacao {
  id: number;
  vacina_nome: string;
  veterinario_nome?: string;
  data_aplicacao: string;
  proxima_dose?: string;
  dose?: string;
  lote?: string;
}

interface VetCareAgendamento {
  id: number;
  cliente_id: number;
  pet_id: number;
  data_hora: string;
  tipo: string;
  status: string;
  veterinario_id?: number;
  valor?: number;
  observacoes?: string;
}

interface VetCareContaReceber {
  id: number;
  cliente_id: number;
  valor: number;
  data_vencimento: string;
  data_pagamento?: string;
  descricao?: string;
  status: string;
}

export class VetCareApiService {
  private client: AxiosInstance;
  private config: VetCareConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.VETCARE_API_URL || 'https://vet.talkhub.me/api',
    };

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    logger.info(`VetCare API configurada: ${this.config.apiUrl}`);
  }

  /**
   * Trata erros de requisição HTTP de forma padronizada
   */
  private logRequestError(error: any, endpoint: string): void {
    if (error.response) {
      logger.error(`Erro HTTP ${error.response.status} ao acessar ${endpoint}:`, {
        status: error.response.status,
        statusText: error.response.statusText,
        data: typeof error.response.data === 'string'
          ? error.response.data.substring(0, 200)
          : error.response.data
      });
    } else if (error.request) {
      logger.error(`Sem resposta da API ao acessar ${endpoint}:`, {
        message: error.message,
        code: error.code,
        url: `${this.config.apiUrl}${endpoint}`
      });
    } else {
      logger.error(`Erro ao configurar requisição para ${endpoint}:`, error.message);
    }
  }

  /**
   * Sincroniza todos os clientes do VetCare
   */
  async syncCustomers(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de clientes do VetCare');

    try {
      logger.info(`GET ${this.config.apiUrl}/clientes`);
      const response = await this.client.get<VetCareCliente[]>('/clientes');
      const customers = response.data;

      if (!Array.isArray(customers)) {
        logger.error('Resposta da API não é um array:', typeof customers);
        return { synced: 0, errors: 1 };
      }

      logger.info(`API retornou ${customers.length} clientes`);

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
                customer.telefone || customer.whatsapp || null,
                customer.email || null,
                customer.cpf || null,
                customer.endereco
                  ? `${customer.endereco}, ${customer.numero || ''}${customer.complemento ? ' - ' + customer.complemento : ''}`.trim()
                  : null,
                customer.cidade || null,
                customer.estado || null,
                customer.id,
              ]
            );
          } else {
            // Inserir novo cliente
            await database.query(
              `INSERT INTO customers (id, name, phone, email, cpf, address, city, state, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
              [
                customer.id,
                customer.nome,
                customer.telefone || customer.whatsapp || null,
                customer.email || null,
                customer.cpf || null,
                customer.endereco
                  ? `${customer.endereco}, ${customer.numero || ''}${customer.complemento ? ' - ' + customer.complemento : ''}`.trim()
                  : null,
                customer.cidade || null,
                customer.estado || null,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar cliente ${customer.id}:`, error.message);
          errors++;
        }
      }

      logger.info(`Sincronização de clientes concluída: ${synced} sincronizados, ${errors} erros`);
      return { synced, errors };
    } catch (error: any) {
      this.logRequestError(error, '/clientes');
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza todos os pets do VetCare
   */
  async syncPets(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de pets do VetCare');

    try {
      logger.info(`GET ${this.config.apiUrl}/pets?ativo=1`);
      const response = await this.client.get<VetCarePet[]>('/pets', {
        params: { ativo: 1 }
      });
      const pets = response.data;

      if (!Array.isArray(pets)) {
        logger.error('Resposta da API não é um array:', typeof pets);
        return { synced: 0, errors: 1 };
      }

      logger.info(`API retornou ${pets.length} pets`);

      let synced = 0;
      let errors = 0;

      for (const pet of pets) {
        try {
          // Buscar cliente_id do pet através da API se não vier no objeto
          let clienteId = pet.cliente_id;

          if (!clienteId) {
            // Buscar detalhes completos do pet que incluem cliente_id
            const detailsResponse = await this.client.get(`/pets/${pet.id}`);
            clienteId = detailsResponse.data?.cliente?.id;
          }

          if (!clienteId) {
            logger.warn(`Pet ${pet.id} sem cliente_id - pulando`);
            errors++;
            continue;
          }

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
                clienteId,
                pet.peso || null,
                pet.pelagem || null,
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
                clienteId,
                pet.peso || null,
                pet.pelagem || null,
                pet.observacoes || null,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar pet ${pet.id}:`, error.message);
          errors++;
        }
      }

      logger.info(`Sincronização de pets concluída: ${synced} sincronizados, ${errors} erros`);
      return { synced, errors };
    } catch (error: any) {
      this.logRequestError(error, '/pets');
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza vacinas de um pet específico
   */
  async syncPetVaccines(petId: number): Promise<{ synced: number; errors: number }> {
    try {
      const response = await this.client.get<VetCareVacinacao[]>(`/pets/${petId}/vacinacoes`);
      const vaccines = response.data;

      if (!Array.isArray(vaccines)) {
        return { synced: 0, errors: 0 }; // Pet pode não ter vacinas
      }

      let synced = 0;
      let errors = 0;

      for (const vaccine of vaccines) {
        try {
          // Determinar se é vacina anual baseado no nome ou intervalo
          const isAnnual = vaccine.vacina_nome?.toLowerCase().includes('anual') ||
                          vaccine.vacina_nome?.toLowerCase().includes('raiva') ||
                          vaccine.vacina_nome?.toLowerCase().includes('v8') ||
                          vaccine.vacina_nome?.toLowerCase().includes('v10');

          // Verificar se vacina já existe (baseado em pet_id, nome e data)
          const existing = await database.query(
            'SELECT id FROM vaccines WHERE pet_id = $1 AND vaccine_name = $2 AND application_date = $3',
            [petId, vaccine.vacina_nome, vaccine.data_aplicacao]
          );

          if (existing.length > 0) {
            // Atualizar vacina existente
            await database.query(
              `UPDATE vaccines
               SET next_dose_date = $1, is_annual = $2, batch_number = $3,
                   veterinarian = $4, notes = $5, updated_at = NOW()
               WHERE id = $6`,
              [
                vaccine.proxima_dose || null,
                isAnnual,
                vaccine.lote || null,
                vaccine.veterinario_nome || null,
                vaccine.dose || null,
                existing[0].id,
              ]
            );
          } else {
            // Inserir nova vacina
            await database.query(
              `INSERT INTO vaccines (pet_id, vaccine_name, application_date, next_dose_date, is_annual, batch_number, veterinarian, notes, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
              [
                petId,
                vaccine.vacina_nome,
                vaccine.data_aplicacao,
                vaccine.proxima_dose || null,
                isAnnual,
                vaccine.lote || null,
                vaccine.veterinario_nome || null,
                vaccine.dose || null,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar vacina do pet ${petId}:`, error.message);
          errors++;
        }
      }

      return { synced, errors };
    } catch (error: any) {
      // Pet sem vacinas é normal, não registrar como erro
      if (error.response?.status === 404) {
        return { synced: 0, errors: 0 };
      }
      this.logRequestError(error, `/pets/${petId}/vacinacoes`);
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

      logger.info(`Sincronizando vacinas de ${pets.length} pets...`);

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
      logger.error('Erro ao sincronizar vacinas:', error.message);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza agendamentos do VetCare
   */
  async syncAppointments(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de agendamentos do VetCare');

    try {
      logger.info(`GET ${this.config.apiUrl}/agendamentos`);
      const response = await this.client.get<VetCareAgendamento[]>('/agendamentos');
      const appointments = response.data;

      if (!Array.isArray(appointments)) {
        logger.error('Resposta da API não é um array:', typeof appointments);
        return { synced: 0, errors: 1 };
      }

      logger.info(`API retornou ${appointments.length} agendamentos`);

      let synced = 0;
      let errors = 0;

      for (const appointment of appointments) {
        try {
          // Mapear tipo de agendamento
          let appointmentType = 'consulta';
          const tipo = appointment.tipo?.toLowerCase() || '';
          if (tipo.includes('retorno')) appointmentType = 'retorno';
          if (tipo.includes('cirurgia')) appointmentType = 'cirurgia';
          if (tipo.includes('exame')) appointmentType = 'exame';

          // Mapear status
          let status = 'agendado';
          const statusApi = appointment.status?.toLowerCase() || '';
          if (statusApi.includes('confirmado')) status = 'confirmado';
          if (statusApi.includes('concluído') || statusApi.includes('concluido')) status = 'realizado';
          if (statusApi.includes('cancelado')) status = 'cancelado';

          // Verificar se agendamento já existe
          const existing = await database.query(
            'SELECT id FROM appointments WHERE id = $1',
            [appointment.id]
          );

          if (existing.length > 0) {
            // Atualizar agendamento existente
            await database.query(
              `UPDATE appointments
               SET pet_id = $1, appointment_date = $2, appointment_type = $3,
                   status = $4, notes = $5, amount = $6, updated_at = NOW()
               WHERE id = $7`,
              [
                appointment.pet_id,
                appointment.data_hora,
                appointmentType,
                status,
                appointment.observacoes || null,
                appointment.valor || null,
                appointment.id,
              ]
            );
          } else {
            // Inserir novo agendamento
            await database.query(
              `INSERT INTO appointments (id, pet_id, appointment_date, appointment_type, status, notes, amount, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
              [
                appointment.id,
                appointment.pet_id,
                appointment.data_hora,
                appointmentType,
                status,
                appointment.observacoes || null,
                appointment.valor || null,
              ]
            );
          }

          synced++;
        } catch (error: any) {
          logger.error(`Erro ao sincronizar agendamento ${appointment.id}:`, error.message);
          errors++;
        }
      }

      logger.info(`Sincronização de agendamentos concluída: ${synced} sincronizados, ${errors} erros`);
      return { synced, errors };
    } catch (error: any) {
      this.logRequestError(error, '/agendamentos');
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * Sincroniza contas a receber do VetCare
   * Busca para cada cliente individualmente
   */
  async syncFinancialDebts(): Promise<{ synced: number; errors: number }> {
    logger.info('Iniciando sincronização de contas a receber do VetCare');

    try {
      // Buscar todos os clientes do banco local
      const customers = await database.query<{ id: number }>('SELECT id FROM customers');

      logger.info(`Sincronizando contas a receber de ${customers.length} clientes...`);

      let totalSynced = 0;
      let totalErrors = 0;

      for (const customer of customers) {
        try {
          const response = await this.client.get<VetCareContaReceber[]>('/contas-receber', {
            params: { cliente_id: customer.id }
          });
          const records = response.data;

          if (!Array.isArray(records) || records.length === 0) {
            continue; // Cliente sem débitos
          }

          for (const record of records) {
            try {
              const isPaid = record.status?.toLowerCase() === 'pago' || record.data_pagamento !== null;

              // Verificar se débito já existe
              const existing = await database.query(
                'SELECT id FROM financial_debts WHERE id = $1',
                [record.id]
              );

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
                    record.descricao || 'Serviço veterinário',
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
                    record.descricao || 'Serviço veterinário',
                    isPaid,
                  ]
                );
              }

              totalSynced++;
            } catch (error: any) {
              logger.error(`Erro ao sincronizar conta ${record.id}:`, error.message);
              totalErrors++;
            }
          }

          // Aguardar 50ms entre cada cliente
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error: any) {
          // Cliente sem contas é normal
          if (error.response?.status !== 404) {
            logger.error(`Erro ao buscar contas do cliente ${customer.id}:`, error.message);
            totalErrors++;
          }
        }
      }

      logger.info(`Sincronização de contas a receber concluída: ${totalSynced} sincronizadas, ${totalErrors} erros`);
      return { synced: totalSynced, errors: totalErrors };
    } catch (error: any) {
      logger.error('Erro ao sincronizar contas a receber:', error.message);
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

    const startTime = Date.now();

    const results = {
      customers: await this.syncCustomers(),
      pets: await this.syncPets(),
      vaccines: await this.syncAllVaccines(),
      appointments: await this.syncAppointments(),
      financial: await this.syncFinancialDebts(),
    };

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('========================================');
    logger.info('Sincronização completa do VetCare finalizada');
    logger.info(`Tempo total: ${totalTime}s`);
    logger.info(`Clientes: ${results.customers.synced} sincronizados, ${results.customers.errors} erros`);
    logger.info(`Pets: ${results.pets.synced} sincronizados, ${results.pets.errors} erros`);
    logger.info(`Vacinas: ${results.vaccines.synced} sincronizadas, ${results.vaccines.errors} erros`);
    logger.info(`Agendamentos: ${results.appointments.synced} sincronizados, ${results.appointments.errors} erros`);
    logger.info(`Financeiro: ${results.financial.synced} sincronizados, ${results.financial.errors} erros`);
    logger.info('========================================');
  }
}

export const vetcareApiService = new VetCareApiService();
