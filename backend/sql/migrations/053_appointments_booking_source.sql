-- Migration 053: Add booking_source to identify portal/online bookings
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS booking_source VARCHAR(20) DEFAULT 'staff';

-- Back-fill: any appointment linked to a customer with a portal account
-- and no linked quotation/sale may be a portal booking — but we can't know for certain,
-- so we leave existing rows as 'staff'. New portal bookings will be tagged at insert.
