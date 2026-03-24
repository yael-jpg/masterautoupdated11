-- Add optional client-visible notes describing products/materials used per service

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS materials_notes TEXT;
