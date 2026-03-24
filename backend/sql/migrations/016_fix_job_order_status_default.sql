-- Migration 016: Fix job_orders default status
-- Problem: migration 010 set DEFAULT 'Ongoing'; migration 015 updated existing rows
--          but did not change the column default, so every new job order created
--          after migration 015 still gets 'Ongoing' instead of 'Pending'.
-- Fix:     1. Change column default to 'Pending'
--          2. Move any remaining 'Ongoing' records back to 'Pending'
--             (these are newly created JOs that haven't been started yet)

ALTER TABLE job_orders
  ALTER COLUMN status SET DEFAULT 'Pending';

UPDATE job_orders
   SET status = 'Pending'
 WHERE status = 'Ongoing';
