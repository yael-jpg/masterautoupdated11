-- Migration 008: Overpayment Detection & Resolution System
-- Tables:
--   customer_credits         – store-credit wallet per customer
--   overpayment_resolutions  – audit log for each resolution action
-- View update:
--   sale_financial_summary   – revised to subtract refunds from total_paid

BEGIN;

-- ─── Customer Credits (Store Wallet) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_credits (
  id              SERIAL PRIMARY KEY,
  customer_id     INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id         INT REFERENCES sales(id) ON DELETE SET NULL,       -- originating overpayment
  amount          NUMERIC(12,2) NOT NULL,                             -- credit granted
  amount_used     NUMERIC(12,2) NOT NULL DEFAULT 0,                  -- consumed on subsequent invoices
  notes           TEXT,
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── Credit Usage History ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_credit_usage (
  id                  SERIAL PRIMARY KEY,
  credit_id           INT NOT NULL REFERENCES customer_credits(id) ON DELETE CASCADE,
  applied_to_sale_id  INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount_applied      NUMERIC(12,2) NOT NULL,
  applied_by          INT REFERENCES users(id),
  applied_at          TIMESTAMP DEFAULT NOW()
);

-- ─── Overpayment Resolutions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS overpayment_resolutions (
  id                  SERIAL PRIMARY KEY,
  sale_id             INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  overpaid_amount     NUMERIC(12,2) NOT NULL,
  resolution_type     VARCHAR(30) NOT NULL                            -- 'REFUND' | 'CREDIT' | 'TRANSFER'
                        CHECK (resolution_type IN ('REFUND','CREDIT','TRANSFER')),
  refund_method       VARCHAR(40),                                    -- for REFUND: Cash / GCash / etc.
  target_sale_id      INT REFERENCES sales(id) ON DELETE SET NULL,   -- for TRANSFER
  credit_id           INT REFERENCES customer_credits(id),           -- for CREDIT
  resolved_by         INT REFERENCES users(id),
  notes               TEXT,
  resolved_at         TIMESTAMP DEFAULT NOW()
);

-- ─── Refund Records ──────────────────────────────────────────────────────────
-- A negative payment records the cash going back out of the drawer
CREATE TABLE IF NOT EXISTS refunds (
  id              SERIAL PRIMARY KEY,
  sale_id         INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  resolution_id   INT NOT NULL REFERENCES overpayment_resolutions(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  refund_method   VARCHAR(40) NOT NULL,
  reference_no    VARCHAR(100),
  issued_by       INT REFERENCES users(id),
  customer_name   VARCHAR(120),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customer_credits_customer ON customer_credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_overpayment_resolutions_sale ON overpayment_resolutions(sale_id);
CREATE INDEX IF NOT EXISTS idx_refunds_sale ON refunds(sale_id);

-- ─── Revised Financial Summary View ──────────────────────────────────────────
-- total_paid now subtracts refunds so the net balance is accurate.
-- Must DROP first because we're adding columns (customer_id, overpaid_amount,
-- overpayment_resolved) and PostgreSQL forbids column reordering via REPLACE.
DROP VIEW IF EXISTS sale_financial_summary;

CREATE VIEW sale_financial_summary AS
SELECT
  s.id                                                                AS sale_id,
  s.reference_no,
  s.total_amount,
  s.customer_id,
  (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0))::NUMERIC
                                                                      AS total_paid,
  (s.total_amount
    - (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0)))::NUMERIC
                                                                      AS outstanding_balance,
  GREATEST(
    (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0))
      - s.total_amount,
    0
  )::NUMERIC                                                          AS overpaid_amount,
  CASE
    WHEN (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0)) = 0
      THEN 'UNPAID'
    WHEN (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0))
         > s.total_amount
      THEN 'OVERPAID'
    WHEN (COALESCE(p_sum.total_paid, 0) - COALESCE(r_sum.total_refunded, 0))
         >= s.total_amount
      THEN 'SETTLED'
    ELSE 'WITH DEPOSIT'
  END                                                                 AS payment_status,
  -- Flag: has at least one unresolved overpayment resolution record? (FALSE = unresolved)
  EXISTS (
    SELECT 1 FROM overpayment_resolutions orr WHERE orr.sale_id = s.id
  )                                                                   AS overpayment_resolved
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
) r_sum ON r_sum.sale_id = s.id
GROUP BY s.id, s.reference_no, s.total_amount, s.customer_id,
         p_sum.total_paid, r_sum.total_refunded;

COMMIT;
