import React, { useEffect, useMemo, useState } from 'react';
import { adaptTheater, SeatMap } from '../../portal/SeatEngine.jsx';
import { claimSeat, releaseSeat } from './api.js';
import { loadLayouts, theaterRaw } from './layouts.js';

const sid = (a) => `${a.row_label}-${a.seat_num}`;

/**
 * Scoped seat-map for one sponsor + one showing in one auditorium.
 * Their seats start selected; deselect to release, tap open seats to claim.
 * Apply runs claims (hold+finalize) then releases (unfinalize), each through
 * the guarded portal endpoint. Stops + reports on the first seat that fails.
 */
export function SeatChangeModal({ token, theaterId, showing, movieTitle, taken, mySeats, onClose, onDone, onToast }) {
  const [layoutTheater, setLayoutTheater] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [selected, setSelected] = useState(() => new Set(mySeats.map(sid)));
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let off = false;
    loadLayouts()
      .then(d => {
        if (off) return;
        const raw = theaterRaw(d, theaterId);
        if (!raw) { setLoadErr(`No layout for theater ${theaterId}`); return; }
        setLayoutTheater(adaptTheater(raw));
      })
      .catch(e => { if (!off) setLoadErr(e.message); });
    return () => { off = true; };
  }, [theaterId]);

  const assignedSelf = useMemo(() => new Set(mySeats.map(sid)), [mySeats]);
  const assignedOther = useMemo(() => new Set(taken.map(sid)), [taken]);

  const myIds = useMemo(() => new Set(mySeats.map(sid)), [mySeats]);
  const toClaim = useMemo(() => [...selected].filter(id => !myIds.has(id)), [selected, myIds]);
  const toRelease = useMemo(() => [...myIds].filter(id => !selected.has(id)), [myIds, selected]);
  const dirty = toClaim.length > 0 || toRelease.length > 0;

  const onSelect = (ids) => {
    // ids arrive loveseat-partner-expanded from SeatMap. Toggle them as a group,
    // but never allow selecting a seat taken by someone else.
    setSelected(prev => {
      const next = new Set(prev);
      const blocked = ids.some(id => assignedOther.has(id));
      if (blocked) return prev;
      const allOn = ids.every(id => next.has(id));
      for (const id of ids) { if (allOn) next.delete(id); else next.add(id); }
      return next;
    });
  };

  const idToSeat = (id) => {
    const [row_label, seat_num] = id.split('-');
    return { theater_id: theaterId, showing_number: showing, row_label, seat_num };
  };

  const apply = async () => {
    setApplying(true);
    let claimed = 0, released = 0;
    try {
      for (const id of toClaim) {
        await claimSeat(token, idToSeat(id));
        claimed++;
      }
      for (const id of toRelease) {
        await releaseSeat(token, idToSeat(id));
        released++;
      }
      onToast?.({ kind: 'success', text: `Updated seats (+${claimed}, -${released})` });
      onDone?.();
    } catch (e) {
      onToast?.({ kind: 'error', text: `Stopped: ${e.message} (applied +${claimed}, -${released})` });
      onDone?.(); // refresh so the card reflects whatever did apply
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="gs-modal-bg" onClick={applying ? undefined : onClose}>
      <div className="gs-modal gs-seatmodal" onClick={e => e.stopPropagation()}>
        <div className="gs-modal-h">
          <div className="gs-modal-title">Change seats — {movieTitle} · Showing {showing}</div>
          {!applying && <button className="gs-modal-close" onClick={onClose} aria-label="Close">×</button>}
        </div>

        <div className="gs-seatmodal-body">
          {loadErr && <div className="gs-seats-empty">Couldn't load the map: {loadErr}</div>}
          {!loadErr && !layoutTheater && <div className="gs-seats-loading">Loading auditorium…</div>}
          {layoutTheater && (
            <>
              <div className="gs-seatmodal-help">
                Their seats are selected. Tap an open seat to add it; tap one of their seats to give it up.
                Greyed seats are taken by other sponsors.
              </div>
              <div className="gs-seatmodal-map">
                <SeatMap
                  theater={layoutTheater}
                  assignedSelf={assignedSelf}
                  assignedOther={assignedOther}
                  selected={selected}
                  onSelect={onSelect}
                  showSeatNumbers
                />
              </div>
            </>
          )}
        </div>

        <div className="gs-seatmodal-foot">
          <div className="gs-seatmodal-summary">
            {dirty
              ? <>Adding <strong>{toClaim.length}</strong> · giving up <strong>{toRelease.length}</strong></>
              : 'No changes yet'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="gs-btn" onClick={onClose} disabled={applying}>Cancel</button>
            <button className="gs-btn gs-btn-primary" onClick={apply} disabled={!dirty || applying}>
              {applying ? 'Applying…' : 'Apply changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
