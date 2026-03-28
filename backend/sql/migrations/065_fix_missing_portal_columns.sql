-- Migration 065: Safety fix for production DBs missing columns expected by the app
-- Ensures customer bay and appointment down payment columns exist.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS bay VARCHAR(100);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS down_payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS down_payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS down_payment_ref    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS down_payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';
