-- marketing_send_log
--
-- Per-recipient log of every marketing send (real or test). Lets us:
--   1) Show a per-row "recent sends" disclosure on each pipeline row
--   2) Power a global "Send Activity" panel showing the last N sends
--   3) Audit which sponsor got which message and when
--   4) Spot bouncers and resend manually
--
-- One row per recipient per send. A pipeline row that goes to 12 platinum
-- sponsors writes 12 rows here.

CREATE TABLE IF NOT EXISTS marketing_send_log (
  log_id           INTEGER PRIMARY KEY AUTOINCREMENT,
  send_id          TEXT NOT NULL,                  -- pipeline row id (e.g. 's1a')
  send_run_id      TEXT NOT NULL,                  -- one id per "click Send Now" — groups recipients of a single run
  channel          TEXT NOT NULL,                  -- 'email' | 'sms'
  recipient_email  TEXT,                           -- nullable for sms
  recipient_phone  TEXT,                           -- nullable for email
  recipient_name   TEXT,                           -- best-effort display name
  sponsor_id       INTEGER,                        -- FK to sponsors when known
  audience_label   TEXT,                           -- e.g. 'Platinum Sponsors'
  status           TEXT NOT NULL,                  -- 'sent' | 'failed' | 'test'
  error_message    TEXT,                           -- when status = failed
  subject          TEXT,                           -- email subject snapshot at send time
  body_preview     TEXT,                           -- first ~200 chars of body, for the log UI
  sent_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  sent_by          TEXT                            -- email of admin who clicked Send Now
);

CREATE INDEX IF NOT EXISTS idx_marketing_send_log_send_id ON marketing_send_log (send_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_send_log_run     ON marketing_send_log (send_run_id);
CREATE INDEX IF NOT EXISTS idx_marketing_send_log_recent  ON marketing_send_log (sent_at DESC);
