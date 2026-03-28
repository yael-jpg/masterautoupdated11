-- Migration 030: Vehicle Registration Relational Structure (PostgreSQL)
--
-- NOTE:
-- This project runs on PostgreSQL (Neon). A previous version of this file was
-- written for MySQL (AFTER, AUTO_INCREMENT, DELIMITER, SIGNAL, stored
-- procedures/triggers) which prevents the migration chain from running.
--
-- This migration is rewritten to be PostgreSQL-safe and idempotent.

-- 1) Add relational columns to vehicles (keep legacy text columns intact)
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS make_id INT,
  ADD COLUMN IF NOT EXISTS model_id INT,
  ADD COLUMN IF NOT EXISTS variant_id INT,
  ADD COLUMN IF NOT EXISTS custom_make VARCHAR(100),
  ADD COLUMN IF NOT EXISTS custom_model VARCHAR(100);

-- 2) Best-effort data backfill from legacy text columns
UPDATE vehicles v
SET make_id = vm.id
FROM vehicle_makes vm
WHERE v.make_id IS NULL
  AND v.make IS NOT NULL
  AND LOWER(TRIM(v.make)) = LOWER(TRIM(vm.name));

UPDATE vehicles v
SET model_id = vmodel.id
FROM vehicle_models vmodel
WHERE v.model_id IS NULL
  AND v.make_id = vmodel.make_id
  AND v.model IS NOT NULL
  AND LOWER(TRIM(v.model)) = LOWER(TRIM(vmodel.name));

UPDATE vehicles v
SET variant_id = vvt.id
FROM vehicle_variants vvt
WHERE v.variant_id IS NULL
  AND v.model_id = vvt.model_id
  AND v.variant IS NOT NULL
  AND LOWER(TRIM(v.variant)) = LOWER(TRIM(vvt.name));

UPDATE vehicles
SET custom_make = make
WHERE make_id IS NULL
  AND custom_make IS NULL
  AND make IS NOT NULL
  AND TRIM(make) <> '';

UPDATE vehicles
SET custom_model = model
WHERE model_id IS NULL
  AND custom_model IS NULL
  AND model IS NOT NULL
  AND TRIM(model) <> '';

-- 3) Add foreign keys (NOT VALID so existing data won't block the chain)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vehicle_make') THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT fk_vehicle_make
      FOREIGN KEY (make_id) REFERENCES vehicle_makes(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vehicle_model') THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT fk_vehicle_model
      FOREIGN KEY (model_id) REFERENCES vehicle_models(id) ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_vehicle_variant') THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT fk_vehicle_variant
      FOREIGN KEY (variant_id) REFERENCES vehicle_variants(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- 4) Performance indexes (avoid adding new uniqueness constraints here)
CREATE INDEX IF NOT EXISTS idx_vehicles_make_id ON vehicles(make_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_model_id ON vehicles(model_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_variant_id ON vehicles(variant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id ON vehicles(customer_id);

-- 5) View for detailed vehicle information
CREATE OR REPLACE VIEW v_vehicles_detailed AS
SELECT
  v.id AS vehicle_id,
  v.customer_id,
  v.make_id,
  COALESCE(vm.name, v.custom_make) AS make_name,
  vm.category AS make_category,
  v.model_id,
  COALESCE(vmod.name, v.custom_model) AS model_name,
  v.variant_id,
  vvt.name AS variant_name,
  vvt.body_type,
  vvt.fuel_type,
  vvt.transmission,
  v.plate_number,
  v.year,
  v.color,
  v.odometer,
  v.created_at
FROM vehicles v
LEFT JOIN vehicle_makes vm ON v.make_id = vm.id
LEFT JOIN vehicle_models vmod ON v.model_id = vmod.id
LEFT JOIN vehicle_variants vvt ON v.variant_id = vvt.id;
