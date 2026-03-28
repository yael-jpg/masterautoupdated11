-- Migration 031: Add vehicle status, ownership_status and archive metadata
-- Adds controlled deletion/archiving support for vehicles

-- Create enum types if they do not exist (Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_status') THEN
    CREATE TYPE vehicle_status AS ENUM ('Active','Inactive','Archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_ownership_status') THEN
    CREATE TYPE vehicle_ownership_status AS ENUM ('Active','Sold','Transferred');
  END IF;
END$$;

-- Add columns to vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS status vehicle_status DEFAULT 'Active';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ownership_status vehicle_ownership_status;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS archived_by INT REFERENCES users(id);

-- Index for fast lookups on status
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);

-- Note: archiving a vehicle should only set 'status' = 'Archived' and populate archived_at/archived_by

-- Normalize existing plate numbers into storage format (uppercase, strip non-alphanumeric)
--
-- IMPORTANT:
-- `vehicles.plate_number` is UNIQUE. Normalizing can accidentally collapse distinct
-- values (e.g. "ABC-123" and "ABC123") into the same normalized value.
-- To keep the migration chain from halting on a unique-violation, we only
-- normalize rows whose normalized value is unique across the table.
WITH normalized AS (
  SELECT
    id,
    plate_number,
    UPPER(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g')) AS normalized_plate
  FROM vehicles
  WHERE plate_number IS NOT NULL
),
conflicts AS (
  SELECT normalized_plate
  FROM normalized
  GROUP BY normalized_plate
  HAVING COUNT(*) > 1
)
UPDATE vehicles v
SET plate_number = n.normalized_plate
FROM normalized n
WHERE v.id = n.id
  AND n.normalized_plate NOT IN (SELECT normalized_plate FROM conflicts)
  AND v.plate_number IS DISTINCT FROM n.normalized_plate;
