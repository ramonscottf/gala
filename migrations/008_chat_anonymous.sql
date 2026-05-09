-- Migration 008: Allow anonymous chat threads
-- Created 2026-05-09
--
-- Remove NOT NULL on attendee_name and attendee_email in chat_threads.
-- Booker is now openable without an identity gate — anyone can ask
-- questions about the gala without needing to identify themselves.
-- Identity will only be required if/when we re-enable Slack live
-- escalation, at which point we collect name+email at that step
-- (so the human on the other end knows who they're talking to).
--
-- SQLite doesn't support ALTER COLUMN to drop NOT NULL directly,
-- so we use the table-rebuild pattern: rename old, create new with
-- relaxed constraints, copy data, drop old, recreate indexes.

BEGIN TRANSACTION;

-- 1. Rename current table out of the way
ALTER TABLE chat_threads RENAME TO chat_threads_v1;

-- 2. Create new table with name/email nullable
CREATE TABLE chat_threads (
  id TEXT PRIMARY KEY,
  attendee_name TEXT,                       -- nullable: null = anonymous visitor
  attendee_email TEXT,                      -- nullable: null = anonymous visitor
  mode TEXT NOT NULL DEFAULT 'ai',
  slack_thread_ts TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

-- 3. Copy data over
INSERT INTO chat_threads (id, attendee_name, attendee_email, mode, slack_thread_ts, user_agent, ip_hash, created_at, last_activity, closed_at)
SELECT id, attendee_name, attendee_email, mode, slack_thread_ts, user_agent, ip_hash, created_at, last_activity, closed_at
FROM chat_threads_v1;

-- 4. Drop the old table
DROP TABLE chat_threads_v1;

-- 5. Recreate indexes (they got dropped with the rename)
CREATE INDEX IF NOT EXISTS idx_chat_threads_email ON chat_threads(attendee_email);
CREATE INDEX IF NOT EXISTS idx_chat_threads_slack_ts ON chat_threads(slack_thread_ts);
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_activity ON chat_threads(last_activity);

COMMIT;
