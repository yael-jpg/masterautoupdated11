-- Migration 033: Add status column to payments table
-- Allows payments to transition to 'History' when associated quotations/appointments are deleted

BEGIN;

-- Add status column to payments table with default 'Active'
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'Active';

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

COMMIT;
