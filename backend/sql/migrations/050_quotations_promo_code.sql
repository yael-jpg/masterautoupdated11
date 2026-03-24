-- Migration 050: Add promo_code and discount_amount columns to quotations table

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS promo_code      VARCHAR(50)       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2)    NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quotations_promo_code ON quotations (promo_code);

COMMENT ON COLUMN quotations.promo_code      IS 'Applied promo code (references promo_codes.code)';
COMMENT ON COLUMN quotations.discount_amount IS 'Discount applied from promo code (currency amount)';
