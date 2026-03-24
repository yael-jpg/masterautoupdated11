-- Rename status 'Closed' to 'Complete' for any existing job order records
UPDATE job_orders SET status = 'Complete' WHERE status = 'Closed';
