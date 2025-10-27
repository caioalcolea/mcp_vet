import { database } from '../../config/database';
import { whatsappService } from '../../services/whatsappService';
import { logger } from '../../utils/logger';
import { dateHelpers } from '../../utils/dateHelpers';
import { config } from '../../config';
import { FinancialDebt } from '../../types';

export class FinancialReactivation {
  /**
   * Busca débitos em atraso
   */
  async getOverdueDebts(): Promise<FinancialDebt[]> {
    const query = `
      SELECT
        fd.id,
        fd.customer_id,
        fd.service_date,
        fd.amount,
        fd.description,
        fd.last_charge_date,
        c.name as customer_name,
        c.phone as customer_phone
      FROM financial_debts fd
      INNER JOIN customers c ON fd.customer_id = c.id
      WHERE fd.paid = FALSE
        AND fd.service_date < CURDATE()
        AND c.phone IS NOT NULL
        AND c.phone != ''
      ORDER BY fd.service_date ASC
    `;

    try {
      const debts = await database.query<FinancialDebt>(query);
      logger.info(`Encontrados ${debts.length} débitos em atraso`);
      return debts;
    } catch (error) {
      logger.error('Erro ao buscar débitos em atraso:', error);
      return [];
    }
  }

  /**
   * Verifica se pode enviar cobrança para este débito
   */
  canSendCharge(debt: FinancialDebt): boolean {
    return dateHelpers.canSendFinancialCharge(
      new Date(debt.service_date),
      debt.last_charge_date ? new Date(debt.last_charge_date) : null,
      config.reactivation.financial.chargeIntervalDays
    );
  }

  /**
   * Gera mensagem de reativação financeira sutil
   */
  generateSubtleMessage(debt: FinancialDebt): string {
    const serviceDate = dateHelpers.formatDate(new Date(debt.service_date));
    const amount = debt.amount.toFixed(2).replace('.', ',');

    let message = `Olá, *${debt.customer_name}*! 😊\n\n`;
    message += `Tudo bem? Aqui é da *Clínica Veterinária*!\n\n`;
    message += `Estamos entrando em contato para lembrar sobre o serviço realizado em *${serviceDate}*:\n\n`;
    message += `📋 *${debt.description}*\n`;
    message += `💰 Valor: R$ *${amount}*\n\n`;
    message += `Caso já tenha realizado o pagamento, por favor, desconsidere esta mensagem! 🙏\n\n`;
    message += `Se precisar de mais informações ou quiser regularizar, estamos à disposição! 😊\n\n`;
    message += `Pode responder esta mensagem ou ligar para nós! 📞`;

    return message;
  }

  /**
   * Gera mensagem de cobrança formal
   */
  generateChargeMessage(debt: FinancialDebt): string {
    const serviceDate = dateHelpers.formatDate(new Date(debt.service_date));
    const amount = debt.amount.toFixed(2).replace('.', ',');
    const daysOverdue = dateHelpers.differenceInDays(new Date(), new Date(debt.service_date));

    let message = `Olá, *${debt.customer_name}*! 😊\n\n`;
    message += `Aqui é da *Clínica Veterinária*.\n\n`;
    message += `Identificamos um débito em aberto referente ao serviço realizado em *${serviceDate}* (há ${daysOverdue} dias):\n\n`;
    message += `📋 *Descrição:* ${debt.description}\n`;
    message += `💰 *Valor:* R$ *${amount}*\n\n`;
    message += `⚠️ Para manter seus serviços em dia e evitar restrições futuras, pedimos a gentileza de regularizar este pagamento.\n\n`;
    message += `Aceitamos:\n`;
    message += `• 💳 Cartão de crédito/débito\n`;
    message += `• 💵 Dinheiro\n`;
    message += `• 📱 PIX\n`;
    message += `• 🏦 Transferência bancária\n\n`;
    message += `Caso já tenha efetuado o pagamento, por favor nos envie o comprovante! 🧾\n\n`;
    message += `Estamos à disposição para ajudar! 📞`;

    return message;
  }

  /**
   * Atualiza data da última cobrança
   */
  async updateLastChargeDate(debtId: number): Promise<void> {
    const query = `
      UPDATE financial_debts
      SET last_charge_date = NOW()
      WHERE id = ?
    `;

    try {
      await database.query(query, [debtId]);
    } catch (error) {
      logger.error('Erro ao atualizar data da última cobrança:', error);
    }
  }

  /**
   * Registra log de reativação financeira
   */
  async logReactivation(
    customerId: number,
    debtId: number,
    message: string,
    status: 'success' | 'error',
    errorMessage?: string
  ): Promise<void> {
    const query = `
      INSERT INTO reactivation_logs
        (customer_id, reactivation_type, message_sent, sent_at, status, error_message)
      VALUES (?, 'financial', ?, NOW(), ?, ?)
    `;

    const messageData = JSON.stringify({
      debtId,
      message,
    });

    try {
      await database.query(query, [customerId, messageData, status, errorMessage || null]);
    } catch (error) {
      logger.error('Erro ao registrar log de reativação financeira:', error);
    }
  }

  /**
   * Processa reativações financeiras
   */
  async processFinancialReactivations(): Promise<void> {
    logger.info('Iniciando processamento de reativação financeira');

    try {
      const debts = await this.getOverdueDebts();

      if (debts.length === 0) {
        logger.info('Nenhum débito em atraso para reativar');
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      for (const debt of debts) {
        try {
          // Verificar se pode enviar cobrança (respeitando intervalo de 30 dias)
          if (!this.canSendCharge(debt)) {
            logger.info(`Cobrança já enviada recentemente para débito ${debt.id}`);
            skippedCount++;
            continue;
          }

          // Validar telefone
          if (!debt.customer_phone || !whatsappService.isValidPhoneNumber(debt.customer_phone)) {
            logger.warn(`Telefone inválido para cliente: ${debt.customer_name}`);
            await this.logReactivation(
              debt.customer_id,
              debt.id,
              '',
              'error',
              'Telefone inválido'
            );
            errorCount++;
            continue;
          }

          // Determinar tipo de mensagem baseado no valor
          let message: string;
          if (debt.amount >= config.reactivation.financial.minAmountForCharge) {
            // Valor >= R$ 300: mensagem de cobrança formal
            message = this.generateChargeMessage(debt);
          } else {
            // Valor < R$ 300: mensagem sutil
            message = this.generateSubtleMessage(debt);
          }

          // Enviar mensagem
          const sent = await whatsappService.sendMessage(debt.customer_phone, message);

          if (sent) {
            await this.updateLastChargeDate(debt.id);
            await this.logReactivation(debt.customer_id, debt.id, message, 'success');
            successCount++;
            logger.info(`Reativação financeira enviada com sucesso para ${debt.customer_name} - Valor: R$ ${debt.amount}`);
          } else {
            await this.logReactivation(
              debt.customer_id,
              debt.id,
              message,
              'error',
              'Falha ao enviar mensagem'
            );
            errorCount++;
          }

          // Aguardar 2 segundos entre cada envio
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          logger.error(`Erro ao processar reativação financeira ${debt.id}:`, error);
          errorCount++;
        }
      }

      logger.info(
        `Reativação financeira concluída: ${successCount} sucessos, ${errorCount} erros, ${skippedCount} pulados`
      );
    } catch (error) {
      logger.error('Erro ao processar reativações financeiras:', error);
    }
  }
}

export const financialReactivation = new FinancialReactivation();
