-- Migration 005: Chat infrastructure for FAQ + live help bubble
-- Created 2026-05-08
--
-- Three tables:
--   chat_threads  - one per visitor session (gated by name+email)
--   chat_messages - all messages in a thread (user, ai, agent)
--   chat_faq      - editable knowledge base seeded from showtimes + policy
--
-- Slack integration:
--   chat_threads.slack_thread_ts holds the parent message ts in #gala-helpline
--   Each new visitor message in 'live' mode posts as a thread reply to that ts
--   Slack bot replies (Events API) match by slack_thread_ts and insert as 'agent'

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,                    -- uuid v4
  attendee_name TEXT NOT NULL,
  attendee_email TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ai',        -- 'ai' or 'live'
  slack_thread_ts TEXT,                   -- Slack parent message ts; null until first live escalation
  user_agent TEXT,
  ip_hash TEXT,                           -- privacy: store hash, not raw
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_email ON chat_threads(attendee_email);
CREATE INDEX IF NOT EXISTS idx_chat_threads_slack_ts ON chat_threads(slack_thread_ts);
CREATE INDEX IF NOT EXISTS idx_chat_threads_last_activity ON chat_threads(last_activity);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  sender TEXT NOT NULL,                   -- 'user' | 'ai' | 'agent' | 'system'
  content TEXT NOT NULL,
  ai_model TEXT,                          -- e.g. 'claude-haiku-4-5' when sender=ai
  ai_tokens_in INTEGER,
  ai_tokens_out INTEGER,
  slack_message_ts TEXT,                  -- when sender=user and posted to slack, or sender=agent received from slack
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_slack_ts ON chat_messages(slack_message_ts);

CREATE TABLE IF NOT EXISTS chat_faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,                 -- 'tickets', 'night-of', 'movies', 'seating', 'donations', 'logistics'
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT,                          -- comma-separated, lowercase, for fast pre-filter
  priority INTEGER DEFAULT 100,           -- lower = surface earlier in static search
  active INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_faq_category ON chat_faq(category, active);
CREATE INDEX IF NOT EXISTS idx_chat_faq_priority ON chat_faq(priority, active);
