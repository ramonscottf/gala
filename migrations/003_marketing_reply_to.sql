-- Per-send reply-to override. NULL = use the default (Sherry / smiggin@dsdmail.net).
-- Set per send_id when a specific touch should route replies elsewhere
-- (e.g. the finish-your-seats campaign replies to Scott, who fields seat help).
-- IMPORTANT: single address only — SkippyMail silently drops comma-separated replyTo.
ALTER TABLE marketing_sends ADD COLUMN reply_to TEXT DEFAULT NULL;
