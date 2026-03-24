-- Migration 019: Add Closed/Archived status support to job_orders
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds:
--   1. closed_at   — timestamp for when a job order is archived
-- This supports the new terminal workflow step:
--   Pending → In Progress → For QA → Completed → Released → Closed
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Done. Run with:
--   node src/utils/runSql.js sql/migrations/019_job_orders_closed_at.sql
