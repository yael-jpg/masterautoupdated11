-- Migration 029: Vehicle Makes and Models System (PostgreSQL)
--
-- NOTE:
-- This project uses PostgreSQL (Neon). A previous version of this migration
-- contained MySQL-only syntax (AUTO_INCREMENT, ENUM, FULLTEXT, ENGINE=InnoDB,
-- ON DUPLICATE KEY, etc.) which prevents the migration chain from running.
--
-- The canonical vehicle catalog tables are already created/seeded by earlier
-- migrations (e.g. 024_vehicle_makes_models.sql, 025_vehicle_variants.sql).
--
-- This file now acts as a compatibility migration that only adds optional
-- columns used by later features. All statements are idempotent.

ALTER TABLE vehicle_makes
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS year_from INT,
  ADD COLUMN IF NOT EXISTS year_to INT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE vehicle_variants
  ADD COLUMN IF NOT EXISTS body_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS transmission VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Ensure updated_at is maintained automatically
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vehicle_makes_updated_at ON vehicle_makes;
CREATE TRIGGER vehicle_makes_updated_at
  BEFORE UPDATE ON vehicle_makes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS vehicle_models_updated_at ON vehicle_models;
CREATE TRIGGER vehicle_models_updated_at
  BEFORE UPDATE ON vehicle_models
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS vehicle_variants_updated_at ON vehicle_variants;
CREATE TRIGGER vehicle_variants_updated_at
  BEFORE UPDATE ON vehicle_variants
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
