-- Migration 007: Financial status engine
-- Creates a view that computes payment_status per sale
-- Rules:
--   total_paid = 0              → UNPAID
--   0 < total_paid < total      → WITH DEPOSIT
--   total_paid = total          → SETTLED
--   total_paid > total          → OVERPAID

BEGIN;

CREATE OR REPLACE VIEW sale_financial_summary AS
SELECT
  s.id                                                     AS sale_id,
  s.reference_no,
  s.total_amount,
  COALESCE(SUM(p.amount), 0)::NUMERIC                      AS total_paid,
  (s.total_amount - COALESCE(SUM(p.amount), 0))::NUMERIC   AS outstanding_balance,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) = 0
      THEN 'UNPAID'
    WHEN COALESCE(SUM(p.amount), 0) >= s.total_amount
      AND COALESCE(SUM(p.amount), 0) > s.total_amount
      THEN 'OVERPAID'
    WHEN COALESCE(SUM(p.amount), 0) >= s.total_amount
      THEN 'SETTLED'
    ELSE 'WITH DEPOSIT'
  END                                                      AS payment_status
FROM sales s
LEFT JOIN payments p ON p.sale_id = s.id
GROUP BY s.id, s.reference_no, s.total_amount;

COMMIT;
