-- Migration 076: Add high-impact indexes for common API filters and joins.

-- Customer search/listing paths
CREATE INDEX IF NOT EXISTS idx_customers_created_at_desc
  ON customers (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_full_name_lower
  ON customers ((LOWER(full_name)));

CREATE INDEX IF NOT EXISTS idx_customers_lead_source
  ON customers (lead_source);

CREATE INDEX IF NOT EXISTS idx_customers_customer_type
  ON customers (customer_type);

-- Core FK/lookup acceleration
CREATE INDEX IF NOT EXISTS idx_vehicles_customer_id_created_at
  ON vehicles (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_customer_id_created_at
  ON quotations (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_orders_quotation_id
  ON job_orders (quotation_id);

CREATE INDEX IF NOT EXISTS idx_appointments_customer_status_schedule
  ON appointments (customer_id, status, schedule_start DESC);

CREATE INDEX IF NOT EXISTS idx_payments_quotation_created_at
  ON payments (quotation_id, created_at DESC);

-- Notifications feed fetches (schema-compatible across environments)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'recipient_role'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_role_read_created ON notifications (recipient_role, is_read, created_at DESC)';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
      AND column_name = 'role'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_role_read_created ON notifications (role, is_read, created_at DESC)';
  END IF;
END $$;
