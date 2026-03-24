-- Migration 056: Inventory beginning inventory + dates

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS beginning_inventory NUMERIC(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inventory_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS starting_date DATE;

-- Backfill beginning_inventory for existing rows
UPDATE inventory_items
SET beginning_inventory = COALESCE(beginning_inventory, qty_on_hand)
WHERE beginning_inventory IS NULL OR beginning_inventory = 0;
