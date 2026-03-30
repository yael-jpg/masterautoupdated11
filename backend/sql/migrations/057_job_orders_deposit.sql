ALTER TABLE job_orders
	ADD COLUMN IF NOT EXISTS required_deposit_amount NUMERIC(12,2) DEFAULT 0;