# 2026-05-27 — Sponsor delegate failure for fully-placed sponsors

## What happened

Sponsors who had already finalized all of their seats themselves (via the
sponsor portal seat picker) could not invite a guest via the "per-seat
invite" flow. The Invite-a-guest sheet either showed **"Only 0 seats
available to delegate"** or failed silently with **"Load failed"** after
the validation rejected the POST.

17 sponsors were affected at the moment of detection — every sponsor whose
`SUM(seat_assignments WHERE sponsor_id = X AND delegation_id IS NULL) =
seats_purchased` and `SUM(sponsor_delegations.seats_allocated) = 0`. Most
prominent: Carver/Florek/James (20 seats), Tanner Clinic (22), VCBO (14),
Chevron (14). Scott was unable to gift himself a seat from any of these
portals because the same wall hit every token.

## Root cause

The May 10 commit `1906163` ("feat(portal): per-seat invite shows giveable
block") let the sponsor UI render seats they had already placed as
*giveable pills* — the sponsor could tap E8 and the invite sheet would
preselect E8, E9, E10 as the seats Scott Foster would receive. The UI
correctly bypassed the `seats <= available` validation on the client
(seatPills mode passes `valid = true`).

The matching backend change was never made. `functions/api/gala/portal/
[token]/delegate.js` still enforced `seats > math.available` where
`available = total - placedDirect - delegatedAllocated`. For any sponsor
who placed all their tickets first and tried to invite second,
`placedDirect = total` and `available = 0`, so every per-seat invite
returned `400 Only 0 seats available to delegate`.

The classifier on this failure mode is simple: **the UI shipped a new
shape without the backend learning the new shape**. The contract between
them silently went out of sync.

## The fix

`/api/gala/portal/[token]/delegate` now accepts an optional
`seat_transfer` field on the create-delegation body:

```json
{
  "delegate_name": "Scott Foster",
  "delegate_phone": "...",
  "delegate_email": "...",
  "seats_allocated": 3,
  "seat_transfer": [
    { "theater_id": 13, "row_label": "E", "seat_num": "8" },
    { "theater_id": 13, "row_label": "E", "seat_num": "9" },
    { "theater_id": 13, "row_label": "E", "seat_num": "10" }
  ]
}
```

When `seat_transfer` is present:

- Each entry is validated to belong to the calling sponsor with
  `delegation_id IS NULL`. Anything that doesn't match is rejected with a
  per-seat error (e.g. `Seat E14 (theater 13) is already assigned to a
  guest — reclaim that guest first`).
- `seats_allocated >= seat_transfer.length` is enforced.
- The budget check becomes `netNew = seats_allocated - seat_transfer.
  length` and `netNew > math.available` is the new rejection
  condition. Over-allocation is still caught (e.g. `seats_allocated=25`
  with `transfer.length=3` and `available=0` still rejects).
- After the `sponsor_delegations` INSERT, the handler updates
  `seat_assignments` in place — `delegation_id` set, `guest_name`
  recomposed to `"<Parent Company> / <Delegate Name>"` (same format
  `/assign` and `pick.js` already use). Each transfer is logged in
  `sponsor_actions_log` with `action='seat_transferred'`.
- The response includes `transferredCount` so the client can detect
  partial transfers.

`src/portal/Portal.jsx`'s `DelegateForm.submit()` now constructs
`seat_transfer` from:

- **Mode B** (specific `seatPills` + `theaterId`): all selected pills go
  in, all in the same theater.
- **Hybrid Mode A** (`assignableSeats` with `selectedAssignable`): each
  entry carries its own `theaterId`, so transfers can span auditoriums.
- Otherwise undefined — pure Mode A keeps the old behavior.

The pre-existing post-create `/assign` call in `InviteModal.jsx` is left
in place. With the new flow it's a no-op (the seats already point at the
new `delegation_id`), but it remains a defense-in-depth safety net if
`seat_transfer` ever partial-succeeds.

## Backwards compatibility

Strictly additive. Old clients that don't send `seat_transfer` see the
exact same validation and behavior as before — every Mode-A delegation
that worked yesterday still works the same way today. The 17 sponsors
who could not previously delegate can now create per-seat invites
without any data-level intervention.

## Verification

- Before: `POST /api/gala/portal/c4fdabbffd11583320ddb1c75552b276/
  delegate {seats_allocated: 3}` → `400 Only 0 seats available to
  delegate`.
- After deploy: same call with `seat_transfer: [E-8, E-9, E-10]` → `200
  ok=true, transferredCount=3`. Seats now bear `delegation_id =
  <new id>` and `guest_name = "Carver, Florek James / Scott Foster"`.
- Sponsor portal `seatMath`: `placedDirect 20 → 17`, `delegated 0 → 3`,
  `available 0 → 0` (consistent).

## Prevention rule

When the UI grows a new mode that bypasses an existing validation, the
backend has to learn the new mode in the same change. Two specific
guardrails worth adopting:

1. **Treat client-side `valid = true ? true : ...` shortcuts as a flag.**
   If `seatPills ? true : seats <= available` lives in a form, the
   backend that the form posts to must understand `seatPills`. If it
   doesn't, the shortcut is just deferred validation that will fail at
   the API.
2. **The 5-day window between UI ship and bug surfacing was tier-driven
   — Carver/Florek didn't see this until Bronze opened on May 20.**
   Any change to the sponsor portal that adds a new mode should be QA'd
   against at least one sponsor who has already finalized every seat
   they own. Add a `qa/sponsor-finalized-then-delegates.spec.js` to the
   smoke run.
