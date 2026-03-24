-- Migration 052: Add down payment columns to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS down_payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS down_payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS down_payment_ref    VARCHAR(200);
