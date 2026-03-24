-- Migration 062: Backfill customer_id based on vehicle ownership
-- Goal: ensure portal/admin views "reflect" consistently even if historical
-- records were created with a mismatched customer_id.

BEGIN;

-- Quotations: align customer_id to the vehicle owner
UPDATE quotations q
SET customer_id = v.customer_id
FROM vehicles v
WHERE v.id = q.vehicle_id
  AND q.customer_id IS DISTINCT FROM v.customer_id;

-- Job orders: align customer_id to the vehicle owner
UPDATE job_orders jo
SET customer_id = v.customer_id
FROM vehicles v
WHERE v.id = jo.vehicle_id
  AND jo.customer_id IS DISTINCT FROM v.customer_id;

-- Sales: align customer_id to the vehicle owner (affects payments tied to sales)
UPDATE sales s
SET customer_id = v.customer_id
FROM vehicles v
WHERE v.id = s.vehicle_id
  AND s.customer_id IS DISTINCT FROM v.customer_id;

COMMIT;
