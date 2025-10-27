import { database } from '../../config/database';
import { whatsappService } from '../../services/whatsappService';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { CompletedService, SatisfactionFormData } from '../../types';

export class SatisfactionSurvey {
  /**
   * Busca serviços concluídos que ainda não receberam pesquisa de satisfação
   */
  async getCompletedServicesForSurvey(): Promise<CompletedService[]> {
    const query = `
      SELECT
        cs.id,
        cs.pet_id,
        cs.service_date,
        cs.service_type,
        cs.has_taxidog,
        cs.has_grooming,
        cs.has_tosa,
        cs.satisfaction_sent,
        p.name as pet_name,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone
      FROM completed_services cs
      INNER JOIN pets p ON cs.pet_id = p.id
      INNER JOIN customers c ON p.customer_id = c.id
      WHERE cs.satisfaction_sent = FALSE
        AND cs.service_date >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND cs.service_date <= NOW()
        AND c.phone IS NOT NULL
        AND c.phone != ''
      ORDER BY cs.service_date ASC
    `;

    try {
      const services = await database.query<CompletedService>(query);
      logger.info(`Encontrados ${services.length} serviços para enviar pesquisa de satisfação`);
      return services;
    } catch (error) {
      logger.error('Erro ao buscar serviços concluídos para pesquisa:', error);
      return [];
    }
  }

  /**
   * Determina qual formulário de satisfação usar baseado no tipo de serviço
   */
  getSatisfactionForm(service: CompletedService): SatisfactionFormData {
    // Caso 1: Banho sem tosa, sem taxidog
    if (service.has_grooming && !service.has_tosa && !service.has_taxidog) {
      return {
        serviceType: 'banho_sem_taxidog',
        formUrl: config.forms.banhoSemTaxidog,
      };
    }

    // Caso 2: Banho sem tosa, com taxidog
    if (service.has_grooming && !service.has_tosa && service.has_taxidog) {
      return {
        serviceType: 'banho_com_taxidog',
        formUrl: config.forms.banhoComTaxidog,
      };
    }

    // Caso 3: Banho com tosa, com taxidog
    if (service.has_grooming && service.has_tosa && service.has_taxidog) {
      return {
        serviceType: 'banho_tosa_com_taxidog',
        formUrl: config.forms.banhoTosaComTaxidog,
      };
    }

    // Caso 4: Banho com tosa, sem taxidog
    if (service.has_grooming && service.has_tosa && !service.has_taxidog) {
      return {
        serviceType: 'banho_tosa_sem_taxidog',
        formUrl: config.forms.banhoTosaSemTaxidog,
      };
    }

    // Default: Banho sem taxidog (caso não se encaixe em nenhum dos anteriores)
    return {
      serviceType: 'banho_sem_taxidog',
      formUrl: config.forms.banhoSemTaxidog,
    };
  }

  /**
   * Gera mensagem de pesquisa de satisfação
   */
  generateSatisfactionMessage(service: CompletedService, formData: SatisfactionFormData): string {
    const serviceTypeText = this.getServiceTypeText(service);

    let message = `Olá, *${service.customer_name}*! 🐾\n\n`;
    message += `Esperamos que *${service.pet_name}* tenha adorado o ${serviceTypeText}! 😊\n\n`;
    message += `Sua opinião é muito importante para nós! 💙\n\n`;
    message += `Gostaríamos de saber como foi sua experiência. Poderia dedicar 1 minuto para responder nossa pesquisa de satisfação?\n\n`;
    message += `📋 *Clique aqui para responder:*\n`;
    message += `${formData.formUrl}\n\n`;
    message += `✨ Sua avaliação nos ajuda a melhorar cada vez mais nossos serviços!\n\n`;

    if (config.forms.googleReviewUrl) {
      message += `_Obs: Se você avaliar com 3 estrelas ou mais, vamos te direcionar para avaliar no Google também!_ ⭐⭐⭐\n\n`;
    }

    message += `Muito obrigado! 🙏`;

    return message;
  }

  /**
   * Obtém texto descritivo do tipo de serviço
   */
  getServiceTypeText(service: CompletedService): string {
    const parts: string[] = [];

    if (service.has_grooming) {
      parts.push('banho');
    }

    if (service.has_tosa) {
      parts.push('tosa');
    }

    if (service.has_taxidog) {
      parts.push('com taxidog');
    }

    if (parts.length === 0) {
      return 'atendimento';
    }

    return parts.join(' e ');
  }

  /**
   * Marca serviço como pesquisa enviada
   */
  async markSatisfactionSent(serviceId: number): Promise<void> {
    const query = `
      UPDATE completed_services
      SET satisfaction_sent = TRUE,
          satisfaction_sent_at = NOW()
      WHERE id = ?
    `;

    try {
      await database.query(query, [serviceId]);
    } catch (error) {
      logger.error('Erro ao marcar pesquisa como enviada:', error);
    }
  }

  /**
   * Registra log de pesquisa de satisfação
   */
  async logSatisfaction(
    customerId: number,
    serviceId: number,
    message: string,
    status: 'success' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const query = `
      INSERT INTO reactivation_logs
        (customer_id, reactivation_type, message_sent, sent_at, status, error_message)
      VALUES (?, 'satisfaction', ?, NOW(), ?, ?)
    `;

    const messageData = JSON.stringify({
      serviceId,
      message,
    });

    try {
      await database.query(query, [customerId, messageData, status, errorMessage || null]);
    } catch (error) {
      logger.error('Erro ao registrar log de pesquisa de satisfação:', error);
    }
  }

  /**
   * Processa envio de pesquisas de satisfação
   */
  async processSatisfactionSurveys(): Promise<void> {
    logger.info('Iniciando processamento de pesquisas de satisfação');

    try {
      const services = await this.getCompletedServicesForSurvey();

      if (services.length === 0) {
        logger.info('Nenhum serviço para enviar pesquisa de satisfação');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

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

          // Validar telefone
          if (!service.customer_phone || !whatsappService.isValidPhoneNumber(service.customer_phone)) {
            logger.warn(`Telefone inválido para cliente: ${service.customer_name}`);
            await this.logSatisfaction(
              customerId,
              service.id,
              '',
              'error',
              'Telefone inválido'
            );
            errorCount++;
            continue;
          }

          // Determinar formulário apropriado
          const formData = this.getSatisfactionForm(service);

          // Gerar mensagem
          const message = this.generateSatisfactionMessage(service, formData);

          // Enviar mensagem
          const sent = await whatsappService.sendMessage(service.customer_phone, message);

          if (sent) {
            await this.markSatisfactionSent(service.id);
            await this.logSatisfaction(customerId, service.id, message, 'success');
            successCount++;
            logger.info(
              `Pesquisa de satisfação enviada com sucesso para ${service.customer_name} - Pet: ${service.pet_name}`
            );
          } else {
            await this.logSatisfaction(
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
          logger.error(`Erro ao processar pesquisa de satisfação ${service.id}:`, error);
          errorCount++;
        }
      }

      logger.info(
        `Pesquisas de satisfação concluídas: ${successCount} sucessos, ${errorCount} erros`
      );
    } catch (error) {
      logger.error('Erro ao processar pesquisas de satisfação:', error);
    }
  }
}

export const satisfactionSurvey = new SatisfactionSurvey();
