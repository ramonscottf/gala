-- 004_email_tracking.sql
-- Adds email delivery tracking via Resend webhooks.
--
-- Two changes:
--   1. ALTER marketing_send_log: add resend_id column so each send row
--      can be cross-referenced with Resend's dashboard and webhook events.
--   2. CREATE marketing_email_events: append-only log of every Resend
--      webhook event (delivered, opened, clicked, bounced, complained).
--      Multiple events per email — one row per event.

ALTER TABLE marketing_send_log ADD COLUMN resend_id TEXT;
CREATE INDEX IF NOT EXISTS idx_msl_resend_id ON marketing_send_log(resend_id);

CREATE TABLE IF NOT EXISTS marketing_email_events (
  event_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  resend_id          TEXT NOT NULL,                 -- Resend message ID
  event_type         TEXT NOT NULL,                 -- email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained, email.delivery_delayed
  recipient_email    TEXT,                          -- denormalized for fast lookup
  click_link         TEXT,                          -- only set on email.clicked
  bounce_type        TEXT,                          -- only set on email.bounced (Permanent, Transient, etc.)
  bounce_reason      TEXT,                          -- bounce sub-detail
  user_agent         TEXT,                          -- only set on email.opened (parsed from event payload if available)
  ip_address         TEXT,                          -- only set on opens/clicks
  occurred_at        TEXT NOT NULL,                 -- timestamp from Resend payload (ISO 8601)
  received_at        TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),  -- when our webhook received it
  raw_payload        TEXT                           -- full JSON from Resend, for debugging
);

CREATE INDEX IF NOT EXISTS idx_mee_resend_id ON marketing_email_events(resend_id);
CREATE INDEX IF NOT EXISTS idx_mee_event_type ON marketing_email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mee_recipient ON marketing_email_events(recipient_email);
CREATE INDEX IF NOT EXISTS idx_mee_occurred_at ON marketing_email_events(occurred_at);

-- Composite index for the most common dashboard query:
-- "show me the latest event for each resend_id"
CREATE INDEX IF NOT EXISTS idx_mee_resend_occurred ON marketing_email_events(resend_id, occurred_at DESC);
