-- Migration: Add appointments.service_type compatibility column
-- Date: 2026-03-31
-- Purpose: Some older queries referenced appointments.service_type. The canonical link is service_id.
--          This adds a nullable service_type column to prevent runtime errors and backfills from services.name.

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS service_type VARCHAR(160);

-- Best-effort backfill from linked service
UPDATE appointments a
SET service_type = COALESCE(a.service_type, s.name)
FROM services s
WHERE a.service_id = s.id
  AND (a.service_type IS NULL OR a.service_type = '');
