-- Migration: marketing_sends table
-- Source of truth for the gala 2026 marketing pipeline (phases, sends, copy).
-- Replaces the hardcoded PIPELINE constant in admin/index.html and the SENDS
-- registry in marketing-test.js. Both will read from this table going forward.
--
-- The legacy gala-review tool in def-site (which used a separate
-- marketing_edits table) is being archived — this is the single editor.

CREATE TABLE IF NOT EXISTS marketing_sends (
  send_id      TEXT PRIMARY KEY,
  phase        INTEGER NOT NULL,
  phase_title  TEXT,
  phase_color  TEXT,
  phase_desc   TEXT,
  phase_range  TEXT,
  channel      TEXT NOT NULL,
  date         TEXT NOT NULL,
  time         TEXT NOT NULL,
  audience     TEXT,
  status       TEXT DEFAULT 'upcoming',
  title        TEXT,
  subject      TEXT,
  body         TEXT,
  notes        TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by   TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketing_sends_phase_order
  ON marketing_sends(phase, sort_order);
