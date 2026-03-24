-- Migration 051: Customer Portal Authentication & Appointment Notes
-- Adds portal_password_hash to customers so they can self-register and log in
-- Also adds notes column to appointments for booking notes

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_password_hash TEXT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS notes TEXT;
