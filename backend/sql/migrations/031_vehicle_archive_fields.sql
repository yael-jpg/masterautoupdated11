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
UPDATE vehicles
SET plate_number = UPPER(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g'))
WHERE plate_number IS NOT NULL;

-- Ensure uniqueness after normalization: this will fail if duplicates are created by normalization and must be handled manually.
