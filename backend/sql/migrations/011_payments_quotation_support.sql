-- Migration 011: Connect payments to quotations (decouple from sales)
-- Changes:
--   1. Make sale_id nullable on payments
--   2. Add quotation_id FK to payments
--   3. Add CHECK: exactly one of sale_id / quotation_id must be non-null
--   4. Create quotation_payment_summary view

BEGIN;

-- 1. Drop existing NOT NULL constraint on sale_id
ALTER TABLE payments ALTER COLUMN sale_id DROP NOT NULL;

-- 2. Add quotation_id column
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS quotation_id INT REFERENCES quotations(id) ON DELETE CASCADE;

-- 3. Constraint: one of the two must be set (but not both)
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_chk_reference;

ALTER TABLE payments
  ADD CONSTRAINT payments_chk_reference
    CHECK (
      (sale_id IS NOT NULL AND quotation_id IS NULL)
      OR
      (sale_id IS NULL AND quotation_id IS NOT NULL)
    );

-- 4. Summary view for quotation payments
DROP VIEW IF EXISTS quotation_payment_summary;

CREATE VIEW quotation_payment_summary AS
SELECT
  q.id                                                                     AS quotation_id,
  q.quotation_no,
  q.total_amount,
  q.customer_id,

  GREATEST(COALESCE(p_sum.total_paid, 0), 0)::NUMERIC                     AS total_paid,

  GREATEST(q.total_amount - COALESCE(p_sum.total_paid, 0), 0)::NUMERIC    AS outstanding_balance,

  GREATEST(COALESCE(p_sum.total_paid, 0) - q.total_amount, 0)::NUMERIC    AS overpaid_amount,

  CASE
    WHEN COALESCE(p_sum.total_paid, 0) <= 0               THEN 'UNPAID'
    WHEN COALESCE(p_sum.total_paid, 0) > q.total_amount   THEN 'OVERPAID'
    WHEN COALESCE(p_sum.total_paid, 0) >= q.total_amount  THEN 'PAID'
    ELSE 'PARTIALLY_PAID'
  END                                                                      AS payment_status

FROM quotations q
LEFT JOIN (
  SELECT quotation_id, SUM(amount) AS total_paid
  FROM payments
  WHERE quotation_id IS NOT NULL
  GROUP BY quotation_id
) p_sum ON p_sum.quotation_id = q.id;

COMMIT;
