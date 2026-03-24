-- Migration 021: Add archive support and notes to appointments
-- Adds soft-delete columns and activity_logs table for admin archive tracking

-- Notes field for technician/admin remarks on a booking
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes TEXT;

-- Soft-delete columns (archive)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMP;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS archived_by  INT REFERENCES users(id);

-- Activity log table for auditing sensitive actions (archive, force-release, etc.)
CREATE TABLE IF NOT EXISTS activity_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     VARCHAR(80)  NOT NULL,
  entity     VARCHAR(80),
  entity_id  INT,
  notes      TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups by entity
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs (entity, entity_id);
