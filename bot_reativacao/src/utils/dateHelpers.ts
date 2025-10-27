import { addDays, subDays, differenceInDays, format, isAfter, isBefore, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const dateHelpers = {
  /**
   * Adiciona dias a uma data
   */
  addDays(date: Date, days: number): Date {
    return addDays(date, days);
  },

  /**
   * Subtrai dias de uma data
   */
  subDays(date: Date, days: number): Date {
    return subDays(date, days);
  },

  /**
   * Adiciona anos a uma data
   */
  addYears(date: Date, years: number): Date {
    return addYears(date, years);
  },

  /**
   * Calcula a diferença em dias entre duas datas
   */
  differenceInDays(dateLeft: Date, dateRight: Date): number {
    return differenceInDays(dateLeft, dateRight);
  },

  /**
   * Verifica se uma data é depois de outra
   */
  isAfter(date: Date, dateToCompare: Date): boolean {
    return isAfter(date, dateToCompare);
  },

  /**
   * Verifica se uma data é antes de outra
   */
  isBefore(date: Date, dateToCompare: Date): boolean {
    return isBefore(date, dateToCompare);
  },

  /**
   * Formata uma data para exibição
   */
  formatDate(date: Date, formatStr: string = 'dd/MM/yyyy'): string {
    return format(date, formatStr, { locale: ptBR });
  },

  /**
   * Formata data e hora para exibição
   */
  formatDateTime(date: Date): string {
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  },

  /**
   * Obtém data atual sem horas
   */
  getToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  },

  /**
   * Verifica se a data está dentro do intervalo para reativação de vacina
   */
  shouldReactivateVaccine(nextDoseDate: Date | null, applicationDate: Date, isAnnual: boolean): {
    shouldReactivate: boolean;
    daysToReactivate: number;
    reactivationType: 'next_dose' | 'annual' | 'alternative' | null;
  } {
    const today = this.getToday();

    if (nextDoseDate) {
      const daysUntilNextDose = this.differenceInDays(nextDoseDate, today);

      // Caso 1: Reativar 21 dias antes da próxima dose
      if (daysUntilNextDose === 21) {
        return { shouldReactivate: true, daysToReactivate: 21, reactivationType: 'next_dose' };
      }

      // Caso 2: Se próxima dose está entre 14-21 dias, reativar 7 dias antes
      if (daysUntilNextDose >= 14 && daysUntilNextDose <= 21 && daysUntilNextDose === 7) {
        return { shouldReactivate: true, daysToReactivate: 7, reactivationType: 'alternative' };
      }
    } else if (isAnnual) {
      // Caso 3: Vacina anual - reativar 30 dias antes de 1 ano da aplicação
      const oneYearAfterApplication = this.addYears(applicationDate, 1);
      const daysUntilAnnualDose = this.differenceInDays(oneYearAfterApplication, today);

      if (daysUntilAnnualDose === 30) {
        return { shouldReactivate: true, daysToReactivate: 30, reactivationType: 'annual' };
      }
    }

    return { shouldReactivate: false, daysToReactivate: 0, reactivationType: null };
  },

  /**
   * Verifica se deve enviar lembrete de banho
   */
  shouldSendGroomingReminder(lastServiceDate: Date, hasPlan: boolean, planType?: 'mensal' | 'anual'): boolean {
    const today = this.getToday();
    const daysSinceLastService = this.differenceInDays(today, lastServiceDate);

    if (hasPlan && planType === 'mensal') {
      // Lembrete semanal para planos mensais
      return daysSinceLastService % 7 === 0 && daysSinceLastService > 0;
    } else {
      // Lembrete mensal (30 dias) para banhos únicos
      return daysSinceLastService === 30;
    }
  },

  /**
   * Verifica se deve enviar confirmação de consulta
   */
  shouldSendAppointmentConfirmation(appointmentDate: Date): boolean {
    const today = this.getToday();
    const daysUntilAppointment = this.differenceInDays(appointmentDate, today);
    return daysUntilAppointment === 1;
  },

  /**
   * Verifica se pode enviar cobrança financeira
   */
  canSendFinancialCharge(serviceDate: Date, lastChargeDate: Date | null, intervalDays: number): boolean {
    const today = this.getToday();

    if (!lastChargeDate) {
      // Nunca enviou cobrança - verificar se já passou da data do serviço
      return this.isAfter(today, serviceDate);
    }

    // Já enviou cobrança - verificar intervalo mínimo
    const daysSinceLastCharge = this.differenceInDays(today, lastChargeDate);
    return daysSinceLastCharge >= intervalDays;
  },
};
