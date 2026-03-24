-- Migration 060: Add bay (branch) column to quotations table
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS bay VARCHAR(100);
