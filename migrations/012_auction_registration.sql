-- 012_auction_registration.sql
-- May 18, 2026 — Bloomerang/Qgiv silent-auction account registration.
--
-- Sponsors register a Qgiv bidder account via an iframe embed (form
-- 1097071) inside the portal. We mark them registered server-side from
-- a postMessage signal (and optionally a Qgiv webhook fallback) so the
-- portal can switch the card to a ✓ "You're registered" state on next
-- load and skip the prompt forever after.
--
-- Three columns. Null = not registered. Timestamp = registered.
-- Email and txn captured so Sherry/Kara can cross-reference Qgiv
-- records when sponsors ask "did this person register".
--
-- v1 scope: sponsors only. Delegations attend the gala via their
-- own portal but the auction-account flow is gated to primary sponsor
-- tokens in the API endpoints. If we want delegation-level bidding
-- accounts later, we add the same three columns to sponsor_delegations.

ALTER TABLE sponsors ADD COLUMN auction_registered_at TEXT;
ALTER TABLE sponsors ADD COLUMN auction_registration_email TEXT;
ALTER TABLE sponsors ADD COLUMN auction_registration_txn TEXT;
