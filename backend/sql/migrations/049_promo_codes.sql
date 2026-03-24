-- Migration 049: Create promo_codes table
-- Promo codes can be attached to email campaigns and applied to quotations for discounts.

CREATE TABLE IF NOT EXISTS promo_codes (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(50) UNIQUE NOT NULL,
  description    TEXT,
  campaign_id    INT REFERENCES email_campaigns(id) ON DELETE SET NULL,
  discount_type  VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  expires_at     TIMESTAMPTZ,
  max_uses       INT DEFAULT NULL CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     INT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_campaign_id ON promo_codes (campaign_id);

COMMENT ON TABLE promo_codes IS 'Promo codes distributed via email campaigns, redeemable on quotations';
