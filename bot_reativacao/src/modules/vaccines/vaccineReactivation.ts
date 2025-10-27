import { database } from '../../config/database';
import { whatsappService } from '../../services/whatsappService';
import { logger } from '../../utils/logger';
import { dateHelpers } from '../../utils/dateHelpers';
import { Vaccine, ReactivationLog } from '../../types';

export class VaccineReactivation {
  /**
   * Busca vacinas que precisam de reativação
   */
  async getVaccinesForReactivation(): Promise<Vaccine[]> {
    const query = `
      SELECT
        v.id,
        v.pet_id,
        v.vaccine_name,
        v.application_date,
        v.next_dose_date,
        v.is_annual,
        p.name as pet_name,
        c.name as customer_name,
        c.phone as customer_phone
      FROM vaccines v
      INNER JOIN pets p ON v.pet_id = p.id
      INNER JOIN customers c ON p.customer_id = c.id
      WHERE c.phone IS NOT NULL
        AND c.phone != ''
      ORDER BY v.application_date DESC
    `;

    try {
      const vaccines = await database.query<Vaccine>(query);

      // Filtrar vacinas que precisam de reativação
      const vaccinesToReactivate = vaccines.filter((vaccine) => {
        const { shouldReactivate } = dateHelpers.shouldReactivateVaccine(
          vaccine.next_dose_date || null,
          new Date(vaccine.application_date),
          vaccine.is_annual
        );
        return shouldReactivate;
      });

      logger.info(`Encontradas ${vaccinesToReactivate.length} vacinas para reativação`);
      return vaccinesToReactivate;
    } catch (error) {
      logger.error('Erro ao buscar vacinas para reativação:', error);
      return [];
    }
  }

  /**
   * Verifica se já foi enviada reativação para esta vacina hoje
   */
  async wasReactivationSentToday(customerId: number, vaccineId: number): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM reactivation_logs
      WHERE customer_id = $1
        AND reactivation_type = 'vaccine'
        AND (message_sent->>'vaccineId')::INTEGER = $2
        AND DATE(sent_at) = CURRENT_DATE
    `;

    try {
      const result = await database.query<{ count: number }>(query, [customerId, vaccineId]);
      return result[0].count > 0;
    } catch (error) {
      logger.error('Erro ao verificar reativação enviada:', error);
      return false;
    }
  }

  /**
   * Gera mensagem de reativação de vacina
   */
  generateReactivationMessage(vaccine: Vaccine): string {
    const { daysToReactivate, reactivationType } = dateHelpers.shouldReactivateVaccine(
      vaccine.next_dose_date || null,
      new Date(vaccine.application_date),
      vaccine.is_annual
    );

    let message = `Olá! 🐾\n\n`;
    message += `Tudo bem? Aqui é da *Clínica Veterinária*!\n\n`;
    message += `Estamos entrando em contato para lembrar sobre a vacinação do(a) *${vaccine.pet_name}*.\n\n`;

    if (reactivationType === 'next_dose') {
      const nextDoseDate = dateHelpers.formatDate(new Date(vaccine.next_dose_date!));
      message += `📅 A próxima dose da vacina *${vaccine.vaccine_name}* está agendada para *${nextDoseDate}* (em ${daysToReactivate} dias).\n\n`;
      message += `É muito importante manter a carteirinha de vacinação em dia para garantir a saúde e proteção do seu pet! 💉\n\n`;
    } else if (reactivationType === 'alternative') {
      const nextDoseDate = dateHelpers.formatDate(new Date(vaccine.next_dose_date!));
      message += `⚠️ *ATENÇÃO:* A próxima dose da vacina *${vaccine.vaccine_name}* está próxima: *${nextDoseDate}* (em apenas ${daysToReactivate} dias).\n\n`;
      message += `Não perca o prazo! É essencial manter a imunização em dia. 💉\n\n`;
    } else if (reactivationType === 'annual') {
      const applicationDate = new Date(vaccine.application_date);
      const nextAnnualDate = dateHelpers.addYears(applicationDate, 1);
      const formattedDate = dateHelpers.formatDate(nextAnnualDate);

      message += `📅 Está chegando a hora do reforço anual da vacina *${vaccine.vaccine_name}*!\n\n`;
      message += `A última dose foi em ${dateHelpers.formatDate(applicationDate)} e o próximo reforço deve ser feito por volta de *${formattedDate}* (em ${daysToReactivate} dias).\n\n`;
      message += `Vacinas anuais como essa são fundamentais para manter a saúde do seu pet em dia! 🐶🐱\n\n`;
    }

    message += `Gostaria de agendar? Estamos à disposição para marcar um horário! 📞\n\n`;
    message += `Responda esta mensagem ou ligue para nós! 😊`;

    return message;
  }

  /**
   * Registra log de reativação enviada
   */
  async logReactivation(
    customerId: number,
    vaccineId: number,
    message: string,
    status: 'success' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const query = `
      INSERT INTO reactivation_logs
        (customer_id, reactivation_type, message_sent, sent_at, status, error_message)
      VALUES ($1, 'vaccine', $2, NOW(), $3, $4)
    `;

    const messageData = JSON.stringify({
      vaccineId,
      message,
    });

    try {
      await database.query(query, [customerId, messageData, status, errorMessage || null]);
    } catch (error) {
      logger.error('Erro ao registrar log de reativação:', error);
    }
  }

  /**
   * Processa reativação de vacinas
   */
  async processVaccineReactivations(): Promise<void> {
    logger.info('Iniciando processamento de reativação de vacinas');

    try {
      const vaccines = await this.getVaccinesForReactivation();

      if (vaccines.length === 0) {
        logger.info('Nenhuma vacina para reativar hoje');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const vaccine of vaccines) {
        try {
          // Buscar customer_id do pet
          const petQuery = `SELECT customer_id FROM pets WHERE id = $1`;
          const petResult = await database.query<{ customer_id: number }>(petQuery, [vaccine.pet_id]);

          if (petResult.length === 0) {
            logger.warn(`Pet não encontrado: ${vaccine.pet_id}`);
            continue;
          }

          const customerId = petResult[0].customer_id;

          // Verificar se já foi enviado hoje
          const alreadySent = await this.wasReactivationSentToday(customerId, vaccine.id);
          if (alreadySent) {
            logger.info(`Reativação já enviada hoje para vacina ${vaccine.id}`);
            continue;
          }

          // Validar telefone
          if (!vaccine.customer_phone || !whatsappService.isValidPhoneNumber(vaccine.customer_phone)) {
            logger.warn(`Telefone inválido para cliente: ${vaccine.customer_name}`);
            await this.logReactivation(
              customerId,
              vaccine.id,
              '',
              'error',
              'Telefone inválido'
            );
            errorCount++;
            continue;
          }

          // Gerar e enviar mensagem
          const message = this.generateReactivationMessage(vaccine);
          const sent = await whatsappService.sendMessage(vaccine.customer_phone, message);

          if (sent) {
            await this.logReactivation(customerId, vaccine.id, message, 'success');
            successCount++;
            logger.info(`Reativação enviada com sucesso para ${vaccine.customer_name} - Pet: ${vaccine.pet_name}`);
          } else {
            await this.logReactivation(
              customerId,
              vaccine.id,
              message,
              'error',
              'Falha ao enviar mensagem'
            );
            errorCount++;
          }

          // Aguardar 2 segundos entre cada envio para não sobrecarregar a API
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          logger.error(`Erro ao processar reativação de vacina ${vaccine.id}:`, error);
          errorCount++;
        }
      }

      logger.info(`Reativação de vacinas concluída: ${successCount} sucessos, ${errorCount} erros`);
    } catch (error) {
      logger.error('Erro ao processar reativações de vacinas:', error);
    }
  }
}

export const vaccineReactivation = new VaccineReactivation();
