import cron from 'node-cron';
import { logger } from '../utils/logger';
import { config } from '../config';
import { vaccineReactivation } from '../modules/vaccines/vaccineReactivation';
import { financialReactivation } from '../modules/financial/financialReactivation';
import { groomingReactivation } from '../modules/grooming/groomingReactivation';
import { appointmentConfirmation } from '../modules/appointments/appointmentConfirmation';
import { satisfactionSurvey } from '../modules/satisfaction/satisfactionSurvey';
import { vetcareApiService } from './vetcareApiService';

export class Scheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Inicia todos os agendamentos
   */
  start(): void {
    logger.info('Iniciando scheduler de reativações');

    // Agendar sincronização do VetCare
    this.scheduleVetCareSync();

    // Agendar reativação de vacinas
    this.scheduleVaccineReactivation();

    // Agendar reativação financeira
    this.scheduleFinancialReactivation();

    // Agendar reativação de banhos
    this.scheduleGroomingReactivation();

    // Agendar confirmação de consultas
    this.scheduleAppointmentConfirmation();

    // Agendar pesquisa de satisfação
    this.scheduleSatisfactionSurvey();

    logger.info('Scheduler iniciado com sucesso');
  }

  /**
   * Agenda sincronização do VetCare
   */
  private scheduleVetCareSync(): void {
    const cronExpression = config.cron.vetcareSync;

    const job = cron.schedule(cronExpression, async () => {
      logger.info('Executando job de sincronização do VetCare');
      try {
        await vetcareApiService.syncAll();
      } catch (error) {
        logger.error('Erro ao executar job de sincronização do VetCare:', error);
      }
    });

    this.jobs.set('vetcare_sync', job);
    logger.info(`Job de sincronização do VetCare agendado: ${cronExpression}`);
  }

  /**
   * Agenda reativação de vacinas
   */
  private scheduleVaccineReactivation(): void {
    const cronExpression = config.cron.vaccines;

    const job = cron.schedule(cronExpression, async () => {
      logger.info('Executando job de reativação de vacinas');
      try {
        await vaccineReactivation.processVaccineReactivations();
      } catch (error) {
        logger.error('Erro ao executar job de reativação de vacinas:', error);
      }
    });

    this.jobs.set('vaccines', job);
    logger.info(`Job de reativação de vacinas agendado: ${cronExpression}`);
  }

  /**
   * Agenda reativação financeira
   */
  private scheduleFinancialReactivation(): void {
    const cronExpression = config.cron.financial;

    const job = cron.schedule(cronExpression, async () => {
      logger.info('Executando job de reativação financeira');
      try {
        await financialReactivation.processFinancialReactivations();
      } catch (error) {
        logger.error('Erro ao executar job de reativação financeira:', error);
      }
    });

    this.jobs.set('financial', job);
    logger.info(`Job de reativação financeira agendado: ${cronExpression}`);
  }

  /**
   * Agenda reativação de banhos
   */
  private scheduleGroomingReactivation(): void {
    const cronExpression = config.cron.grooming;

    const job = cron.schedule(cronExpression, async () => {
      logger.info('Executando job de reativação de banhos');
      try {
        await groomingReactivation.processGroomingReactivations();
      } catch (error) {
        logger.error('Erro ao executar job de reativação de banhos:', error);
      }
    });

    this.jobs.set('grooming', job);
    logger.info(`Job de reativação de banhos agendado: ${cronExpression}`);
  }

  /**
   * Agenda confirmação de consultas
   */
  private scheduleAppointmentConfirmation(): void {
    const cronExpression = config.cron.appointments;

    const job = cron.schedule(cronExpression, async () => {
      logger.info('Executando job de confirmação de consultas');
      try {
        await appointmentConfirmation.processAppointmentConfirmations();
      } catch (error) {
        logger.error('Erro ao executar job de confirmação de consultas:', error);
      }
    });

    this.jobs.set('appointments', job);
    logger.info(`Job de confirmação de consultas agendado: ${cronExpression}`);
  }

  /**
   * Agenda pesquisa de satisfação
   */
  private scheduleSatisfactionSurvey(): void {
    const cronExpression = config.cron.satisfaction;

    const job = cron.schedule(cronExpression, async () => {
      logger.info('Executando job de pesquisa de satisfação');
      try {
        await satisfactionSurvey.processSatisfactionSurveys();
      } catch (error) {
        logger.error('Erro ao executar job de pesquisa de satisfação:', error);
      }
    });

    this.jobs.set('satisfaction', job);
    logger.info(`Job de pesquisa de satisfação agendado: ${cronExpression}`);
  }

  /**
   * Para todos os agendamentos
   */
  stop(): void {
    logger.info('Parando scheduler de reativações');

    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info(`Job ${name} parado`);
    });

    this.jobs.clear();
    logger.info('Scheduler parado com sucesso');
  }

  /**
   * Executa manualmente um job específico
   */
  async runJobManually(jobName: string): Promise<void> {
    logger.info(`Executando job ${jobName} manualmente`);

    try {
      switch (jobName) {
        case 'vetcare_sync':
          await vetcareApiService.syncAll();
          break;
        case 'vaccines':
          await vaccineReactivation.processVaccineReactivations();
          break;
        case 'financial':
          await financialReactivation.processFinancialReactivations();
          break;
        case 'grooming':
          await groomingReactivation.processGroomingReactivations();
          break;
        case 'appointments':
          await appointmentConfirmation.processAppointmentConfirmations();
          break;
        case 'satisfaction':
          await satisfactionSurvey.processSatisfactionSurveys();
          break;
        default:
          throw new Error(`Job desconhecido: ${jobName}`);
      }

      logger.info(`Job ${jobName} executado com sucesso`);
    } catch (error) {
      logger.error(`Erro ao executar job ${jobName}:`, error);
      throw error;
    }
  }

  /**
   * Retorna status de todos os jobs
   */
  getJobsStatus(): Record<string, string> {
    const status: Record<string, string> = {};

    this.jobs.forEach((job, name) => {
      status[name] = 'running';
    });

    return status;
  }
}

export const scheduler = new Scheduler();
