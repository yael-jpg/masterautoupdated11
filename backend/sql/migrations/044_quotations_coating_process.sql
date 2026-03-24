-- Migration 044: Add vehicle_size and coating_process to quotations

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS vehicle_size    VARCHAR(30)  DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS coating_process VARCHAR(50);
