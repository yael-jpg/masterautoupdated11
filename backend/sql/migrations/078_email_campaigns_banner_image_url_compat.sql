-- Migration 078: Ensure banner image column exists for email campaigns

ALTER TABLE IF EXISTS email_campaigns
  ADD COLUMN IF NOT EXISTS banner_image_url TEXT;
