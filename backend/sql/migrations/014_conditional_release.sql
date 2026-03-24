-- Migration 014: Conditional Release Logging
-- Records every release approved despite unpaid/partial balance

CREATE TABLE IF NOT EXISTS conditional_releases (
  id                   SERIAL PRIMARY KEY,
  entity_type          VARCHAR(20)   NOT NULL,   -- 'appointment' or 'job_order'
  entity_id            INT           NOT NULL,
  quotation_id         INT           REFERENCES quotations(id) ON DELETE SET NULL,
  customer_id          INT           NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  approved_by          INT           NOT NULL REFERENCES users(id),
  approved_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
  reason               TEXT          NOT NULL,
  total_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paid           NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding_balance  NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cond_rel_customer   ON conditional_releases(customer_id);
CREATE INDEX IF NOT EXISTS idx_cond_rel_quotation  ON conditional_releases(quotation_id);
CREATE INDEX IF NOT EXISTS idx_cond_rel_entity     ON conditional_releases(entity_type, entity_id);
