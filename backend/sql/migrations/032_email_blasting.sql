-- Migration 032: Email Blasting module

-- Create enum types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
    CREATE TYPE campaign_status AS ENUM ('Draft', 'Scheduled', 'Active', 'Completed', 'Cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_audience_type') THEN
    CREATE TYPE campaign_audience_type AS ENUM ('ALL', 'GROUP', 'FIRST_TIME', 'VIP', 'INACTIVE', 'CUSTOM');
  END IF;
END$$;

-- Main campaigns table
CREATE TABLE IF NOT EXISTS email_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  preview_text VARCHAR(255),
  sender_name VARCHAR(120) NOT NULL,
  sender_email VARCHAR(150) NOT NULL,
  status campaign_status NOT NULL DEFAULT 'Draft',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  send_after TIMESTAMP WITH TIME ZONE,
  promotion_id INT, -- optional FK to promotions table (if exists)
  show_promo_code BOOLEAN DEFAULT FALSE,
  content TEXT, -- HTML body (stored as sanitized HTML / or editor delta)
  content_plain TEXT,
  cta_label VARCHAR(80) DEFAULT 'ENROLL NOW',
  cta_url TEXT,
  cta_color VARCHAR(20) DEFAULT '#1a56db',
  cta_alignment VARCHAR(10) DEFAULT 'center', -- left/center/right
  auto_unsubscribe BOOLEAN DEFAULT TRUE,
  include_company_address BOOLEAN DEFAULT TRUE,
  throttle_batch_size INT DEFAULT 100, -- emails per batch
  throttle_delay_ms INT DEFAULT 1000, -- delay between batches in milliseconds
  domain_verified BOOLEAN DEFAULT FALSE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  auto_disable_after_expiry BOOLEAN DEFAULT TRUE
);

-- Audience targeting table (one or more rows per campaign)
CREATE TABLE IF NOT EXISTS campaign_audiences (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  audience_type campaign_audience_type NOT NULL,
  params JSONB DEFAULT '{}'::jsonb, -- additional filter params: { vehicle_types: [...], min_spend: 100, last_tx_before: '2026-01-01' }
  created_at TIMESTAMP DEFAULT NOW()
);

-- Attachments / uploaded images for the campaign
CREATE TABLE IF NOT EXISTS campaign_assets (
  id SERIAL PRIMARY KEY,
  campaign_id INT REFERENCES email_campaigns(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  content_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recipient send log (per recipient record)
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  customer_id INT REFERENCES customers(id),
  email VARCHAR(150) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued', -- queued, sending, sent, failed, bounced, unsubscribed
  error_message TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  bounce_at TIMESTAMP,
  unsubscribed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for scheduled jobs and fast lookups
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id_status ON campaign_recipients (campaign_id, status);

-- Helper trigger to update updated_at
CREATE OR REPLACE FUNCTION touch_email_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_campaigns_updated_at ON email_campaigns;
CREATE TRIGGER email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW EXECUTE FUNCTION touch_email_campaigns_updated_at();

-- Note: Promotion integration expects a `promotions` table; if not present, promotion_id can remain NULL.
