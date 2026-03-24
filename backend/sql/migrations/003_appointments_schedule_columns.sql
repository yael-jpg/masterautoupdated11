-- Migration: Add scheduling fields to appointments
-- Date: 2026-02-18
-- Description: Ensures schedule and status columns exist for dashboard queries

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS schedule_start TIMESTAMP NOT NULL DEFAULT NOW();

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS schedule_end TIMESTAMP;

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS bay VARCHAR(40);

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS installer_team VARCHAR(60);

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS estimated_duration_minutes INT;

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Scheduled';

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS notification_channel VARCHAR(40);

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_appointments_schedule_start
  ON appointments(schedule_start);

CREATE INDEX IF NOT EXISTS idx_appointments_status
  ON appointments(status);
