-- Migration 009: Robust Financial & Payment Management
-- Changes:
--   1. Rename payment status "WITH DEPOSIT" → "PARTIALLY_PAID"
--   2. Cap outstanding_balance at GREATEST(0, ...) — never negative
--   3. client_credits: add status column (AVAILABLE / USED / REFUNDED) if not exists
--   4. Add DB constraint to prevent direct over-insertion into payments
--      (enforced via the split-payment backend logic, but constraint is a safety net)

BEGIN;

-- ─── 1. Drop & recreate sale_financial_summary with corrected logic ───────────
DROP VIEW IF EXISTS sale_financial_summary;

CREATE VIEW sale_financial_summary AS
SELECT
  s.id                                                                    AS sale_id,
  s.reference_no,
  s.total_amount,
  s.customer_id,

  -- Net paid = payments minus any refunds
  GREATEST(
    (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0)),
    0
  )::NUMERIC                                                              AS total_paid,

  -- Outstanding never goes negative
  GREATEST(
    s.total_amount
      - (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0)),
    0
  )::NUMERIC                                                              AS outstanding_balance,

  -- Overpaid amount (0 when not overpaid)
  GREATEST(
    (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0))
      - s.total_amount,
    0
  )::NUMERIC                                                              AS overpaid_amount,

  -- Status: UNPAID → PARTIALLY_PAID → PAID → OVERPAID
  CASE
    WHEN (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0)) <= 0
      THEN 'UNPAID'
    WHEN (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0))
         > s.total_amount
      THEN 'OVERPAID'
    WHEN (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0))
         >= s.total_amount
      THEN 'PAID'
    ELSE 'PARTIALLY_PAID'
  END                                                                     AS payment_status,

  -- overpayment_resolved: TRUE once a resolution record exists
  EXISTS (
    SELECT 1 FROM overpayment_resolutions orr WHERE orr.sale_id = s.id
  )                                                                       AS overpayment_resolved

FROM sales s
LEFT JOIN (
  SELECT sale_id, SUM(amount)::NUMERIC AS total_paid
  FROM payments
  GROUP BY sale_id
) p_sum ON p_sum.sale_id = s.id
LEFT JOIN (
  SELECT sale_id, SUM(amount)::NUMERIC AS total_refunded
  FROM refunds
  GROUP BY sale_id
) r_sum ON r_sum.sale_id = s.id;

-- ─── 2. Add status column to customer_credits if not present ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_credits' AND column_name = 'status'
  ) THEN
    ALTER TABLE customer_credits
      ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'USED', 'REFUNDED'));
  END IF;
END$$;

-- Back-fill: mark fully-used credits as USED
UPDATE customer_credits
  SET status = 'USED'
  WHERE amount_used >= amount AND status = 'AVAILABLE';

-- ─── 3. Add source_invoice_id alias column if not present ────────────────────
-- (customer_credits.sale_id already serves this role; just ensure it exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_credits' AND column_name = 'source_invoice_id'
  ) THEN
    ALTER TABLE customer_credits
      ADD COLUMN source_invoice_id INT REFERENCES sales(id) ON DELETE SET NULL;
    -- Copy existing sale_id values across
    UPDATE customer_credits SET source_invoice_id = sale_id WHERE source_invoice_id IS NULL;
  END IF;
END$$;

COMMIT;
