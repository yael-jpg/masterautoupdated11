-- Migration: Add completion status to service records  
-- Date: 2026-02-18
-- Description: Track completion status of service records - mark as done when photos uploaded or manually completed

-- Add status column to vehicle_service_records
ALTER TABLE vehicle_service_records
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- Add completion timestamp
ALTER TABLE vehicle_service_records  
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Add completed_by user reference
ALTER TABLE vehicle_service_records
ADD COLUMN IF NOT EXISTS completed_by INT REFERENCES users(id);

-- Create index for status filtering
CREATE INDEX IF NOT EXISTS idx_vehicle_service_records_status 
  ON vehicle_service_records(status);

-- Add check constraint for valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = 'chk_service_record_status'
      AND n.nspname = 'public'
      AND t.relname = 'vehicle_service_records'
  ) THEN
    ALTER TABLE vehicle_service_records
    ADD CONSTRAINT chk_service_record_status
      CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled'));
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN vehicle_service_records.status IS 'Service record completion status: pending, in-progress, completed, cancelled';
COMMENT ON COLUMN vehicle_service_records.completed_at IS 'Timestamp when service was marked as completed';
COMMENT ON COLUMN vehicle_service_records.completed_by IS 'User who marked the service as completed';

-- Update existing records to 'completed' if they have after photos
UPDATE vehicle_service_records vsr
SET status = 'completed',
    completed_at = (
      SELECT MIN(vp.created_at)
      FROM vehicle_photos vp
      WHERE vp.vehicle_id = vsr.vehicle_id
        AND vp.photo_type = 'after'
        AND vp.created_at >= vsr.service_date
      LIMIT 1
    )
WHERE EXISTS (
  SELECT 1
  FROM vehicle_photos vp
  WHERE vp.vehicle_id = vsr.vehicle_id
    AND vp.photo_type = 'after'
    AND vp.created_at >= vsr.service_date
);

