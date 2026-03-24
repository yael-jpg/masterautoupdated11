-- Migration 005: Add ON DELETE CASCADE to all foreign keys referencing customers(id)
-- This allows customers to be deleted even when they have related sales, vehicles, or appointments.

BEGIN;

-- 1. sales.customer_id
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_customer_id_fkey,
  ADD CONSTRAINT sales_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- 2. vehicles.customer_id
ALTER TABLE vehicles
  DROP CONSTRAINT IF EXISTS vehicles_customer_id_fkey,
  ADD CONSTRAINT vehicles_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- 3. appointments.customer_id
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_customer_id_fkey,
  ADD CONSTRAINT appointments_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

COMMIT;
