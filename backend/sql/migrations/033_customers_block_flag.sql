-- Migration 033: Add is_blocked flag to customers

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_is_blocked ON customers (is_blocked);
