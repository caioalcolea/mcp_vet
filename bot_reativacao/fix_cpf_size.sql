-- Migration: Fix CPF field size
-- Some CPFs come with extra formatting and exceed 14 characters

ALTER TABLE customers
  ALTER COLUMN cpf TYPE VARCHAR(20);

-- Show result
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'customers' AND column_name = 'cpf';
