-- Migration 013: Add quotation_id FK to appointments
-- Fixes: FK violation when scheduling is linked to a quotation (not a legacy sale)
-- The existing sale_id column is kept for backward compat with old records.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS quotation_id INT REFERENCES quotations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_quotation_id ON appointments(quotation_id);
