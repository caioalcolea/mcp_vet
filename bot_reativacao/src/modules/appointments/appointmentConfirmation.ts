import { database } from '../../config/database';
import { whatsappService } from '../../services/whatsappService';
import { logger } from '../../utils/logger';
import { dateHelpers } from '../../utils/dateHelpers';
import { Appointment } from '../../types';

export class AppointmentConfirmation {
  /**
   * Busca consultas que precisam de confirmação
   */
  async getAppointmentsForConfirmation(): Promise<Appointment[]> {
    const query = `
      SELECT
        a.id,
        a.pet_id,
        a.appointment_date,
        a.appointment_type,
        a.status,
        p.name as pet_name,
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone
      FROM appointments a
      INNER JOIN pets p ON a.pet_id = p.id
      INNER JOIN customers c ON p.customer_id = c.id
      WHERE a.status = 'agendado'
        AND DATE(a.appointment_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND c.phone IS NOT NULL
        AND c.phone != ''
      ORDER BY a.appointment_date ASC
    `;

    try {
      const appointments = await database.query<Appointment>(query);
      logger.info(`Encontradas ${appointments.length} consultas para confirmar`);
      return appointments;
    } catch (error) {
      logger.error('Erro ao buscar consultas para confirmação:', error);
      return [];
    }
  }

  /**
   * Verifica se o cliente tem consultas futuras (retorno ou não especificado)
   */
  async hasFutureAppointments(customerId: number, currentAppointmentId: number): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM appointments a
      INNER JOIN pets p ON a.pet_id = p.id
      WHERE p.customer_id = ?
        AND a.id != ?
        AND a.appointment_date > NOW()
        AND a.status IN ('agendado', 'confirmado')
        AND (a.appointment_type = 'retorno' OR a.appointment_type = 'consulta')
    `;

    try {
      const result = await database.query<{ count: number }>(query, [customerId, currentAppointmentId]);
      return result[0].count > 0;
    } catch (error) {
      logger.error('Erro ao verificar consultas futuras:', error);
      return false;
    }
  }

  /**
   * Verifica se já foi enviada confirmação para esta consulta hoje
   */
  async wasConfirmationSentToday(customerId: number, appointmentId: number): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM reactivation_logs
      WHERE customer_id = ?
        AND reactivation_type = 'appointment'
        AND JSON_EXTRACT(message_sent, '$.appointmentId') = ?
        AND DATE(sent_at) = CURDATE()
    `;

    try {
      const result = await database.query<{ count: number }>(query, [customerId, appointmentId]);
      return result[0].count > 0;
    } catch (error) {
      logger.error('Erro ao verificar confirmação enviada:', error);
      return false;
    }
  }

  /**
   * Gera mensagem de confirmação de consulta
   */
  generateConfirmationMessage(appointment: Appointment): string {
    const appointmentDate = new Date(appointment.appointment_date);
    const formattedDate = dateHelpers.formatDate(appointmentDate);
    const formattedTime = dateHelpers.formatDateTime(appointmentDate).split(' às ')[1];

    // Traduzir tipo de consulta
    const typeTranslations: Record<string, string> = {
      consulta: 'Consulta',
      retorno: 'Retorno',
      cirurgia: 'Cirurgia',
      exame: 'Exame',
    };

    const appointmentTypeText = typeTranslations[appointment.appointment_type] || 'Consulta';

    let message = `Olá! 🐾\n\n`;
    message += `Aqui é da *Clínica Veterinária*!\n\n`;
    message += `Estamos entrando em contato para *confirmar* a ${appointmentTypeText.toLowerCase()} do(a) *${appointment.pet_name}*:\n\n`;
    message += `📅 *Data:* ${formattedDate}\n`;
    message += `⏰ *Horário:* ${formattedTime}\n`;
    message += `🏥 *Tipo:* ${appointmentTypeText}\n\n`;
    message += `Por favor, confirme a presença respondendo:\n`;
    message += `✅ *SIM* - para confirmar\n`;
    message += `❌ *NÃO* - caso precise remarcar\n\n`;
    message += `Se precisar de mais informações ou quiser remarcar, estamos à disposição! 😊\n\n`;
    message += `Aguardamos sua confirmação! 📞`;

    return message;
  }

  /**
   * Atualiza status da consulta para confirmado
   */
  async updateAppointmentStatus(appointmentId: number, status: 'confirmado' | 'agendado'): Promise<void> {
    const query = `
      UPDATE appointments
      SET status = ?
      WHERE id = ?
    `;

    try {
      await database.query(query, [status, appointmentId]);
    } catch (error) {
      logger.error('Erro ao atualizar status da consulta:', error);
    }
  }

  /**
   * Registra log de confirmação
   */
  async logConfirmation(
    customerId: number,
    appointmentId: number,
    message: string,
    status: 'success' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const query = `
      INSERT INTO reactivation_logs
        (customer_id, reactivation_type, message_sent, sent_at, status, error_message)
      VALUES (?, 'appointment', ?, NOW(), ?, ?)
    `;

    const messageData = JSON.stringify({
      appointmentId,
      message,
    });

    try {
      await database.query(query, [customerId, messageData, status, errorMessage || null]);
    } catch (error) {
      logger.error('Erro ao registrar log de confirmação:', error);
    }
  }

  /**
   * Processa confirmações de consultas
   */
  async processAppointmentConfirmations(): Promise<void> {
    logger.info('Iniciando processamento de confirmação de consultas');

    try {
      const appointments = await this.getAppointmentsForConfirmation();

      if (appointments.length === 0) {
        logger.info('Nenhuma consulta para confirmar hoje');
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const appointment of appointments) {
        try {
          // Buscar customer_id
          const petQuery = `SELECT customer_id FROM pets WHERE id = ?`;
          const petResult = await database.query<{ customer_id: number }>(petQuery, [appointment.pet_id]);

          if (petResult.length === 0) {
            logger.warn(`Pet não encontrado: ${appointment.pet_id}`);
            continue;
          }

          const customerId = petResult[0].customer_id;

          // Verificar se cliente tem consultas futuras (não enviar se já tem retorno agendado)
          if (appointment.appointment_type === 'retorno') {
            logger.info(`Consulta ${appointment.id} é um retorno - pulando confirmação`);
            skippedCount++;
            continue;
          }

          const hasFuture = await this.hasFutureAppointments(customerId, appointment.id);
          if (hasFuture) {
            logger.info(`Cliente já tem consulta futura agendada - pulando confirmação para ${appointment.id}`);
            skippedCount++;
            continue;
          }

          // Verificar se já foi enviado hoje
          const alreadySent = await this.wasConfirmationSentToday(customerId, appointment.id);
          if (alreadySent) {
            logger.info(`Confirmação já enviada hoje para consulta ${appointment.id}`);
            skippedCount++;
            continue;
          }

          // Validar telefone
          if (!appointment.customer_phone || !whatsappService.isValidPhoneNumber(appointment.customer_phone)) {
            logger.warn(`Telefone inválido para cliente: ${appointment.customer_name}`);
            await this.logConfirmation(
              customerId,
              appointment.id,
              '',
              'error',
              'Telefone inválido'
            );
            errorCount++;
            continue;
          }

          // Gerar e enviar mensagem
          const message = this.generateConfirmationMessage(appointment);
          const sent = await whatsappService.sendMessage(appointment.customer_phone, message);

          if (sent) {
            await this.logConfirmation(customerId, appointment.id, message, 'success');
            successCount++;
            logger.info(
              `Confirmação enviada com sucesso para ${appointment.customer_name} - Pet: ${appointment.pet_name}`
            );
          } else {
            await this.logConfirmation(
              customerId,
              appointment.id,
              message,
              'error',
              'Falha ao enviar mensagem'
            );
            errorCount++;
          }

          // Aguardar 2 segundos entre cada envio
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          logger.error(`Erro ao processar confirmação de consulta ${appointment.id}:`, error);
          errorCount++;
        }
      }

      logger.info(
        `Confirmação de consultas concluída: ${successCount} sucessos, ${errorCount} erros, ${skippedCount} pulados`
      );
    } catch (error) {
      logger.error('Erro ao processar confirmações de consultas:', error);
    }
  }
}

export const appointmentConfirmation = new AppointmentConfirmation();
