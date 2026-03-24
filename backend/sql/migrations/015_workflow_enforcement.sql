-- ============================================================
-- Migration 015: Controlled Status Workflow Enforcement
-- ============================================================
-- Adds per-entity workflow timestamps, per-transition audit trail,
-- and guards required by the controlled workflow specification:
--
--   Scheduling:  Scheduled → Checked-In → In Progress → For QA
--                         → Ready for Release → Paid → Released → Completed
--   Job Orders:  Pending → In Progress → For QA → Completed → Released
--   Payments:    Automatic (Unpaid / Partially Paid / Paid / Overpaid)
-- ============================================================

BEGIN;

-- ── 1. Job Orders — workflow timestamp columns ────────────────────────────────
ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS in_progress_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS for_qa_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS released_at     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancel_reason   TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by    INT  REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS completed_by    INT  REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS released_by     INT  REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS previous_status VARCHAR(40);

-- ── 2. Job Orders — migrate legacy 'Ongoing' → 'In Progress' ─────────────────
--    'Ongoing' was used historically; the canonical status is 'In Progress'.
UPDATE job_orders SET status = 'In Progress' WHERE status = 'Ongoing';
UPDATE job_orders SET status = 'Pending'     WHERE status NOT IN
  ('Pending','In Progress','For QA','Completed','Released','Cancelled');

-- ── 3. Status Transitions — granular per-entity audit table ──────────────────
--    Captures every status change with user, timestamp, and optional override info.
--    This is the primary audit trail for the workflow system (complements audit_logs).

CREATE TABLE IF NOT EXISTS status_transitions (
  id              SERIAL PRIMARY KEY,
  entity_type     VARCHAR(30)  NOT NULL,   -- 'appointment' | 'job_order'
  entity_id       INT          NOT NULL,
  from_status     VARCHAR(40),             -- NULL when first created
  to_status       VARCHAR(40)  NOT NULL,
  changed_by      INT          REFERENCES users(id) ON DELETE SET NULL,
  changed_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  is_override     BOOLEAN      NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_st_entity      ON status_transitions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_st_changed_by  ON status_transitions(changed_by);
CREATE INDEX IF NOT EXISTS idx_st_changed_at  ON status_transitions(changed_at DESC);

-- ── 4. Payment Status Enumeration constraint ──────────────────────────────────
--    The quotation_payment_summary view already computes payment status
--    automatically. This comment documents the expected values for clarity.
--    No manual override of payment_status is allowed by design.
--
--    Computed values:
--      'UNPAID'          — no payments recorded
--      'PARTIALLY_PAID'  — total_paid < total_amount
--      'PAID'            — total_paid = total_amount
--      'OVERPAID'        — total_paid > total_amount  (triggers resolution)
--      'WITH BALANCE'    — conditional release applied (balance still outstanding)

-- ── 5. Backfill: seed initial status_transitions for existing job orders ──────
--    Creates a single synthetic "Created" entry per existing job order
--    so the history table is not empty for legacy records.
INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, changed_at, notes)
SELECT 'job_order', id, NULL, COALESCE(NULLIF(status,''), 'Pending'), created_at,
       'Backfill: existing record at migration time'
FROM   job_orders
ON CONFLICT DO NOTHING;

-- ── 6. Backfill: seed initial status_transitions for existing appointments ────
INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, changed_at, notes)
SELECT 'appointment', id, NULL, COALESCE(NULLIF(status,''), 'Scheduled'), created_at,
       'Backfill: existing record at migration time'
FROM   appointments
ON CONFLICT DO NOTHING;

-- ── 7. Role-permission documentation view ────────────────────────────────────
--    Read-only reference view; useful for admin auditing.
CREATE OR REPLACE VIEW workflow_role_permissions AS
SELECT 'appointment'::TEXT AS entity_type,
       t.stage,
       t.allowed_roles
FROM (VALUES
  ('Checked-In',         ARRAY['Admin','Manager','Technician','QA','Cashier','Reception']),
  ('In Progress',        ARRAY['Admin','Manager','Technician','QA','Cashier','Reception']),
  ('For QA',             ARRAY['Admin','Manager','Technician','QA']),
  ('Ready for Release',  ARRAY['Admin','Manager','QA']),
  ('Paid',               ARRAY['Admin','Manager','Cashier']),
  ('Released',           ARRAY['Admin','Manager']),
  ('Completed',          ARRAY['Admin','Manager']),
  ('Cancelled',          ARRAY['Admin','Manager'])
) AS t(stage, allowed_roles)

UNION ALL

SELECT 'job_order'::TEXT,
       t.stage,
       t.allowed_roles
FROM (VALUES
  ('In Progress', ARRAY['Admin','Manager','Technician','QA','Cashier','Reception']),
  ('For QA',      ARRAY['Admin','Manager','Technician','QA']),
  ('Completed',   ARRAY['Admin','Manager','QA']),
  ('Released',    ARRAY['Admin','Manager']),
  ('Cancelled',   ARRAY['Admin','Manager'])
) AS t(stage, allowed_roles);

COMMIT;
