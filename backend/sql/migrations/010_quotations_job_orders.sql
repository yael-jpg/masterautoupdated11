-- Migration 010: Quotations & Job Orders

CREATE TABLE IF NOT EXISTS quotations (
  id              SERIAL PRIMARY KEY,
  quotation_no    VARCHAR(30) UNIQUE NOT NULL,
  customer_id     INT NOT NULL REFERENCES customers(id),
  vehicle_id      INT NOT NULL REFERENCES vehicles(id),
  services        JSONB NOT NULL DEFAULT '[]',
  notes           TEXT,
  total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          VARCHAR(30) NOT NULL DEFAULT 'Pending',
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_orders (
  id                  SERIAL PRIMARY KEY,
  job_order_no        VARCHAR(30) UNIQUE NOT NULL,
  quotation_id        INT NOT NULL REFERENCES quotations(id),
  customer_id         INT NOT NULL REFERENCES customers(id),
  vehicle_id          INT NOT NULL REFERENCES vehicles(id),
  services            JSONB NOT NULL DEFAULT '[]',
  assigned_installers JSONB NOT NULL DEFAULT '[]',
  notes               TEXT,
  status              VARCHAR(30) NOT NULL DEFAULT 'Ongoing',
  created_by          INT REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_updated_at ON quotations;
CREATE TRIGGER quotations_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS job_orders_updated_at ON job_orders;
CREATE TRIGGER job_orders_updated_at
  BEFORE UPDATE ON job_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
