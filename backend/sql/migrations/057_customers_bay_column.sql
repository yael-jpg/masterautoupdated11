-- Migration 057: Add bay (branch) column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bay VARCHAR(100);
