-- Migration: 027_vehicle_models_variants.sql
-- Creates vehicle_models and vehicle_variants tables and seeds sample data

CREATE TABLE IF NOT EXISTS vehicle_models (
  id SERIAL PRIMARY KEY,
  make_id INT NOT NULL REFERENCES vehicle_makes(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (make_id, name)
);

CREATE TABLE IF NOT EXISTS vehicle_variants (
  id SERIAL PRIMARY KEY,
  model_id INT NOT NULL REFERENCES vehicle_models(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  image_path TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (model_id, name)
);

-- Add model_id and variant_id to vehicles table if not present
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS model_id INT REFERENCES vehicle_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_id INT REFERENCES vehicle_variants(id) ON DELETE SET NULL;

-- Seed sample models and variants for common Philippine brands
-- Toyota models
INSERT INTO vehicle_models (make_id, name)
SELECT id, 'Vios' FROM vehicle_makes WHERE name = 'Toyota' ON CONFLICT (make_id, name) DO NOTHING;
INSERT INTO vehicle_models (make_id, name)
SELECT id, 'Fortuner' FROM vehicle_makes WHERE name = 'Toyota' ON CONFLICT (make_id, name) DO NOTHING;
INSERT INTO vehicle_models (make_id, name)
SELECT id, 'Innova' FROM vehicle_makes WHERE name = 'Toyota' ON CONFLICT (make_id, name) DO NOTHING;

-- Honda models
INSERT INTO vehicle_models (make_id, name)
SELECT id, 'Civic' FROM vehicle_makes WHERE name = 'Honda' ON CONFLICT (make_id, name) DO NOTHING;
INSERT INTO vehicle_models (make_id, name)
SELECT id, 'City' FROM vehicle_makes WHERE name = 'Honda' ON CONFLICT (make_id, name) DO NOTHING;

-- Ford models
INSERT INTO vehicle_models (make_id, name)
SELECT id, 'Ranger' FROM vehicle_makes WHERE name = 'Ford' ON CONFLICT (make_id, name) DO NOTHING;
INSERT INTO vehicle_models (make_id, name)
SELECT id, 'Everest' FROM vehicle_makes WHERE name = 'Ford' ON CONFLICT (make_id, name) DO NOTHING;

-- Seed variants for models (use sub-select to find model ids)
-- Toyota Vios variants
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, 'XE CVT' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Vios' AND mk.name = 'Toyota' ON CONFLICT (model_id, name) DO NOTHING;
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, 'XLE CVT' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Vios' AND mk.name = 'Toyota' ON CONFLICT (model_id, name) DO NOTHING;

-- Toyota Fortuner variants
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, '2.4 MT' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Fortuner' AND mk.name = 'Toyota' ON CONFLICT (model_id, name) DO NOTHING;
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, '2.8 AT' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Fortuner' AND mk.name = 'Toyota' ON CONFLICT (model_id, name) DO NOTHING;

-- Honda Civic variants
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, '1.8 S MT' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Civic' AND mk.name = 'Honda' ON CONFLICT (model_id, name) DO NOTHING;
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, '1.5 RS Turbo' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Civic' AND mk.name = 'Honda' ON CONFLICT (model_id, name) DO NOTHING;

-- Ford Ranger variants
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, '2.2 XL' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Ranger' AND mk.name = 'Ford' ON CONFLICT (model_id, name) DO NOTHING;
INSERT INTO vehicle_variants (model_id, name)
SELECT m.id, '3.2 Wildtrak' FROM vehicle_models m JOIN vehicle_makes mk ON mk.id = m.make_id
WHERE m.name = 'Ranger' AND mk.name = 'Ford' ON CONFLICT (model_id, name) DO NOTHING;
