import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '2080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'veterinaria',
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://api.talkhub.me',
    apiToken: process.env.WHATSAPP_API_TOKEN || '',
    instanceId: process.env.WHATSAPP_INSTANCE_ID || '',
  },
  forms: {
    banhoSemTaxidog: process.env.FORM_BANHO_SEM_TAXIDOG || 'https://form.talkhub.me/s/jlhjnwu8g1wumfddpdc0nilp',
    banhoComTaxidog: process.env.FORM_BANHO_COM_TAXIDOG || 'https://form.talkhub.me/s/sh6ead0tdtot8avbivitrygw',
    banhoTosaComTaxidog: process.env.FORM_BANHO_TOSA_COM_TAXIDOG || 'https://form.talkhub.me/s/lt4e0a8q7pkrdn0u9dhuy2jv',
    banhoTosaSemTaxidog: process.env.FORM_BANHO_TOSA_SEM_TAXIDOG || 'https://form.talkhub.me/s/cmgidazc6001hr740cj2c912l',
    googleReviewUrl: process.env.GOOGLE_REVIEW_URL || '',
  },
  reactivation: {
    vaccines: {
      daysBeforeNextDose: parseInt(process.env.VACCINE_REACTIVATION_DAYS_BEFORE || '21', 10),
      alternativeDays: parseInt(process.env.VACCINE_REACTIVATION_ALTERNATIVE_DAYS || '7', 10),
      annualDays: parseInt(process.env.VACCINE_ANNUAL_REACTIVATION_DAYS || '30', 10),
    },
    financial: {
      minAmountForCharge: parseFloat(process.env.FINANCIAL_MIN_AMOUNT_FOR_CHARGE || '300'),
      chargeIntervalDays: parseInt(process.env.FINANCIAL_CHARGE_INTERVAL_DAYS || '30', 10),
    },
    grooming: {
      weeklyReminderDay: parseInt(process.env.GROOMING_WEEKLY_REMINDER_DAY || '3', 10), // 3 = Quarta-feira
      monthlyReminderDays: parseInt(process.env.GROOMING_MONTHLY_REMINDER_DAYS || '30', 10),
    },
    appointments: {
      confirmationDaysBefore: parseInt(process.env.APPOINTMENT_CONFIRMATION_DAYS_BEFORE || '1', 10),
    },
  },
  cron: {
    vaccines: process.env.CRON_VACCINES || '0 9 * * *',        // 09:00 todos os dias
    financial: process.env.CRON_FINANCIAL || '0 10 * * *',     // 10:00 todos os dias
    grooming: process.env.CRON_GROOMING || '0 11 * * *',       // 11:00 todos os dias
    appointments: process.env.CRON_APPOINTMENTS || '0 8 * * *', // 08:00 todos os dias
    satisfaction: process.env.CRON_SATISFACTION || '0 * * * *', // A cada hora
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
