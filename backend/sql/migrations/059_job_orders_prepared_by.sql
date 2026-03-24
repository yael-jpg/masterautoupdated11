-- 059: Add prepared_by to job_orders

ALTER TABLE job_orders
  ADD COLUMN IF NOT EXISTS prepared_by JSONB NOT NULL DEFAULT '[]'::jsonb;
