export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
}

export interface Pet {
  id: number;
  name: string;
  breed?: string;
  customer_id: number;
}

export interface Vaccine {
  id: number;
  pet_id: number;
  vaccine_name: string;
  application_date: Date;
  next_dose_date?: Date;
  is_annual: boolean;
  pet_name?: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface FinancialDebt {
  id: number;
  customer_id: number;
  service_date: Date;
  amount: number;
  description: string;
  customer_name?: string;
  customer_phone?: string;
  last_charge_date?: Date;
}

export interface GroomingService {
  id: number;
  pet_id: number;
  service_date: Date;
  service_type: 'banho' | 'tosa' | 'banho_tosa';
  has_plan: boolean;
  plan_type?: 'mensal' | 'anual';
  pet_name?: string;
  pet_breed?: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface Appointment {
  id: number;
  pet_id: number;
  appointment_date: Date;
  appointment_type: 'consulta' | 'retorno' | 'cirurgia' | 'exame';
  status: 'agendado' | 'confirmado' | 'realizado' | 'cancelado';
  pet_name?: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface CompletedService {
  id: number;
  pet_id: number;
  service_date: Date;
  service_type: string;
  has_taxidog: boolean;
  has_grooming: boolean;
  has_tosa: boolean;
  satisfaction_sent: boolean;
  pet_name?: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface ReactivationLog {
  id?: number;
  customer_id: number;
  reactivation_type: 'vaccine' | 'financial' | 'grooming' | 'appointment' | 'satisfaction';
  message_sent: string;
  sent_at: Date;
  status: 'success' | 'error';
  error_message?: string;
}

export interface WhatsAppMessage {
  phone: string;
  message: string;
  mediaUrl?: string;
}

export interface SatisfactionFormData {
  serviceType: 'banho_sem_taxidog' | 'banho_com_taxidog' | 'banho_tosa_com_taxidog' | 'banho_tosa_sem_taxidog';
  formUrl: string;
}
