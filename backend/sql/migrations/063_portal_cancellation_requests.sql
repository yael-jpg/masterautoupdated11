-- Portal Cancellation Requests
-- Adds approval workflow fields on appointments so portal customers can request
-- cancellation (with refund/credit preference) and admins can approve/reject.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancel_request_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cancel_request_action VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cancel_request_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancel_request_resolved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancel_request_resolved_by INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_cancel_requested_at ON appointments (cancel_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_cancel_request_status ON appointments (cancel_request_status);
