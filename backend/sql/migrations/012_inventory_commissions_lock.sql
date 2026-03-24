-- ============================================================
-- Migration 012: Inventory, Commissions, Quotation Approval Lock
-- ============================================================

-- ── 1. Quotation approval lock ───────────────────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS is_locked        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at        TIMESTAMP,
  ADD COLUMN IF NOT EXISTS locked_by        INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lock_override_by INT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lock_override_at TIMESTAMP;

-- ── 2. Inventory items ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id              SERIAL PRIMARY KEY,
  sku             VARCHAR(60)  UNIQUE NOT NULL,
  name            VARCHAR(150) NOT NULL,
  category        VARCHAR(60),
  description     TEXT,
  unit            VARCHAR(20)  NOT NULL DEFAULT 'pcs',
  cost_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  sell_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty_on_hand     NUMERIC(12,3) NOT NULL DEFAULT 0,
  qty_minimum     NUMERIC(12,3) NOT NULL DEFAULT 0,
  supplier_ref    VARCHAR(120),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

DROP TRIGGER IF EXISTS inventory_items_updated_at ON inventory_items;
CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 3. Inventory movements ────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
  id              SERIAL PRIMARY KEY,
  item_id         INT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type   VARCHAR(20) NOT NULL CHECK (movement_type IN ('IN','OUT','ADJUST')),
  qty             NUMERIC(12,3) NOT NULL,
  qty_before      NUMERIC(12,3) NOT NULL,
  qty_after       NUMERIC(12,3) NOT NULL,
  job_order_id    INT REFERENCES job_orders(id) ON DELETE SET NULL,
  reference_note  TEXT,
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ── 4. Job order parts usage ─────────────────────────────────
CREATE TABLE IF NOT EXISTS job_order_parts (
  id              SERIAL PRIMARY KEY,
  job_order_id    INT NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  item_id         INT NOT NULL REFERENCES inventory_items(id),
  qty_used        NUMERIC(12,3) NOT NULL,
  cost_price_snap NUMERIC(12,2) NOT NULL,
  sell_price_snap NUMERIC(12,2) NOT NULL,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ── 5. Installer commission rates ────────────────────────────
CREATE TABLE IF NOT EXISTS installer_commission_rates (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_code    VARCHAR(60),           -- NULL = applies to all services
  rate_type       VARCHAR(10) NOT NULL CHECK (rate_type IN ('fixed','percent')),
  rate_value      NUMERIC(10,4) NOT NULL,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, service_code)
);

-- ── 6. Installer commissions earned ──────────────────────────
CREATE TABLE IF NOT EXISTS installer_commissions (
  id              SERIAL PRIMARY KEY,
  job_order_id    INT NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id),
  service_code    VARCHAR(60),
  service_name    VARCHAR(150),
  labor_value     NUMERIC(12,2) NOT NULL DEFAULT 0,
  rate_type       VARCHAR(10) NOT NULL,
  rate_value      NUMERIC(10,4) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','payable','paid')),
  paid_at         TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

DROP TRIGGER IF EXISTS installer_commissions_updated_at ON installer_commissions;
CREATE TRIGGER installer_commissions_updated_at
  BEFORE UPDATE ON installer_commissions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 7. Summary view: inventory stock status ──────────────────
CREATE OR REPLACE VIEW inventory_stock_status AS
SELECT
  i.*,
  COALESCE(
    (SELECT SUM(CASE WHEN m.movement_type = 'IN' THEN m.qty
                     WHEN m.movement_type IN ('OUT','ADJUST') THEN -m.qty
                END)
     FROM inventory_movements m WHERE m.item_id = i.id), 0
  )::NUMERIC AS calculated_qty,
  CASE
    WHEN i.qty_on_hand <= 0           THEN 'OUT_OF_STOCK'
    WHEN i.qty_on_hand <= i.qty_minimum THEN 'LOW_STOCK'
    ELSE                                   'IN_STOCK'
  END AS stock_status
FROM inventory_items i;

-- ── 8. Summary view: commission totals per installer ─────────
CREATE OR REPLACE VIEW installer_commission_summary AS
SELECT
  u.id   AS user_id,
  u.full_name,
  COUNT(ic.id)                                      AS commission_count,
  COALESCE(SUM(ic.commission_amount), 0)::NUMERIC   AS total_earned,
  COALESCE(SUM(CASE WHEN ic.status = 'payable' THEN ic.commission_amount END), 0)::NUMERIC AS payable_amount,
  COALESCE(SUM(CASE WHEN ic.status = 'paid'    THEN ic.commission_amount END), 0)::NUMERIC AS paid_amount,
  COALESCE(SUM(CASE WHEN ic.status = 'pending' THEN ic.commission_amount END), 0)::NUMERIC AS pending_amount
FROM users u
LEFT JOIN installer_commissions ic ON ic.user_id = u.id
GROUP BY u.id, u.full_name;
