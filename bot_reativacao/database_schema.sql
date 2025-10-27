-- Schema SQL para Bot de Reativação Veterinária
-- Este arquivo contém as estruturas de tabelas necessárias para o funcionamento do bot

-- Tabela de clientes (se não existir)
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de pets (se não existir)
CREATE TABLE IF NOT EXISTS pets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  breed VARCHAR(255),
  species VARCHAR(50),
  birth_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_customer_id (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de vacinas
CREATE TABLE IF NOT EXISTS vaccines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pet_id INT NOT NULL,
  vaccine_name VARCHAR(255) NOT NULL,
  application_date DATE NOT NULL,
  next_dose_date DATE,
  is_annual BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  INDEX idx_pet_id (pet_id),
  INDEX idx_next_dose_date (next_dose_date),
  INDEX idx_application_date (application_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de débitos financeiros
CREATE TABLE IF NOT EXISTS financial_debts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  service_date DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  paid BOOLEAN DEFAULT FALSE,
  last_charge_date DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_customer_id (customer_id),
  INDEX idx_paid (paid),
  INDEX idx_service_date (service_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de serviços de banho/tosa
CREATE TABLE IF NOT EXISTS grooming_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pet_id INT NOT NULL,
  service_date DATE NOT NULL,
  service_type ENUM('banho', 'tosa', 'banho_tosa') NOT NULL,
  has_plan BOOLEAN DEFAULT FALSE,
  plan_type ENUM('mensal', 'anual'),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  INDEX idx_pet_id (pet_id),
  INDEX idx_service_date (service_date),
  INDEX idx_has_plan (has_plan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de planos de banho
CREATE TABLE IF NOT EXISTS grooming_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  monthly_price DECIMAL(10, 2) NOT NULL,
  services_included TEXT,
  breed_specific BOOLEAN DEFAULT FALSE,
  breeds TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_breed_specific (breed_specific),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de agendamentos/consultas
CREATE TABLE IF NOT EXISTS appointments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pet_id INT NOT NULL,
  appointment_date DATETIME NOT NULL,
  appointment_type ENUM('consulta', 'retorno', 'cirurgia', 'exame') NOT NULL,
  status ENUM('agendado', 'confirmado', 'realizado', 'cancelado') DEFAULT 'agendado',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  INDEX idx_pet_id (pet_id),
  INDEX idx_appointment_date (appointment_date),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de serviços concluídos (para pesquisa de satisfação)
CREATE TABLE IF NOT EXISTS completed_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pet_id INT NOT NULL,
  service_date DATETIME NOT NULL,
  service_type VARCHAR(100) NOT NULL,
  has_taxidog BOOLEAN DEFAULT FALSE,
  has_grooming BOOLEAN DEFAULT FALSE,
  has_tosa BOOLEAN DEFAULT FALSE,
  satisfaction_sent BOOLEAN DEFAULT FALSE,
  satisfaction_sent_at DATETIME,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  INDEX idx_pet_id (pet_id),
  INDEX idx_service_date (service_date),
  INDEX idx_satisfaction_sent (satisfaction_sent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de logs de reativação
CREATE TABLE IF NOT EXISTS reactivation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  reactivation_type ENUM('vaccine', 'financial', 'grooming', 'appointment', 'satisfaction') NOT NULL,
  message_sent TEXT NOT NULL,
  sent_at DATETIME NOT NULL,
  status ENUM('success', 'error') NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_customer_id (customer_id),
  INDEX idx_reactivation_type (reactivation_type),
  INDEX idx_sent_at (sent_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exemplos de dados para planos de banho
INSERT INTO grooming_plans (name, description, monthly_price, services_included, breed_specific, breeds, active)
VALUES
  ('Plano Básico', 'Banho mensal com produtos de qualidade', 89.90, 'Banho, secagem, perfume', FALSE, NULL, TRUE),
  ('Plano Completo', 'Banho e tosa mensal', 149.90, 'Banho, tosa higiênica, secagem, perfume, corte de unhas', FALSE, NULL, TRUE),
  ('Plano Premium', 'Banho, tosa e hidratação', 199.90, 'Banho, tosa completa, hidratação, secagem, perfume, corte de unhas, limpeza de ouvidos', FALSE, NULL, TRUE);
