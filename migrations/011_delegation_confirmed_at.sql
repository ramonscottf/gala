-- 011_delegation_confirmed_at.sql
-- May 16, 2026 — first-visit receive flow.
--
-- When a delegate opens their portal link from SMS/email for the first
-- time, they should see a "here's what your sponsor set up for you,
-- keep or modify?" gate before landing in the normal portal. confirmed_at
-- gets stamped on Keep or on first Modify-then-save; once non-null,
-- delegate sees the normal view on subsequent visits.
--
-- accessed_at already exists but it gets bumped on every visit and is
-- used by the marketing/reminder code. confirmed_at is a separate
-- one-time semantic — distinct field for distinct meaning.

ALTER TABLE sponsor_delegations ADD COLUMN confirmed_at TEXT;
