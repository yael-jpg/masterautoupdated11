-- Migration 006: Full workflow status flow
-- Adds status timestamps, sale link, warranty/follow-up, and invoice lock

BEGIN;

-- 1. Extend appointments with workflow timestamps + sale link + warranty
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS sale_id              INT REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_at        TIMESTAMP,
  ADD COLUMN IF NOT EXISTS in_progress_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS for_qa_at            TIMESTAMP,
  ADD COLUMN IF NOT EXISTS ready_at             TIMESTAMP,
  ADD COLUMN IF NOT EXISTS paid_at              TIMESTAMP,
  ADD COLUMN IF NOT EXISTS released_at          TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancelled_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS released_by          INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS checked_in_by        INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS warranty_expires_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS follow_up_date       DATE,
  ADD COLUMN IF NOT EXISTS cancel_reason        TEXT;

-- 2. Add is_locked and locked_at to sales (locked once payment is complete)
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS is_locked   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at   TIMESTAMP;

-- 3. Ensure estimated_duration_minutes exists (may already exist)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS estimated_duration_minutes INT;

COMMIT;
