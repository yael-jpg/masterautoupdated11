-- Migration 017: Quotation Draft/Sent flow + Job Order schedule linkage
-- ─────────────────────────────────────────────────────────────────────────────
-- Changes:
--   1. quotations: add sent_at timestamp column
--   2. quotations: change status default from 'Pending' to 'Draft'
--   3. job_orders: add schedule_id FK → appointments(id)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add sent_at to quotations
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- 2. Change quotations status default to 'Draft'
ALTER TABLE quotations
  ALTER COLUMN status SET DEFAULT 'Draft';

-- Backfill: Pending quotations that have NO job order can stay as-is (legacy),
-- but treat them as functionally equivalent to 'Draft' in the app layer.
-- No data migration needed — Pending is still accepted by the route.

-- 3. Add schedule_id FK to job_orders (nullable, SET NULL on appointment delete)
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS schedule_id INT
    REFERENCES appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_orders_schedule_id ON job_orders(schedule_id);

-- Done. Run with: node src/utils/runSql.js sql/migrations/017_quotation_draft_sent_schedule_id.sql
