import React, { useMemo, useState } from 'react';
import { adaptTheater, autoPickBlock } from '../../portal/SeatEngine.jsx';
import { loadLayouts, theaterRaw } from './layouts.js';
import { claimSeat, releaseSeat } from './api.js';

const sid = (a) => `${a.row_label}-${a.seat_num}`;

/**
 * Move a sponsor's whole group from one showing to another.
 * Same-theater target keeps their exact seat numbers when those seats are free;
 * cross-theater (or conflicting) targets auto-pick a contiguous block in the
 * target room (admin can fine-tune afterward via "Change seats").
 * Apply: claim target seats (hold+finalize) then release source seats
 * (unfinalize), each through the guarded portal endpoint. Stop + report on
 * first failure, then reload.
 */
export function MoveShowModal({
  token, sourceTheaterId, sourceShowing, sourceMovieTitle, mySeats,
  showtimes, allAssignments, allHolds, myToken,
  onClose, onDone, onToast,
}) {
  const [targetKey, setTargetKey] = useState('');
  const [plan, setPlan] = useState(null);     // { sameSeats, targetSeats: [{row_label,seat_num}], note, blocked }
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);

  const N = mySeats.length;

  // Other showings, excluding the source slot.
  const options = useMemo(() => {
    const seen = new Set();
    return (showtimes || [])
      .filter(s => !(Number(s.theater_id) === Number(sourceTheaterId) && Number(s.showing_number) === Number(sourceShowing)))
      .map(s => ({
        key: `${s.theater_id}:${s.showing_number}`,
        theaterId: s.theater_id,
        showing: s.showing_number,
        label: `${s.movie_title || 'Untitled'} · Showing ${s.showing_number} · Theater ${s.theater_id}`,
      }))
      .filter(o => (seen.has(o.key) ? false : seen.add(o.key)));
  }, [showtimes, sourceTheaterId, sourceShowing]);

  const takenSetFor = (theaterId, showing) => {
    const inScope = (x) => Number(x.theater_id) === Number(theaterId) && Number(x.showing_number || 1) === Number(showing);
    const ids = new Set();
    (allAssignments || []).filter(inScope).forEach(a => ids.add(sid(a)));
    (allHolds || []).filter(h => inScope(h) && h.held_by_token !== myToken).forEach(h => ids.add(sid(h)));
    return ids;
  };

  const choose = async (key) => {
    setTargetKey(key);
    setPlan(null);
    if (!key) return;
    const opt = options.find(o => o.key === key);
    if (!opt) return;
    setPlanning(true);
    try {
      const taken = takenSetFor(opt.theaterId, opt.showing);
      const sameTheater = Number(opt.theaterId) === Number(sourceTheaterId);

      // Same theater: try to keep their exact seats.
      if (sameTheater) {
        const conflicts = mySeats.filter(s => taken.has(sid(s)));
        if (conflicts.length === 0) {
          setPlan({
            sameSeats: true,
            targetTheaterId: opt.theaterId,
            targetShowing: opt.showing,
            targetSeats: mySeats.map(s => ({ row_label: s.row_label, seat_num: String(s.seat_num) })),
            note: 'Same seats, later/earlier showing.',
          });
          return;
        }
      }

      // Otherwise auto-pick a contiguous block in the target room.
      const layouts = await loadLayouts();
      const raw = theaterRaw(layouts, opt.theaterId);
      if (!raw) { setPlan({ blocked: true, note: `No layout for theater ${opt.theaterId}.` }); return; }
      const adapted = adaptTheater(raw);
      const ids = autoPickBlock(adapted, N, taken);
      if (!ids || ids.length < N) {
        setPlan({ blocked: true, note: `Couldn't auto-place ${N} seats together in Theater ${opt.theaterId}. Move a smaller group, or move then use "Change seats" to place them.` });
        return;
      }
      setPlan({
        sameSeats: false,
        targetTheaterId: opt.theaterId,
        targetShowing: opt.showing,
        targetSeats: ids.map(id => { const [r, n] = id.split('-'); return { row_label: r, seat_num: n }; }),
        note: sameTheater
          ? `Some of their seats are taken in that showing — auto-picked ${N} open seats instead.`
          : `Different auditorium — auto-picked ${N} seats. You can fine-tune with "Change seats" after.`,
      });
    } catch (e) {
      setPlan({ blocked: true, note: e.message });
    } finally {
      setPlanning(false);
    }
  };

  const apply = async () => {
    if (!plan || plan.blocked) return;
    setApplying(true);
    let claimed = 0, released = 0;
    try {
      for (const s of plan.targetSeats) {
        await claimSeat(token, { theater_id: plan.targetTheaterId, showing_number: plan.targetShowing, row_label: s.row_label, seat_num: s.seat_num });
        claimed++;
      }
      for (const s of mySeats) {
        await releaseSeat(token, { theater_id: sourceTheaterId, showing_number: sourceShowing, row_label: s.row_label, seat_num: String(s.seat_num) });
        released++;
      }
      onToast?.({ kind: 'success', text: `Moved ${released} seat${released !== 1 ? 's' : ''} to the new showing` });
      onDone?.();
    } catch (e) {
      onToast?.({ kind: 'error', text: `Stopped: ${e.message} (claimed ${claimed}, released ${released}). Card refreshed.` });
      onDone?.();
    } finally {
      setApplying(false);
    }
  };

  const targetSeatLabel = plan && plan.targetSeats
    ? plan.targetSeats.map(s => `${s.row_label}${s.seat_num}`).join(', ')
    : '';

  return (
    <div className="gs-modal-bg" onClick={applying ? undefined : onClose}>
      <div className="gs-modal gs-movemodal" onClick={e => e.stopPropagation()}>
        <div className="gs-modal-h">
          <div className="gs-modal-title">Move to another show</div>
          {!applying && <button className="gs-modal-close" onClick={onClose} aria-label="Close">×</button>}
        </div>

        <div className="gs-movemodal-body">
          <div className="gs-move-from">
            Moving <strong>{N}</strong> seat{N !== 1 ? 's' : ''} from{' '}
            <strong>{sourceMovieTitle} · Showing {sourceShowing}</strong>{' '}
            ({mySeats.map(s => `${s.row_label}${s.seat_num}`).join(', ')})
          </div>

          <label className="gs-label" style={{ marginTop: 12 }}>Move to</label>
          <select className="gs-select" value={targetKey} onChange={e => choose(e.target.value)} disabled={applying}>
            <option value="">Choose a showing…</option>
            {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>

          <div className="gs-move-plan">
            {planning && <span className="gs-seats-loading">Checking availability…</span>}
            {!planning && plan && plan.blocked && (
              <div className="gs-seats-empty">{plan.note}</div>
            )}
            {!planning && plan && !plan.blocked && (
              <div className="gs-move-ok">
                <div><strong>New seats:</strong> {targetSeatLabel} (Theater {plan.targetTheaterId}, Showing {plan.targetShowing})</div>
                <div className="gs-move-note">{plan.note}</div>
              </div>
            )}
          </div>
        </div>

        <div className="gs-movemodal-foot">
          <button className="gs-btn" onClick={onClose} disabled={applying}>Cancel</button>
          <button className="gs-btn gs-btn-primary" onClick={apply} disabled={!plan || plan.blocked || applying}>
            {applying ? 'Moving…' : 'Move seats'}
          </button>
        </div>
      </div>
    </div>
  );
}
