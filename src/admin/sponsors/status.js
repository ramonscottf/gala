/**
 * Status derivation for sponsors.
 *
 * Each sponsor moves through a pipeline:
 *   pending → invited → opened → clicked → picking → complete
 *
 * Plus terminal states:
 *   bounced   (email bounced — needs new contact)
 *   complained (recipient marked spam — do not retry)
 *
 * Plus stalled states (started a step but no movement in N hours):
 *   stalled-clicked  (clicked email, never picked seats)
 *   stalled-picking  (picked some seats, never finalized)
 *
 * Inputs come from the /sponsors-with-tracking API:
 *   - rsvp_status            — sponsors table column ('pending'/'invited'/'completed'/'declined')
 *   - rsvp_completed_at      — set by portal when sponsor finalizes
 *   - seats_assigned         — count from seat_assignments
 *   - last_assigned_at       — most recent seat-assignment timestamp
 *   - tracking_summary       — aggregated email events
 *   - last_send              — most recent marketing_send_log row
 */

const HOURS = 60 * 60 * 1000;
const STALL_PICKING_HOURS = 48;
const STALL_CLICKED_HOURS = 72;

export function deriveStatus(s) {
  const ts = s.tracking_summary || {};

  // Terminal: complete
  if (s.rsvp_status === 'completed' || s.rsvp_completed_at) {
    return { code: 'complete', label: 'Selected seats ✓' };
  }

  // Terminal: bounced/complained
  if (ts.bounced_at) {
    return { code: 'bounced', label: 'Email bounced' };
  }
  if (ts.complained_at) {
    return { code: 'bounced', label: 'Marked spam' };
  }

  // Stalled: picking but no movement
  if (s.seats_assigned > 0 && s.seats_assigned < (s.seats_purchased || 0)) {
    const lastPick = s.last_assigned_at ? new Date(s.last_assigned_at + 'Z').getTime() : 0;
    if (lastPick > 0 && Date.now() - lastPick > STALL_PICKING_HOURS * HOURS) {
      return { code: 'stalled', label: 'Stalled · picking' };
    }
    return { code: 'picking', label: `Picking · ${s.seats_assigned}/${s.seats_purchased}` };
  }

  // Stalled: clicked but no pick
  if (ts.clicked_at) {
    const lastClick = new Date(ts.clicked_at + 'Z').getTime();
    if (Date.now() - lastClick > STALL_CLICKED_HOURS * HOURS) {
      return { code: 'stalled', label: 'Stalled · clicked' };
    }
    return { code: 'clicked', label: 'Clicked link' };
  }

  // Engaged: opened
  if (ts.opened_at) {
    return { code: 'opened', label: `Opened ${ts.opened_count > 1 ? `· ${ts.opened_count}x` : ''}`.trim() };
  }

  // Sent: invited
  if (ts.sent_at || s.rsvp_status === 'invited') {
    return { code: 'invited', label: 'Invited' };
  }

  return { code: 'pending', label: 'Not invited' };
}

/**
 * Mini pipeline pill state. Returns one of:
 *   'todo'   — gray, hasn't happened
 *   'done'   — green, completed
 *   'warn'   — red, started but stalled
 *   'active' — blue, current state
 */
export function pipelineState(s) {
  const ts = s.tracking_summary || {};
  const status = deriveStatus(s);

  const inviteDone = !!(ts.sent_at || s.rsvp_status === 'invited' || s.rsvp_status === 'completed' || s.rsvp_completed_at);
  const openedDone = !!ts.opened_at;
  const clickedDone = !!ts.clicked_at;
  const pickedDone = (s.seats_assigned || 0) > 0;
  const finalizedDone = s.rsvp_status === 'completed' || !!s.rsvp_completed_at;

  // Stalled markers — if status is stalled, the relevant step is warn.
  const isStalled = status.code === 'stalled';

  return {
    invite: inviteDone ? 'done' : 'todo',
    opened: openedDone ? 'done' : (inviteDone ? 'todo' : 'todo'),
    clicked: clickedDone
      ? 'done'
      : (isStalled && openedDone && !clickedDone) ? 'warn' : 'todo',
    picked: pickedDone
      ? (finalizedDone ? 'done' : (isStalled ? 'warn' : 'active'))
      : (isStalled ? 'warn' : 'todo'),
    finalized: finalizedDone ? 'done' : 'todo',
  };
}

/**
 * Sort key — stalled first, then in-progress, then complete, then pending.
 * Within each group, most-recently-active first.
 */
export function statusOrder(s) {
  const code = deriveStatus(s).code;
  const order = {
    'stalled': 0,
    'bounced': 1,
    'picking': 2,
    'clicked': 3,
    'opened': 4,
    'invited': 5,
    'pending': 6,
    'complete': 7,
  };
  return order[code] ?? 99;
}

export function lastActivityAt(s) {
  const ts = s.tracking_summary || {};
  return ts.last_event_at || s.last_assigned_at || ts.sent_at || s.updated_at || s.created_at || '';
}
