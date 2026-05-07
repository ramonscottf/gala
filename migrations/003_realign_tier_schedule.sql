-- 003_realign_tier_schedule.sql
--
-- Realigns the Phase 2 tier ladder to match the actual sponsor open dates
-- Sherry confirmed:
--   Platinum:         May 11
--   Gold:             May 14
--   Silver:           May 18
--   Bronze:           May 20
--   Friends & Family: May 25
--   Individual Seats: May 28
--
-- Rules applied:
--   * Closing nudge sits 6 days after opens (per Scott)
--   * Audience labels match the admin dropdown so the recipient resolver
--     in functions/api/gala/_audience.js actually finds people
--   * Title format: "Tier Opens — May DD"
--
-- Repurposing strategy:
--   s11 (was May 20 "General Opens")  → Friends & Family Opens (May 25)
--   sms5 (was May 20 "General SMS")   → Friends & Family SMS    (May 25)
--   s12 (was May 28 "MAIN EVENT")     → Individual Seats Opens  (May 28)
--   sms6 (was May 28 "Post-Main SMS") → Individual Seats SMS    (May 28)
-- Their bodies/subjects are kept attached to the right tier — Sherry/Kara
-- already drafted copy on these rows, no reason to throw it away.
--
-- New rows added: s11n (F&F nudge May 31), s12n (Individual nudge Jun 3).

-- ── Platinum (was May 4 → now May 11) ───────────────────────────────────
UPDATE marketing_sends SET
  date = 'May 11', time = '8:00 AM',
  audience = 'Platinum Sponsors',
  title = 'Platinum Opens — May 11',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's3';

UPDATE marketing_sends SET
  date = 'May 11', time = '8:00 AM',
  audience = 'Platinum Sponsors',
  title = 'Platinum SMS — May 11',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 'sms1';

UPDATE marketing_sends SET
  date = 'May 17', time = '4:00 PM',
  audience = 'Platinum Sponsors',
  title = 'Platinum Closing Nudge — May 17',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's4';

-- ── Gold (was May 11 → stays May 14) ───────────────────────────────────
UPDATE marketing_sends SET
  date = 'May 14', time = '8:00 AM',
  audience = 'Gold Sponsors',
  title = 'Gold Opens — May 14',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's5';

UPDATE marketing_sends SET
  date = 'May 14', time = '8:00 AM',
  audience = 'Gold Sponsors',
  title = 'Gold SMS — May 14',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 'sms2';

UPDATE marketing_sends SET
  date = 'May 20', time = '4:00 PM',
  audience = 'Gold Sponsors',
  title = 'Gold Closing Nudge — May 20',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's6';

-- ── Silver (was May 14 → now May 18) ───────────────────────────────────
UPDATE marketing_sends SET
  date = 'May 18', time = '8:00 AM',
  audience = 'Silver Sponsors',
  title = 'Silver Opens — May 18',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's7';

UPDATE marketing_sends SET
  date = 'May 18', time = '8:00 AM',
  audience = 'Silver Sponsors',
  title = 'Silver SMS — May 18',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 'sms3';

UPDATE marketing_sends SET
  date = 'May 24', time = '4:00 PM',
  audience = 'Silver Sponsors',
  title = 'Silver Closing Nudge — May 24',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's8';

-- ── Bronze (was May 17 → now May 20) ───────────────────────────────────
UPDATE marketing_sends SET
  date = 'May 20', time = '8:00 AM',
  audience = 'Bronze Sponsors',
  title = 'Bronze Opens — May 20',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's9';

UPDATE marketing_sends SET
  date = 'May 20', time = '8:00 AM',
  audience = 'Bronze Sponsors',
  title = 'Bronze SMS — May 20',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 'sms4';

UPDATE marketing_sends SET
  date = 'May 26', time = '4:00 PM',
  audience = 'Bronze Sponsors',
  title = 'Bronze Closing Nudge — May 26',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's10';

-- ── Friends & Family (repurposing s11 / sms5) ──────────────────────────
UPDATE marketing_sends SET
  date = 'May 25', time = '8:00 AM',
  audience = 'Friends & Family',
  title = 'Friends & Family Opens — May 25',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's11';

UPDATE marketing_sends SET
  date = 'May 25', time = '8:00 AM',
  audience = 'Friends & Family',
  title = 'Friends & Family SMS — May 25',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 'sms5';

-- New row: F&F closing nudge
INSERT OR IGNORE INTO marketing_sends (
  send_id, phase, phase_title, phase_color, phase_desc, phase_range,
  channel, date, time, audience, status, title, subject, body, notes, sort_order
) VALUES (
  's11n', '2', 'Tiered Open', '#f0a830',
  'Sponsor windows open in tier order. SMS active for opt-ins.',
  'May 11 – May 28',
  'Email', 'May 31', '4:00 PM', 'Friends & Family', 'upcoming',
  'Friends & Family Closing Nudge — May 31',
  'Last call to lock your seats',
  '',
  'Auto-added by migration 003. Mirror Bronze closing nudge structure.',
  155
);

-- ── Individual Seats (repurposing s12 / sms6) ──────────────────────────
UPDATE marketing_sends SET
  date = 'May 28', time = '8:00 AM',
  audience = 'Individual Seats',
  title = 'Individual Seats Opens — May 28',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 's12';

UPDATE marketing_sends SET
  date = 'May 28', time = '8:00 AM',
  audience = 'Individual Seats',
  title = 'Individual Seats SMS — May 28',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id = 'sms6';

-- New row: Individual closing nudge
INSERT OR IGNORE INTO marketing_sends (
  send_id, phase, phase_title, phase_color, phase_desc, phase_range,
  channel, date, time, audience, status, title, subject, body, notes, sort_order
) VALUES (
  's12n', '2', 'Tiered Open', '#f0a830',
  'Sponsor windows open in tier order. SMS active for opt-ins.',
  'May 11 – May 28',
  'Email', 'Jun 3', '4:00 PM', 'Individual Seats', 'upcoming',
  'Individual Seats Closing Nudge — Jun 3',
  'Last call to lock your seat',
  '',
  'Auto-added by migration 003. Final nudge before Phase 4 Auction Preview.',
  175
);

-- Re-fold Phase 2 phase metadata onto the F&F + Individual rows so they
-- visually group with the rest of Phase 2 in the dashboard, not as their
-- own "General Push" phase.
UPDATE marketing_sends SET
  phase = '2',
  phase_title = 'Tiered Open',
  phase_color = '#f0a830',
  phase_desc = 'Sponsor windows open in tier order. SMS active for opt-ins.',
  phase_range = 'May 11 – May 28',
  updated_at = CURRENT_TIMESTAMP, updated_by = 'migration:003'
WHERE send_id IN ('s11', 'sms5', 's12', 'sms6');
