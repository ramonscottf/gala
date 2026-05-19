-- Migration 014 — sponsor signs checklist
--
-- Adds three columns to sponsors that power /sponsorchecklist:
--   logo_white_url       — URL to the white-version logo in R2
--                          (logo_url already exists for the full-color version)
--   sign_completed_at    — ISO timestamp when the sign was marked done in Canva
--   sign_video_frame_url — placeholder for later: per-sponsor video frame
--                          generated from the two logos (Phase 2 of this build)
--
-- Each column is NULLABLE and has a sensible default. No existing rows are
-- touched. Safe to re-run (IF NOT EXISTS).

ALTER TABLE sponsors ADD COLUMN logo_white_url TEXT;
ALTER TABLE sponsors ADD COLUMN sign_completed_at TEXT;
ALTER TABLE sponsors ADD COLUMN sign_video_frame_url TEXT;
