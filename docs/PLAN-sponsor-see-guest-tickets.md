# PLAN — Sponsor sees + edits guest's tickets

**Slug:** `sponsor-see-guest-tickets`
**Started:** May 18 2026
**Driver:** Jason Smith → Scott SMS thread (Friday May 16 → Today). Jason sponsored, forwarded the invite to Norris Nalder, then had to text Scott to ask which showtime Norris had picked because the sponsor portal showed only `2 of 2 placed` without surfacing the actual selections.

The portal was already *fetching* every child-delegation seat assignment in `/api/gala/portal/[token]` (see `childDelegationAssignments` in the response payload). It just wasn't *rendering* them in the Manage Invite modal. So the lowest-cost first move is a UI-only change that drains the support burden by ~80% in one PR.

## Status

| Phase | What | State |
|---|---|---|
| A | Show the guest's tickets in Manage Invite | ✅ Shipped 2026-05-18 (this PR) |
| B | "Push tickets to guest" — confirmation SMS+email on demand | ✅ Shipped 2026-05-18 (this PR) |
| C | Edit guest's seats on the sponsor's behalf | 📋 Plan below, awaiting Scott's go-ahead before any code touches auth |

---

## Phase A — Read-only view (SHIPPED)

### Changes

**`src/portal-v2/DelegationManageModal.jsx`**
- Added two new props: `assignments` (the full `childDelegationAssignments` list from the portal payload) and `showtimes` (the joined showtimes+movies list).
- `useMemo`-derived `myAssignments` — filters the full list to just this delegation's seats, stable-sorted by `showing_number → theater_id → row_label → seat_num`.
- `useMemo`-derived `showtimeLookup` — `Map` keyed by `${theater_id}:${showing_number}` for O(1) lookup per row.
- `useMemo`-derived `isSplit` — true if the delegation's seats span more than one `(theater_id, showing_number)` pair.
- New section "Their tickets" rendered between the status header and Edit details, gated on `!selfView && myAssignments.length > 0`.
- New `TicketLine` component — compact two-line summary: `{Movie} · {Early|Late} Show {start}` then `{Theater N} · {row+seat} · {emoji} {dinner label}`. Pulls dinner label/emoji from canonical `DINNER_OPTIONS` in `DinnerModal.jsx`.
- New `SplitBlockPill` component — gold-on-gold tinted pill rendered next to the section title when `isSplit`.

**`src/portal-v2/PortalShell.jsx`**
- `<DelegationManageModal>` invocation now passes `assignments={portal?.childDelegationAssignments}` and `showtimes={portal?.showtimes}`.
- `ReceiveOverlay.jsx` invocation is `selfView={true}` and intentionally doesn't pass these — the self-view doesn't show "Their tickets".

### Behaviour

- **Empty state:** zero placements → section doesn't render at all. The existing `{seatsPlaced} of {seatsAllocated} placed` header carries the empty state.
- **Missing dinner:** assignment has no `dinner_choice` → the dinner slot reads `Meal not chosen` in gold so the sponsor sees what's outstanding.
- **Stale showtime lookup:** if `(theater_id, showing_number)` doesn't resolve to a movie row (admin reassignment, stale cache), `TicketLine` falls back to `Theater {N}` for the title and `Aud {N}` for the location — never crashes, always renders something.
- **Composite-key discipline:** read path only. No writes. Phase C is the place where the May 11 Tanner Clinic-style composite-key footgun re-enters scope.

---

## Phase B — Push tickets to guest (SHIPPED)

### Why it's distinct from `resend`

`resend` re-sends the original invite email/SMS with a "Select my seats →" CTA. That's wrong messaging when seats are *already placed* — the guest doesn't need to pick, they need a receipt. `push_tickets` is the receipt path.

### Changes

**`functions/api/gala/portal/[token]/delegate.js`**
- Imported `buildConfirmationSms` from `_confirmation_sms.js` (the same helper `finalize.js` and `sms.js` use).
- New `action: 'push_tickets'` branch.
  - Authorization mirrors `resend`: sponsor must own the parent, or caller is the delegation's parent, or caller is the delegation itself.
  - 400 if `seat_assignments` count for this delegation is 0 — refuse to send "you have 0 seats."
- New `sendDelegationTicketPush(env, opts)` helper at file bottom.
  - Calls `buildConfirmationSms({ kind: 'delegation', recordId, company, token })` — byte-for-byte the SMS body delegates already see when they self-finalize. One source of truth.
  - Email wraps the same SMS body in a monospace `<div>` inside the brand template — guest sees the same content in both channels.
  - Logged to `sponsor_invites` with channel labels `email-push` / `sms-push` so admin can distinguish ticket pushes from invites and dinner reminders.

**`src/portal-v2/DelegationManageModal.jsx`**
- New `pushTickets()` handler (parallel to `resend`/`reclaim`/`copyLink`).
- New `🎟️ Push tickets to guest` button at the top of the Actions list, gated on `myAssignments.length > 0`.
- 4-second "✓ Tickets pushed" success state, same UX pattern as `Saved ✓`.

### Twilio + email plumbing

No new infra. Uses the existing `sendSMS` and `sendEmail` helpers from `_notify.js`, which route through Twilio Messaging Service `MGbf6488bc2bcd343b4c02b2d8253fb4bf` and SkippyMail at `mail.fosterlabs.org/send`.

---

## Phase C — Edit on the sponsor's behalf (PLAN ONLY — DO NOT IMPLEMENT WITHOUT SCOTT'S GO)

This is the auth lift. Today, `pick.js` gates every seat operation on:

```js
const cond = resolved.kind === 'sponsor'
  ? `sponsor_id = ? AND delegation_id IS NULL`
  : `delegation_id = ?`;
```

A sponsor literally cannot move, swap, or change the dinner on a child delegation's seat through the existing API. The clean path is below. The dirty path (sponsor uses the child's token directly) is rejected — it would silently log all sponsor edits under the child's identity in the audit trail, which is exactly the trust regression we'd avoid.

### Proposed approach

**Backend — extend the auth gate, don't bypass it**

1. Add an optional `on_behalf_of_delegation_id` body parameter to every `pick.js` action (`hold`, `release`, `finalize`, `unfinalize`, `set_dinner`).
2. When present, verify that `resolved.kind === 'sponsor'` AND the named delegation has `parent_sponsor_id = resolved.record.id`. Reject 403 otherwise.
3. The seat-ownership predicate becomes:
   ```js
   const ownership = onBehalf
     ? `delegation_id = ?`
     : (resolved.kind === 'sponsor'
         ? `sponsor_id = ? AND delegation_id IS NULL`
         : `delegation_id = ?`);
   ```
4. Audit: log every on-behalf write to a new `sponsor_actions_log` table (proposed migration 013):
   ```sql
   CREATE TABLE sponsor_actions_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     actor_sponsor_id INTEGER NOT NULL REFERENCES sponsors(id),
     target_delegation_id INTEGER NOT NULL REFERENCES sponsor_delegations(id),
     action TEXT NOT NULL,             -- e.g. 'swap', 'unfinalize', 'set_dinner'
     before_json TEXT,
     after_json TEXT,
     notify_sent INTEGER DEFAULT 0,    -- 1 if delegate was notified
     created_at TEXT DEFAULT (datetime('now'))
   );
   ```

**Frontend — wrap the existing modals**

5. `SwapSeatModal` and `MoveGroupModal` already do the right thing for the caller's own seats. Add a `behalfOf={delegation}` prop that:
   - Injects `on_behalf_of_delegation_id` into the API call body.
   - Renders a banner: `Editing on behalf of {delegate name}` so the sponsor never forgets which scope they're in.
6. New entry point in `DelegationManageModal` — `Edit selections` button below `Push tickets to guest`. Opens a tiny picker: "Swap a seat" / "Move the whole block" / "Change a meal" — each launches the matching existing modal with `behalfOf` set.
7. Notify toggle in each editing modal — default ON. When ON, calls a new `delegate.js` action `notify_seat_change` after the edit succeeds, which sends a templated RCS+email: "Jason updated your seats — here's the new lineup."

### Composite-key discipline

Every write path under Phase C must bind `theater_id`, `showing_number`, `row_label`, `seat_num` together. This is the May 11 Tanner Clinic lesson — UNIQUE constraints do not enforce supply, the DB silently defaults missing columns. Spec calls for a single helper `bindSeatKey(stmt, seat)` to keep the binding shape consistent across pick.js and any new endpoint.

### Catering lockout

Soft warning in the edit modals when current time is within 72 hours of `gala_start`. Hard stop on meal changes after that point — instead, change is queued in `sponsor_actions_log` with status `pending-standby`. Not in MVP unless Scott calls for it.

### Open questions (need answers before implementation)

1. **Should the delegate's portal show a banner when their seats were edited by the sponsor?** ("Jason adjusted your seats on May 18 — review here.") Pro: trust. Con: more surface area, more "did they really mean it" support.
2. **Per-edit notify toggle vs sponsor-wide setting?** Right now the demo had per-edit. Sponsor-wide simpler but less situational.
3. **Reclaim + re-invite as the fallback for delegations who never opened the link?** This already works today — Phase C only matters for delegations who *did* open and *did* place.

---

## Files touched (Phase A + B)

```
functions/api/gala/portal/[token]/delegate.js   — +imports, +push_tickets action, +sendDelegationTicketPush
src/portal-v2/DelegationManageModal.jsx         — +tickets section, +push action, +TicketLine, +SplitBlockPill
src/portal-v2/PortalShell.jsx                   — pass assignments+showtimes through
docs/PLAN-sponsor-see-guest-tickets.md          — this file
```

## Verification

1. Build: `npm run build` — all three Vite targets pass (verified 2026-05-18).
2. Smoke test against Wicko Waypoint (sponsor 89, token `sxnhcj7axdrllaku` per memory — verify against live D1 first since tokens rotate):
   - Open `gala.daviskids.org/sponsor/{token}` → Guests tab.
   - Tap any guest with placed seats. "Their tickets" section should render with movie/showtime/seat/dinner per row.
   - Tap "🎟️ Push tickets to guest" → SMS + email arrive at delegate's contact info.
3. Cross-check live D1 for the `sponsor_invites` audit row with channel `sms-push` / `email-push`.
4. The `Manage Invite` modal on a delegation with **zero** placements should still work — tickets section just doesn't render.
