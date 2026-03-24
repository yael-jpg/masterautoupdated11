-- Migration 056: Backfill approved quotations that already have appointments to 'History' status.
-- This fixes quotations that were scheduled BEFORE the automatic status-update logic was added.
-- Safe to run multiple times (idempotent via WHERE status = 'Approved').

UPDATE quotations
SET status = 'History'
WHERE status = 'Approved'
  AND EXISTS (
    SELECT 1
    FROM appointments a
    WHERE a.quotation_id = quotations.id
  );
