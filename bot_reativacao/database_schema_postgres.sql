-- Schema PostgreSQL para Bot de Reativação Veterinária
-- Este arquivo contém as estruturas de tabelas necessárias para o funcionamento do bot
-- Banco: PostgreSQL 14+

-- Criar database (executar separadamente como superuser)
-- CREATE DATABASE bot_reativacao_vet ENCODING 'UTF8' LC_COLLATE='pt_BR.UTF-8' LC_CTYPE='pt_BR.UTF-8';

-- Conectar ao database
-- \c bot_reativacao_vet

-- Habilitar extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de clientes
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_phone ON customers(phone);

-- Tabela de pets
CREATE TABLE IF NOT EXISTS pets (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  breed VARCHAR(255),
  species VARCHAR(50),
  birth_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX idx_pets_customer_id ON pets(customer_id);

-- Tabela de vacinas
CREATE TABLE IF NOT EXISTS vaccines (
  id SERIAL PRIMARY KEY,
  pet_id INTEGER NOT NULL,
  vaccine_name VARCHAR(255) NOT NULL,
  application_date DATE NOT NULL,
  next_dose_date DATE,
  is_annual BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);

CREATE INDEX idx_vaccines_pet_id ON vaccines(pet_id);
CREATE INDEX idx_vaccines_next_dose_date ON vaccines(next_dose_date);
CREATE INDEX idx_vaccines_application_date ON vaccines(application_date);

-- Tabela de débitos financeiros
CREATE TABLE IF NOT EXISTS financial_debts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  service_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  description TEXT,
  paid BOOLEAN DEFAULT FALSE,
  last_charge_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX idx_financial_debts_customer_id ON financial_debts(customer_id);
CREATE INDEX idx_financial_debts_paid ON financial_debts(paid);
CREATE INDEX idx_financial_debts_service_date ON financial_debts(service_date);

-- Enum para tipo de serviço de banho
CREATE TYPE grooming_service_type AS ENUM ('banho', 'tosa', 'banho_tosa');
CREATE TYPE grooming_plan_type AS ENUM ('mensal', 'anual');

-- Tabela de serviços de banho/tosa
CREATE TABLE IF NOT EXISTS grooming_services (
  id SERIAL PRIMARY KEY,
  pet_id INTEGER NOT NULL,
  service_date DATE NOT NULL,
  service_type grooming_service_type NOT NULL,
  has_plan BOOLEAN DEFAULT FALSE,
  plan_type grooming_plan_type,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);

CREATE INDEX idx_grooming_services_pet_id ON grooming_services(pet_id);
CREATE INDEX idx_grooming_services_service_date ON grooming_services(service_date);
CREATE INDEX idx_grooming_services_has_plan ON grooming_services(has_plan);

-- Tabela de planos de banho
CREATE TABLE IF NOT EXISTS grooming_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  monthly_price NUMERIC(10, 2) NOT NULL,
  services_included TEXT,
  breed_specific BOOLEAN DEFAULT FALSE,
  breeds TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grooming_plans_breed_specific ON grooming_plans(breed_specific);
CREATE INDEX idx_grooming_plans_active ON grooming_plans(active);

-- Enum para tipo de consulta
CREATE TYPE appointment_type AS ENUM ('consulta', 'retorno', 'cirurgia', 'exame');
CREATE TYPE appointment_status AS ENUM ('agendado', 'confirmado', 'realizado', 'cancelado');

-- Tabela de agendamentos/consultas
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  pet_id INTEGER NOT NULL,
  appointment_date TIMESTAMP NOT NULL,
  appointment_type appointment_type NOT NULL,
  status appointment_status DEFAULT 'agendado',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);

CREATE INDEX idx_appointments_pet_id ON appointments(pet_id);
CREATE INDEX idx_appointments_appointment_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Tabela de serviços concluídos (para pesquisa de satisfação)
CREATE TABLE IF NOT EXISTS completed_services (
  id SERIAL PRIMARY KEY,
  pet_id INTEGER NOT NULL,
  service_date TIMESTAMP NOT NULL,
  service_type VARCHAR(100) NOT NULL,
  has_taxidog BOOLEAN DEFAULT FALSE,
  has_grooming BOOLEAN DEFAULT FALSE,
  has_tosa BOOLEAN DEFAULT FALSE,
  satisfaction_sent BOOLEAN DEFAULT FALSE,
  satisfaction_sent_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);

CREATE INDEX idx_completed_services_pet_id ON completed_services(pet_id);
CREATE INDEX idx_completed_services_service_date ON completed_services(service_date);
CREATE INDEX idx_completed_services_satisfaction_sent ON completed_services(satisfaction_sent);

-- Enum para tipo de reativação
CREATE TYPE reactivation_type AS ENUM ('vaccine', 'financial', 'grooming', 'appointment', 'satisfaction');
CREATE TYPE reactivation_status AS ENUM ('success', 'error');

-- Tabela de logs de reativação
CREATE TABLE IF NOT EXISTS reactivation_logs (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  reactivation_type reactivation_type NOT NULL,
  message_sent JSONB NOT NULL,
  sent_at TIMESTAMP NOT NULL,
  status reactivation_status NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX idx_reactivation_logs_customer_id ON reactivation_logs(customer_id);
CREATE INDEX idx_reactivation_logs_reactivation_type ON reactivation_logs(reactivation_type);
CREATE INDEX idx_reactivation_logs_sent_at ON reactivation_logs(sent_at);
CREATE INDEX idx_reactivation_logs_status ON reactivation_logs(status);

-- Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger de updated_at em todas as tabelas
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pets_updated_at BEFORE UPDATE ON pets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vaccines_updated_at BEFORE UPDATE ON vaccines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_financial_debts_updated_at BEFORE UPDATE ON financial_debts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grooming_services_updated_at BEFORE UPDATE ON grooming_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grooming_plans_updated_at BEFORE UPDATE ON grooming_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_completed_services_updated_at BEFORE UPDATE ON completed_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Dados de exemplo para planos de banho
INSERT INTO grooming_plans (name, description, monthly_price, services_included, breed_specific, breeds, active)
VALUES
  ('Plano Básico', 'Banho mensal com produtos de qualidade', 89.90, 'Banho, secagem, perfume', FALSE, NULL, TRUE),
  ('Plano Completo', 'Banho e tosa mensal', 149.90, 'Banho, tosa higiênica, secagem, perfume, corte de unhas', FALSE, NULL, TRUE),
  ('Plano Premium', 'Banho, tosa e hidratação', 199.90, 'Banho, tosa completa, hidratação, secagem, perfume, corte de unhas, limpeza de ouvidos', FALSE, NULL, TRUE)
ON CONFLICT DO NOTHING;

-- Criar view para facilitar consultas
CREATE OR REPLACE VIEW vw_customer_summary AS
SELECT
  c.id,
  c.name,
  c.phone,
  c.email,
  COUNT(DISTINCT p.id) as total_pets,
  COUNT(DISTINCT v.id) as total_vaccines,
  COUNT(DISTINCT a.id) as total_appointments,
  COALESCE(SUM(CASE WHEN fd.paid = FALSE THEN fd.amount ELSE 0 END), 0) as total_debt
FROM customers c
LEFT JOIN pets p ON p.customer_id = c.id
LEFT JOIN vaccines v ON v.pet_id = p.id
LEFT JOIN appointments a ON a.pet_id = p.id
LEFT JOIN financial_debts fd ON fd.customer_id = c.id
GROUP BY c.id, c.name, c.phone, c.email;

-- Comentários nas tabelas
COMMENT ON TABLE customers IS 'Clientes da clínica veterinária';
COMMENT ON TABLE pets IS 'Pets cadastrados';
COMMENT ON TABLE vaccines IS 'Histórico de vacinação';
COMMENT ON TABLE financial_debts IS 'Débitos financeiros em aberto';
COMMENT ON TABLE grooming_services IS 'Histórico de serviços de banho e tosa';
COMMENT ON TABLE grooming_plans IS 'Planos disponíveis de banho/tosa';
COMMENT ON TABLE appointments IS 'Agendamentos de consultas';
COMMENT ON TABLE completed_services IS 'Serviços concluídos para pesquisa de satisfação';
COMMENT ON TABLE reactivation_logs IS 'Log de todas as reativações enviadas';
