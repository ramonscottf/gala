-- 009_seat_holds_showing_number.sql
-- Applied directly to production D1 May 11 2026 ~23:35 UTC.
--
-- Adds showing_number to seat_holds so holds in the same auditorium at
-- different showings don't collide on the UNIQUE constraint. The old
-- table's UNIQUE(theater_id, row_label, seat_num) silently treated the
-- early and late showings as the same seat — making the whole seat-
-- placement pipeline collapse to showing 1 on every write.
--
-- Context: gala 2026 has multiple auditoriums hosting BOTH the early
-- (4:30 dinner / ~5:00 movie) and late (7:15 dinner / ~7:40 movie)
-- showings of the same film — Aud 6, 7, 8, 10. The Tanner Clinic
-- incident on May 11 2026 surfaced this: Terra Cooper picked Aud 8
-- LATE Star Wars, the seat-write path discarded showing_number, the
-- DB defaulted to showing 1, and her ticket page rendered 4:50 PM
-- instead of 7:40 PM. See pick.js / seating.js / seating-bulk.js for
-- the matching server-side fix.
--
-- Strategy: SQLite doesn't allow adding a column to a UNIQUE constraint
-- in-place, so we rebuilt the table. Since holds expire in 15 minutes
-- and there were ZERO active holds at the time of migration (verified
-- before running), we accepted data loss of the empty table rather than
-- bother with the backfill logic.

PRAGMA foreign_keys = OFF;

CREATE TABLE seat_holds__new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theater_id INTEGER NOT NULL,
  showing_number INTEGER NOT NULL DEFAULT 1,
  row_label TEXT NOT NULL,
  seat_num TEXT NOT NULL,
  sponsor_id INTEGER REFERENCES sponsors(id),
  delegation_id INTEGER REFERENCES sponsor_delegations(id),
  held_by_token TEXT NOT NULL,
  held_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  UNIQUE(theater_id, showing_number, row_label, seat_num)
);

DROP TABLE seat_holds;
ALTER TABLE seat_holds__new RENAME TO seat_holds;

PRAGMA foreign_keys = ON;
