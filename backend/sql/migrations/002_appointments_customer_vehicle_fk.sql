-- Migration: Ensure appointments foreign keys exist
-- Date: 2026-02-18
-- Description: Adds missing customer_id and vehicle_id columns to appointments table

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS customer_id INT REFERENCES customers(id);

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS vehicle_id INT REFERENCES vehicles(id);

CREATE INDEX IF NOT EXISTS idx_appointments_customer_id
  ON appointments(customer_id);

CREATE INDEX IF NOT EXISTS idx_appointments_vehicle_id
  ON appointments(vehicle_id);
