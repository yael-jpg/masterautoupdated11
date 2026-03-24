-- Migration 055: add down_payment_status to appointments
-- Tracks whether a portal down payment has been physically collected.
-- Values: 'pending' (default) | 'collected'

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS down_payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';
