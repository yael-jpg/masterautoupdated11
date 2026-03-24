-- Migration 054: Allow job_orders.quotation_id to be NULL
-- This supports portal/walk-in bookings that have no linked quotation
ALTER TABLE job_orders
  ALTER COLUMN quotation_id DROP NOT NULL;
