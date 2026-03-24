-- Migration: 026_vehicle_makes_seed.sql
-- Create vehicle_makes table if missing and seed common Philippine brands

CREATE TABLE IF NOT EXISTS vehicle_makes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  category VARCHAR(60),
  logo_path TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add columns to vehicles table if not present
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS make_id INT REFERENCES vehicle_makes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS custom_make VARCHAR(120),
  ADD COLUMN IF NOT EXISTS normalized_plate VARCHAR(32);

-- Ensure uniqueness combination (either make_id OR custom_make should identify make per vehicle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'vehicles_make_custom_unique'
  ) THEN
    ALTER TABLE vehicles ADD CONSTRAINT vehicles_make_custom_unique UNIQUE (make_id, custom_make);
  END IF;
END$$;

-- Normalize existing plate numbers: uppercase, remove spaces/dashes
UPDATE vehicles SET normalized_plate = UPPER(REGEXP_REPLACE(plate_number, '[^A-Z0-9]', '', 'g')) WHERE plate_number IS NOT NULL;

-- Seed common Philippine brands (do not duplicate)
INSERT INTO vehicle_makes (name, category) VALUES
  ('Toyota', 'Japanese'),
  ('Honda', 'Japanese'),
  ('Mitsubishi', 'Japanese'),
  ('Nissan', 'Japanese'),
  ('Suzuki', 'Japanese'),
  ('Mazda', 'Japanese'),
  ('Subaru', 'Japanese'),
  ('Hyundai', 'Korean'),
  ('Kia', 'Korean'),
  ('Ford', 'American/European'),
  ('Chevrolet', 'American/European'),
  ('Volkswagen', 'American/European'),
  ('BMW', 'American/European'),
  ('Mercedes', 'American/European'),
  ('Audi', 'American/European'),
  ('Porsche', 'American/European'),
  ('Lexus', 'American/European'),
  ('MG', 'Chinese/Newer'),
  ('Geely', 'Chinese/Newer'),
  ('Chery', 'Chinese/Newer'),
  ('Foton', 'Chinese/Newer'),
  ('GAC', 'Chinese/Newer'),
  ('Other', 'Other')
ON CONFLICT (name) DO NOTHING;

