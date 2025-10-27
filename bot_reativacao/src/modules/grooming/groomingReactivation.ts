import { database } from '../../config/database';
import { whatsappService } from '../../services/whatsappService';
import { logger } from '../../utils/logger';
import { dateHelpers } from '../../utils/dateHelpers';
import { config } from '../../config';
import { GroomingService } from '../../types';

export class GroomingReactivation {
  /**
   * Busca serviços de banho/tosa para reativação
   */
  async getGroomingServicesForReactivation(): Promise<GroomingService[]> {
    const query = `
      SELECT
        gs.id,
        gs.pet_id,
        gs.service_date,
        gs.service_type,
        gs.has_plan,
        gs.plan_type,
        p.name as pet_name,
        p.breed as pet_breed,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone
      FROM grooming_services gs
      INNER JOIN pets p ON gs.pet_id = p.id
      INNER JOIN customers c ON p.customer_id = c.id
      WHERE c.phone IS NOT NULL
        AND c.phone != ''
      ORDER BY gs.service_date DESC
    `;

    try {
      const services = await database.query<GroomingService>(query);

      // Filtrar serviços que precisam de reativação
      const servicesToReactivate = services.filter((service) => {
        return dateHelpers.shouldSendGroomingReminder(
          new Date(service.service_date),
          service.has_plan,
          service.plan_type
        );
      });

      logger.info(`Encontrados ${servicesToReactivate.length} serviços de banho/tosa para reativação`);
      return servicesToReactivate;
    } catch (error) {
      logger.error('Erro ao buscar serviços de banho/tosa para reativação:', error);
      return [];
    }
  }

  /**
   * Busca planos disponíveis para a raça do pet
   */
  async getBreedSpecificPlans(breed: string): Promise<any[]> {
    const query = `
      SELECT
        id,
        name,
        description,
        monthly_price,
        services_included
      FROM grooming_plans
      WHERE breed_specific = TRUE
        AND LOWER(breeds) LIKE LOWER(?)
      ORDER BY monthly_price ASC
    `;

    try {
      const plans = await database.query(query, [`%${breed}%`]);
      return plans;
    } catch (error) {
      logger.error('Erro ao buscar planos específicos para raça:', error);
      return [];
    }
  }

  /**
   * Busca planos gerais
   */
  async getGeneralPlans(): Promise<any[]> {
    const query = `
      SELECT
        id,
        name,
        description,
        monthly_price,
        services_included
      FROM grooming_plans
      WHERE breed_specific = FALSE
      ORDER BY monthly_price ASC
      LIMIT 3
    `;

    try {
      const plans = await database.query(query);
      return plans;
    } catch (error) {
      logger.error('Erro ao buscar planos gerais:', error);
      return [];
    }
  }

  /**
   * Verifica se já foi enviada reativação para este serviço recentemente
   */
  async wasReactivationSentRecently(customerId: number, serviceId: number, days: number): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM reactivation_logs
      WHERE customer_id = ?
        AND reactivation_type = 'grooming'
        AND JSON_EXTRACT(message_sent, '$.serviceId') = ?
        AND sent_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;

    try {
      const result = await database.query<{ count: number }>(query, [customerId, serviceId, days]);
      return result[0].count > 0;
    } catch (error) {
      logger.error('Erro ao verificar reativação enviada:', error);
      return false;
    }
  }

  /**
   * Gera mensagem para cliente com plano mensal
   */
  generatePlanReminderMessage(service: GroomingService): string {
    const lastServiceDate = dateHelpers.formatDate(new Date(service.service_date));

    let message = `Olá! 🐾\n\n`;
    message += `Tudo bem? Aqui é da *Clínica Veterinária*!\n\n`;
    message += `Lembrando que *${service.pet_name}* está com o plano de banho mensal ativo! 🛁✨\n\n`;
    message += `Último banho: *${lastServiceDate}*\n\n`;
    message += `Que tal agendar o próximo banho do seu pet? Estamos com horários disponíveis! 📅\n\n`;
    message += `Responda esta mensagem para agendar! 😊`;

    return message;
  }

  /**
   * Gera mensagem para cliente sem plano
   */
  async generateNoPlanMessage(service: GroomingService): Promise<string> {
    const lastServiceDate = dateHelpers.formatDate(new Date(service.service_date));

    let message = `Olá! 🐾\n\n`;
    message += `Tudo bem? Aqui é da *Clínica Veterinária*!\n\n`;
    message += `Já faz um tempinho desde o último banho do(a) *${service.pet_name}* (${lastServiceDate})! 🛁\n\n`;
    message += `Seu pet está precisando de um banho fresquinho? 😊\n\n`;

    // Buscar planos específicos para a raça ou planos gerais
    let plans: any[] = [];
    if (service.pet_breed) {
      plans = await this.getBreedSpecificPlans(service.pet_breed);
    }

    if (plans.length === 0) {
      plans = await this.getGeneralPlans();
    }

    if (plans.length > 0) {
      message += `💰 *Temos planos com desconto especial para você:*\n\n`;

      for (const plan of plans) {
        const price = parseFloat(plan.monthly_price).toFixed(2).replace('.', ',');
        message += `📦 *${plan.name}*\n`;
        message += `   💵 R$ ${price}/mês\n`;
        if (plan.description) {
          message += `   📝 ${plan.description}\n`;
        }
        message += `\n`;
      }

      message += `Com os planos, você economiza e seu pet fica sempre limpinho! 🐶🐱✨\n\n`;
    }

    message += `Gostaria de agendar um banho ou conhecer mais sobre nossos planos? 📞\n\n`;
    message += `Responda esta mensagem! Estamos à disposição! 😊`;

    return message;
  }

  /**
   * Registra log de reativação
   */
  async logReactivation(
    customerId: number,
    serviceId: number,
    message: string,
    status: 'success' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const query = `
      INSERT INTO reactivation_logs
        (customer_id, reactivation_type, message_sent, sent_at, status, error_message)
      VALUES (?, 'grooming', ?, NOW(), ?, ?)
    `;

    const messageData = JSON.stringify({
      serviceId,
      message,
    });

    try {
      await database.query(query, [customerId, messageData, status, errorMessage || null]);
    } catch (error) {
      logger.error('Erro ao registrar log de reativação de banho:', error);
    }
  }

  /**
   * Processa reativações de banho/tosa
   */
  async processGroomingReactivations(): Promise<void> {
    logger.info('Iniciando processamento de reativação de banho/tosa');

    try {
      const services = await this.getGroomingServicesForReactivation();

      if (services.length === 0) {
        logger.info('Nenhum serviço de banho/tosa para reativar');
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const service of services) {
        try {
          // Buscar customer_id
          const petQuery = `SELECT customer_id FROM pets WHERE id = ?`;
          const petResult = await database.query<{ customer_id: number }>(petQuery, [service.pet_id]);

          if (petResult.length === 0) {
            logger.warn(`Pet não encontrado: ${service.pet_id}`);
            continue;
          }

          const customerId = petResult[0].customer_id;

          // Determinar intervalo baseado no tipo de plano
          const checkInterval = service.has_plan && service.plan_type === 'mensal' ? 7 : 30;

          // Verificar se já foi enviado recentemente
          const alreadySent = await this.wasReactivationSentRecently(customerId, service.id, checkInterval);
          if (alreadySent) {
            logger.info(`Reativação já enviada recentemente para serviço ${service.id}`);
            skippedCount++;
            continue;
          }

          // Validar telefone
          if (!service.customer_phone || !whatsappService.isValidPhoneNumber(service.customer_phone)) {
            logger.warn(`Telefone inválido para cliente: ${service.customer_name}`);
            await this.logReactivation(
              customerId,
              service.id,
              '',
              'error',
              'Telefone inválido'
            );
            errorCount++;
            continue;
          }

          // Gerar mensagem apropriada
          let message: string;
          if (service.has_plan) {
            message = this.generatePlanReminderMessage(service);
          } else {
            message = await this.generateNoPlanMessage(service);
          }

          // Enviar mensagem
          const sent = await whatsappService.sendMessage(service.customer_phone, message);

          if (sent) {
            await this.logReactivation(customerId, service.id, message, 'success');
            successCount++;
            logger.info(
              `Reativação de banho enviada com sucesso para ${service.customer_name} - Pet: ${service.pet_name}`
            );
          } else {
            await this.logReactivation(
              customerId,
              service.id,
              message,
              'error',
              'Falha ao enviar mensagem'
            );
            errorCount++;
          }

          // Aguardar 2 segundos entre cada envio
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          logger.error(`Erro ao processar reativação de banho ${service.id}:`, error);
          errorCount++;
        }
      }

      logger.info(
        `Reativação de banho/tosa concluída: ${successCount} sucessos, ${errorCount} erros, ${skippedCount} pulados`
      );
    } catch (error) {
      logger.error('Erro ao processar reativações de banho/tosa:', error);
    }
  }
}

export const groomingReactivation = new GroomingReactivation();
