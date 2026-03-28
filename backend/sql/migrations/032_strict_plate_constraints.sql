-- Migration 032: Enforce strict private vehicle plate format
-- Requirements: storage format ABC1234 (3 letters + 4 digits), uppercase, no symbols

-- This migration adds a CHECK constraint to validate stored plate_number for non-temporary vehicles.
-- It also adds a case-insensitive unique index on normalized plate_number to prevent duplicates.

-- NOTE: If your dataset contains plates that do not comply, this migration will not validate existing rows.
--       It uses NOT VALID for the CHECK constraint and only creates the unique index when it is safe.

-- Add check constraint that allows exceptions when conduction_sticker is present (temporary plate)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'vehicles' AND tc.constraint_type = 'CHECK' AND cc.check_clause LIKE '%^[A-Z]{3}%'
  ) THEN
    ALTER TABLE vehicles ADD CONSTRAINT vehicles_plate_format_chk CHECK (
      (plate_number ~ '^[A-Z]{3}[0-9]{4}$') OR (conduction_sticker IS NOT NULL)
    ) NOT VALID;
  END IF;
END$$;

-- Create unique index on normalized plate_number (upper) to ensure case-insensitive uniqueness
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'vehicles' AND indexname = 'uq_vehicles_plate_normalized') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT upper(regexp_replace(plate_number, '\\s+', '', 'g')) AS key
        FROM vehicles
        WHERE plate_number IS NOT NULL
        GROUP BY key
        HAVING COUNT(*) > 1
        LIMIT 1
      ) dup
    ) THEN
      CREATE UNIQUE INDEX uq_vehicles_plate_normalized ON vehicles (upper(regexp_replace(plate_number, '\\s+', '', 'g')));
    END IF;
  END IF;
END$$;
