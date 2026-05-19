-- Migration 013 — sponsor_actions_log
--
-- Audit trail for sponsor edits made on behalf of a child delegation.
-- Every write that targets a delegation's seats (when called via the
-- new on_behalf_of_delegation_id path in pick.js) logs a row here.
--
-- Why a separate table from sponsor_invites: invites are recipient-
-- centric (channel, send status). This is actor-centric (who did
-- what to whose seats). Different rotation/retention policies make
-- sense, and the join keys differ.
--
-- Phase C of the May 18 2026 sponsor-portal "more editing skills"
-- work — see docs/PLAN-sponsor-see-guest-tickets.md.

CREATE TABLE IF NOT EXISTS sponsor_actions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_sponsor_id INTEGER NOT NULL REFERENCES sponsors(id),
  target_delegation_id INTEGER NOT NULL REFERENCES sponsor_delegations(id),
  action TEXT NOT NULL,             -- 'finalize' | 'unfinalize' | 'hold' | 'release' | 'set_dinner' | 'push_tickets'
  theater_id INTEGER,
  showing_number INTEGER,
  row_label TEXT,
  seat_num TEXT,
  before_value TEXT,                -- prior state (JSON-stringified, e.g. {"dinner":"salad"})
  after_value TEXT,                 -- new state (JSON-stringified)
  notify_sent INTEGER DEFAULT 0,    -- 1 if delegate was notified after the change
  notes TEXT,                       -- free-form e.g. 'swap from F12 to F13'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sponsor_actions_log_target
  ON sponsor_actions_log(target_delegation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sponsor_actions_log_actor
  ON sponsor_actions_log(actor_sponsor_id, created_at);
