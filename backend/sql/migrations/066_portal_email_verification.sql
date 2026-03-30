-- Migration 066: Portal email OTP verification
-- Adds columns to support email verification for self-registered portal accounts.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_email_verified_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS portal_email_verification_code_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS portal_email_verification_expires_at TIMESTAMP NULL;

-- Backfill: mark existing portal accounts as verified so we don't lock out current users.
UPDATE customers
SET portal_email_verified_at = COALESCE(portal_email_verified_at, NOW())
WHERE portal_password_hash IS NOT NULL;
