-- PMS Packages Management schema
-- Adds fields required by Settings > PMS Packages without breaking existing data.

CREATE TABLE IF NOT EXISTS pms_packages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  kilometer_interval INT NOT NULL,
  description TEXT,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_price DECIMAL(10,2),
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pms_packages
  ADD COLUMN IF NOT EXISTS kilometer_interval INT,
  ADD COLUMN IF NOT EXISTS mileage_interval INT,
  ADD COLUMN IF NOT EXISTS odometer_interval INT,
  ADD COLUMN IF NOT EXISTS interval_unit VARCHAR(20),
  ADD COLUMN IF NOT EXISTS interval_value INT,
  ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS estimated_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill kilometer interval from older column names when possible.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pms_packages' AND column_name = 'mileage_interval'
  ) THEN
    EXECUTE 'UPDATE pms_packages SET kilometer_interval = mileage_interval WHERE kilometer_interval IS NULL AND mileage_interval IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pms_packages' AND column_name = 'odometer_interval'
  ) THEN
    EXECUTE 'UPDATE pms_packages SET kilometer_interval = odometer_interval WHERE kilometer_interval IS NULL AND odometer_interval IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pms_packages' AND column_name = 'interval_value'
  ) THEN
    EXECUTE 'UPDATE pms_packages SET kilometer_interval = interval_value WHERE kilometer_interval IS NULL AND interval_value IS NOT NULL';
  END IF;
END $$;

-- Keep old and new interval columns in sync when one side exists.
UPDATE pms_packages
SET mileage_interval = kilometer_interval
WHERE mileage_interval IS NULL AND kilometer_interval IS NOT NULL;

UPDATE pms_packages
SET odometer_interval = kilometer_interval
WHERE odometer_interval IS NULL AND kilometer_interval IS NOT NULL;

UPDATE pms_packages
SET interval_value = kilometer_interval
WHERE interval_value IS NULL AND kilometer_interval IS NOT NULL;

UPDATE pms_packages
SET price = estimated_price
WHERE price IS NULL AND estimated_price IS NOT NULL;

UPDATE pms_packages
SET estimated_price = price
WHERE estimated_price IS NULL AND price IS NOT NULL;

-- Ensure all rows have a usable interval.
UPDATE pms_packages
SET kilometer_interval = 5000
WHERE kilometer_interval IS NULL;

ALTER TABLE pms_packages
  ALTER COLUMN kilometer_interval SET NOT NULL;

-- Keep names aligned for records that don't have one.
UPDATE pms_packages
SET name = CONCAT(TO_CHAR(kilometer_interval, 'FM999,999,999'), ' KM PMS')
WHERE COALESCE(TRIM(name), '') = '';

CREATE UNIQUE INDEX IF NOT EXISTS pms_packages_km_unique_active
  ON pms_packages (kilometer_interval)
  WHERE COALESCE(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS pms_packages_status_idx
  ON pms_packages (status)
  WHERE COALESCE(is_deleted, false) = false;
