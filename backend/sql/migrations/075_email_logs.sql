-- Migration 075: Email logs table for centralized email dispatch status tracking
-- Required fields per implementation request: user_id, email, subject, status, error_message, created_at

CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  user_id INT,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_created
  ON email_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_status_created
  ON email_logs (status, created_at DESC);
