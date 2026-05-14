-- Migration 010 — Tier seat-selection windows (server-side gate)
--
-- Problem (May 14 2026): the portal had no enforcement of tier opening
-- dates. Anyone holding a valid sponsor or delegation token could pick
-- seats at any time. The May 11/14/18/20/25/28 ladder existed only as
-- marketing copy in templates. VCBO (Silver, sponsor 85) used the
-- homepage magic-link self-service flow on May 12, then picked all 14
-- seats on May 13 — six days before Silver was supposed to open.
--
-- Fix: a canonical `tier_windows` table consulted by every write path
-- (/pick, /finalize, /assign, /delegate). Once a tier's `opens_at` is
-- in the past, that tier is open forever. Nothing closes; we only
-- ever add audiences. Override path: setting `override_open` = 1 lets
-- Sherry punch a hole for a specific tier (e.g. an early-payer favor)
-- without changing the global schedule.
--
-- Seeded with the canonical schedule:
--   Platinum            May 11 (already open as of this migration)
--   Gold                May 14
--   Silver              May 18
--   Bronze              May 20
--   Friends and Family  May 25
--   Individual Seats    May 28
--   Split F&F           same as Friends and Family
--   Cell Phone          Platinum-level (handshake tier with Verizon)
--   Trade / Donation    Platinum-level (paid in full, treat as VIP)
--
-- All times are stored as UTC ISO-8601 strings. The canonical wall-clock
-- time is 8:00 AM Mountain Daylight Time (UTC-6) which is 14:00 UTC.
-- For Platinum we set opens_at to a time already in the past so the
-- gate is open for them immediately on deploy.

CREATE TABLE IF NOT EXISTS tier_windows (
  tier            TEXT PRIMARY KEY,
  opens_at        TEXT NOT NULL,           -- ISO-8601 UTC
  override_open   INTEGER NOT NULL DEFAULT 0,   -- 1 = bypass opens_at check
  notes           TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by      TEXT
);

-- Seed the canonical schedule. Tier strings match canonical values
-- produced by normalizeSponsorTier() in functions/api/gala/_gala_data.js.
INSERT OR REPLACE INTO tier_windows (tier, opens_at, override_open, notes, updated_by) VALUES
  ('Platinum',              '2026-05-11T14:00:00Z', 0, 'Platinum window opened May 11. Live.', 'migration-010'),
  ('Cell Phone',            '2026-05-11T14:00:00Z', 0, 'Handshake tier with Verizon — treat as Platinum-level for access.', 'migration-010'),
  ('Trade',                 '2026-05-11T14:00:00Z', 0, 'Paid-in-full trade sponsors — treat as Platinum-level.', 'migration-010'),
  ('Donation',              '2026-05-11T14:00:00Z', 0, 'Donation-tier ticket holders — treat as Platinum-level.', 'migration-010'),
  ('Gold',                  '2026-05-14T14:00:00Z', 0, 'Gold opens May 14, 8:00 AM MDT.', 'migration-010'),
  ('Silver',                '2026-05-18T14:00:00Z', 0, 'Silver opens May 18, 8:00 AM MDT.', 'migration-010'),
  ('Bronze',                '2026-05-20T14:00:00Z', 0, 'Bronze opens May 20, 8:00 AM MDT.', 'migration-010'),
  ('Friends and Family',    '2026-05-25T14:00:00Z', 0, 'Friends & Family opens May 25, 8:00 AM MDT.', 'migration-010'),
  ('Split Friends & Family','2026-05-25T14:00:00Z', 0, 'Split F&F opens with Friends & Family.', 'migration-010'),
  ('Individual Seats',      '2026-05-28T14:00:00Z', 0, 'Individual Seats opens May 28, 8:00 AM MDT.', 'migration-010');
