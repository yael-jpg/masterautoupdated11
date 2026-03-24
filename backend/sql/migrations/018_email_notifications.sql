-- Migration 018: Email Notifications audit table
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores a record for every automated email attempt.
-- The UNIQUE constraint on (event_type, entity_id) prevents duplicate sends.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_notifications (
  id              SERIAL       PRIMARY KEY,
  event_type      VARCHAR(100) NOT NULL,
  -- e.g. 'quotation_approved' | 'job_started'

  entity_type     VARCHAR(50)  NOT NULL,
  -- e.g. 'quotation' | 'job_order'

  entity_id       INT          NOT NULL,
  recipient_email TEXT         NOT NULL,

  status          VARCHAR(20)  NOT NULL DEFAULT 'sent',
  -- 'sent' | 'failed' | 'skipped'

  error_message   TEXT,
  triggered_by    INT          REFERENCES users(id) ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- One email per event per entity — prevents duplicate sends
  CONSTRAINT uq_email_notifications_event_entity
    UNIQUE (event_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_entity
  ON email_notifications (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_email_notifications_status
  ON email_notifications (status);

-- Done. Run with:
--   node src/utils/runSql.js sql/migrations/018_email_notifications.sql
