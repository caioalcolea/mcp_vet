-- Migration: Add missing columns to customers and pets tables
-- Run this if you already created the database with the old schema

-- Add missing columns to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS cpf VARCHAR(14),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(2);

-- Add missing columns to pets table
ALTER TABLE pets
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10),
  ADD COLUMN IF NOT EXISTS weight NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS color VARCHAR(50),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add missing columns to vaccines table
ALTER TABLE vaccines
  ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS veterinarian VARCHAR(255);

-- Add missing columns to appointments table (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'appointments') THEN
        ALTER TABLE appointments
          ADD COLUMN IF NOT EXISTS veterinarian VARCHAR(255),
          ADD COLUMN IF NOT EXISTS notes TEXT,
          ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2);
    END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers(cpf);
CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);
CREATE INDEX IF NOT EXISTS idx_customers_state ON customers(state);

-- Show summary
SELECT
  'customers' as table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'customers'
ORDER BY ordinal_position;
